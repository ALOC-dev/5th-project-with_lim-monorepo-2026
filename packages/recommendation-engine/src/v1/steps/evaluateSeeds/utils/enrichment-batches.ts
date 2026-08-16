import type { EngineConfig } from "../../../configs/types.js";
import type { UserInput } from "../../../interfaces/input.contracts.js";
import type { Logger } from "../../../observability/logger.js";
import { type ReferenceUrlResolution, toReferenceUrlLog } from "../tools/reference-urls.js";
import { assessClosure } from "./closure.js";
import {
  mergeEvidenceWithEnrichment,
  shouldRecommendByClosure,
  shouldRecommendByOperationHours,
} from "./enrichment-merge.js";
import type { CandidateEnrichment, CandidateEnrichmentRequest } from "./enrichment-types.js";
import type { CandidateScoringEvidence } from "./evidence.js";
import {
  assessSemanticFit,
  type ChainBrands,
  getSemanticScoreAdjustment,
} from "./semantic-fit.js";

export const ENRICHMENT_BATCH_SIZE = 10;

type EnrichCandidates = (
  request: CandidateEnrichmentRequest,
  logger: Logger,
) => Promise<CandidateEnrichment[]>;

type ResolveReferenceUrls = (
  evidences: CandidateScoringEvidence[],
  options?: { allowNaverFallback?: boolean },
) => Promise<ReferenceUrlResolution[]>;

type EnrichmentBatchLog = {
  batchNo: number;
  offset: number;
  evidenceCount: number;
  enrichmentCount: number;
  operationVerifiedCount: number;
  semanticPassedCount: number;
  semanticPenalizedCount: number;
  referenceVerifiedCount: number;
  referenceRejectedCount: number;
  selectedSoFar: number;
};

export type EnrichmentBatchCollection = {
  enrichments: CandidateEnrichment[];
  enrichedEvidences: CandidateScoringEvidence[];
  referenceUrlResolutions: ReferenceUrlResolution[];
  semanticPenalizedCount: number;
  notSemanticallyEvaluatedDueToOperationUnknown: Array<{
    candidateId: string;
    source: CandidateEnrichment["source"];
    status: CandidateEnrichment["operationVerification"]["status"];
    reason: string;
  }>;
  operationVerifiedCount: number;
  referenceRejectedCount: number;
  evaluatedEvidenceCount: number;
  batches: EnrichmentBatchLog[];
};

export const collectEnrichmentBatches = async ({
  userInput,
  evidences,
  config,
  logger,
  enrichCandidates,
  resolveReferenceUrls,
  chainBrands = new Set<string>(),
}: {
  userInput: UserInput;
  evidences: CandidateScoringEvidence[];
  config: EngineConfig;
  logger: Logger;
  enrichCandidates: EnrichCandidates;
  resolveReferenceUrls: ResolveReferenceUrls;
  /** 그 동네에 지점이 여럿인 브랜드. 의미 판정에서 체인 여부를 가릴 때 쓴다. */
  chainBrands?: ChainBrands;
}): Promise<EnrichmentBatchCollection> => {
  const maxEvidenceCount = getMaxEvidenceCount(evidences.length, config);
  const scoringPoolSize = getScoringPoolSize(config);
  const allEnrichments: CandidateEnrichment[] = [];
  const selectedEvidences: CandidateScoringEvidence[] = [];
  const allReferenceUrlResolutions: ReferenceUrlResolution[] = [];
  let semanticPenalizedCount = 0;
  const notSemanticallyEvaluatedDueToOperationUnknown: EnrichmentBatchCollection["notSemanticallyEvaluatedDueToOperationUnknown"] =
    [];
  const batches: EnrichmentBatchLog[] = [];
  /** 카카오로 참조 URL을 못 찾은 후보. 끝까지 모자라면 여기서 구제한다. */
  const unreferencedEvidences: CandidateScoringEvidence[] = [];
  let operationVerifiedCount = 0;
  let referenceRejectedCount = 0;
  let evaluatedEvidenceCount = 0;

  for (
    let offset = 0, batchNo = 1;
    offset < maxEvidenceCount && selectedEvidences.length < scoringPoolSize;
    offset += ENRICHMENT_BATCH_SIZE, batchNo += 1
  ) {
    const batchEvidences = evidences.slice(offset, offset + ENRICHMENT_BATCH_SIZE);
    evaluatedEvidenceCount += batchEvidences.length;
    logger.info("evaluateSeeds.enrichment.batch.start", {
      batchNo,
      offset,
      evidenceCount: batchEvidences.length,
      selectedSoFar: selectedEvidences.length,
      maxEvidenceCount,
      scoringPoolSize,
    });

    // 참조 URL을 **조사보다 먼저** 확인한다.
    //
    // 출력 계약은 지도 링크가 없는 후보를 아예 받지 않는다. 그런데 예전에는
    // 조사(카카오 상세 스크랩 + 네이버 지도 스크랩 + 웹 검색, 후보당 3~5초)를
    // 다 끝낸 뒤에야 참조를 확인하고 버렸다. 실측에서 조사한 40건 중 9~10건이
    // 그렇게 버려졌다 — 순수한 낭비다. 카카오 확인은 REST 한두 번이라 싸다.
    const finishReferenceUrls = logger.startTimer("evaluateSeeds.reference_urls.success");
    const preReferenceResolutions = await resolveReferenceUrls(batchEvidences);
    allReferenceUrlResolutions.push(...preReferenceResolutions);
    const referencedEvidences = preReferenceResolutions
      .filter(hasReferenceUrls)
      .map((resolution) => resolution.evidence);
    const preReferenceRejected = preReferenceResolutions.filter(
      (resolution) => !resolution.referenceUrls,
    );
    referenceRejectedCount += preReferenceRejected.length;
    unreferencedEvidences.push(
      ...preReferenceRejected.map((resolution) => resolution.evidence),
    );
    finishReferenceUrls({
      batchNo,
      evidenceCount: batchEvidences.length,
      verifiedCount: referencedEvidences.length,
      rejectedCount: preReferenceRejected.length,
      results: preReferenceResolutions.map((resolution) => ({
        candidateId: resolution.evidence.candidateId,
        name: resolution.evidence.name,
        ...toReferenceUrlLog(resolution),
      })),
    });

    if (referencedEvidences.length === 0) {
      batches.push({
        batchNo,
        offset,
        evidenceCount: batchEvidences.length,
        enrichmentCount: 0,
        operationVerifiedCount: 0,
        semanticPassedCount: 0,
        semanticPenalizedCount: 0,
        referenceVerifiedCount: 0,
        referenceRejectedCount: preReferenceRejected.length,
        selectedSoFar: selectedEvidences.length,
      });
      continue;
    }

    const batchEnrichments = await enrichCandidates(
      { userInput, evidences: referencedEvidences },
      logger,
    );
    allEnrichments.push(...batchEnrichments);
    const enrichmentByCandidateId = new Map(
      batchEnrichments.map((enrichment) => [enrichment.candidateId, enrichment]),
    );

    // 폐업 신호가 있으면 영업시간 판정과 무관하게 먼저 제외한다.
    const closedCandidates = batchEnrichments.filter(
      (enrichment) => !shouldRecommendByClosure(enrichment),
    );
    if (closedCandidates.length > 0) {
      logger.warn("evaluateSeeds.closure_gate.rejected", {
        batchNo,
        rejectedCount: closedCandidates.length,
        rejected: closedCandidates.map((enrichment) => ({
          candidateId: enrichment.candidateId,
          signals: assessClosure(enrichment).signals,
        })),
      });
    }
    const closedCandidateIds = new Set(
      closedCandidates.map((enrichment) => enrichment.candidateId),
    );

    // 영업시간을 확인하지 못한 후보(UNKNOWN)도 버리지 않고 함께 들고 간다.
    // 다만 요청 시각에 닫혀 있다고 확인된 후보(CLOSED)는 제외한다. 그건 근거가
    // 있는 판정이라 추천하면 안 된다.
    const operationVerifiedEvidences = referencedEvidences.flatMap((evidence) => {
      const enrichment = enrichmentByCandidateId.get(evidence.candidateId);
      if (!enrichment) return [];
      if (closedCandidateIds.has(enrichment.candidateId)) return [];
      if (enrichment.operationVerification.status === "CLOSED") return [];

      const merged = mergeEvidenceWithEnrichment(evidence, enrichment);
      return [
        shouldRecommendByOperationHours(enrichment)
          ? merged
          : { ...merged, operationUnverified: true },
      ];
    });
    operationVerifiedCount += operationVerifiedEvidences.filter(
      (evidence) => !evidence.operationUnverified,
    ).length;
    notSemanticallyEvaluatedDueToOperationUnknown.push(
      ...batchEnrichments
        .filter((enrichment) => !shouldRecommendByOperationHours(enrichment))
        .map((enrichment) => ({
          candidateId: enrichment.candidateId,
          source: enrichment.source,
          status: enrichment.operationVerification.status,
          reason: enrichment.operationVerification.reason,
        })),
    );

    const semanticAssessments = operationVerifiedEvidences.map((evidence) => ({
      evidence,
      semanticFit: assessSemanticFit(evidence, chainBrands),
    }));
    // 의미 게이트는 후보를 탈락시키지 않고 감점만 한다(rejected는 항상 비어 있다).
    // 예전에는 빈 배열을 만들어 넘기고 로그에 `rejectedCount: 0`을 찍어, 지표를
    // 보는 사람이 "탈락이 하나도 없다"고 오해하게 만들었다.
    const semanticPassed = semanticAssessments.map(({ evidence, semanticFit }) => ({
      ...evidence,
      semanticFit,
    }));
    const semanticPenalized = semanticAssessments.filter(
      ({ semanticFit }) => semanticFit.status === "PENALIZE",
    );
    semanticPenalizedCount += semanticPenalized.length;

    logger.info("evaluateSeeds.semantic_gate.filtered", {
      batchNo,
      evaluatedCount: semanticAssessments.length,
      passedCount: semanticPassed.length,
      penalizedCount: semanticPenalized.length,
      penalized: semanticPenalized.map(({ evidence, semanticFit }) => ({
        candidateId: evidence.candidateId,
        name: evidence.name,
        category: evidence.category,
        status: semanticFit.status,
        severity: semanticFit.severity,
        score: semanticFit.score,
        reason: semanticFit.reason,
        negativeSignals: semanticFit.negativeSignals,
        ...getSemanticScoreAdjustment(semanticFit),
      })),
    });

    // 참조 URL은 배치 시작 때 이미 확인했다. 여기까지 온 후보는 전부 지도 링크가 있다.
    selectedEvidences.push(...semanticPassed);

    const batchLog = {
      batchNo,
      offset,
      evidenceCount: batchEvidences.length,
      enrichmentCount: batchEnrichments.length,
      operationVerifiedCount: operationVerifiedEvidences.length,
      semanticPassedCount: semanticPassed.length,
      semanticPenalizedCount: semanticPenalized.length,
      referenceVerifiedCount: referencedEvidences.length,
      referenceRejectedCount: preReferenceRejected.length,
      selectedSoFar: selectedEvidences.length,
    };
    batches.push(batchLog);
    logger.info("evaluateSeeds.enrichment.batch.success", batchLog);
  }

  // 카카오만으로 목표 개수를 못 채웠을 때만 비싼 네이버 경로를 연다.
  //
  // 평소에 이걸 켜두면 실측 기준 70초를 쓰고도 최종 추천에 한 건도 못 넣었다.
  // 반대로 아예 없애면 카카오에 없는 동네에서 결과가 비는 위험이 생긴다.
  // 그래서 "정말 모자랄 때만" 켠다.
  if (selectedEvidences.length < config.targetCount && unreferencedEvidences.length > 0) {
    const rescued = await rescueWithNaverFallback({
      userInput,
      evidences: unreferencedEvidences,
      shortfall: config.targetCount - selectedEvidences.length,
      logger,
      enrichCandidates,
      resolveReferenceUrls,
      chainBrands,
    });
    allEnrichments.push(...rescued.enrichments);
    allReferenceUrlResolutions.push(...rescued.referenceUrlResolutions);
    // 앞 단계에서 거절로 세어 둔 후보가 여기서 살아났으므로 되돌린다.
    referenceRejectedCount -= rescued.evidences.length;
    selectedEvidences.push(...rescued.evidences);
  }

  return {
    enrichments: allEnrichments,
    // 영업시간이 확인된 후보를 앞에, 미확인 후보를 뒤에 둔다. scoringPoolSize를
    // 넘는 만큼은 잘리므로, 확인된 후보가 충분하면 미확인은 자연스럽게 빠진다.
    enrichedEvidences: [
      ...selectedEvidences.filter((evidence) => !evidence.operationUnverified),
      ...selectedEvidences.filter((evidence) => evidence.operationUnverified),
    ].slice(0, scoringPoolSize),
    referenceUrlResolutions: allReferenceUrlResolutions,
    semanticPenalizedCount,
    notSemanticallyEvaluatedDueToOperationUnknown,
    operationVerifiedCount,
    referenceRejectedCount,
    evaluatedEvidenceCount,
    batches,
  };
};

/**
 * 카카오로 확인 못 한 후보를 네이버 지도까지 뒤져 살려낸다.
 *
 * 부족분보다 넉넉히 잡아 시도하되, 무한정 늘리지는 않는다. 이 경로는 후보마다
 * Playwright로 지도를 여러 번 긁으므로 한 건당 수 초가 든다.
 */
const rescueWithNaverFallback = async ({
  userInput,
  evidences,
  shortfall,
  logger,
  enrichCandidates,
  resolveReferenceUrls,
  chainBrands,
}: {
  userInput: UserInput;
  evidences: CandidateScoringEvidence[];
  shortfall: number;
  logger: Logger;
  enrichCandidates: EnrichCandidates;
  resolveReferenceUrls: ResolveReferenceUrls;
  chainBrands: ChainBrands;
}): Promise<{
  evidences: CandidateScoringEvidence[];
  enrichments: CandidateEnrichment[];
  referenceUrlResolutions: ReferenceUrlResolution[];
}> => {
  const attempted = evidences.slice(0, Math.min(evidences.length, shortfall * 2));
  const finish = logger.startTimer("evaluateSeeds.reference_urls.naver_rescue.success");
  logger.warn("evaluateSeeds.reference_urls.naver_rescue.start", {
    shortfall,
    attemptedCount: attempted.length,
    unreferencedCount: evidences.length,
  });

  const resolutions = await resolveReferenceUrls(attempted, { allowNaverFallback: true });
  const referenced = resolutions.filter(hasReferenceUrls).map((resolution) => resolution.evidence);
  if (referenced.length === 0) {
    finish({ rescuedCount: 0, attemptedCount: attempted.length });
    return {
      evidences: [],
      enrichments: [],
      referenceUrlResolutions: resolutions,
    };
  }

  // 구제한 후보도 영업시간과 폐업 판정은 똑같이 거쳐야 한다.
  const enrichments = await enrichCandidates({ userInput, evidences: referenced }, logger);
  const enrichmentByCandidateId = new Map(
    enrichments.map((enrichment) => [enrichment.candidateId, enrichment]),
  );
  const usable = referenced.flatMap((evidence) => {
    const enrichment = enrichmentByCandidateId.get(evidence.candidateId);
    if (!enrichment) return [];
    if (!shouldRecommendByClosure(enrichment)) return [];
    if (enrichment.operationVerification.status === "CLOSED") return [];

    const merged = mergeEvidenceWithEnrichment(evidence, enrichment);
    const withOperation = shouldRecommendByOperationHours(enrichment)
      ? merged
      : { ...merged, operationUnverified: true };
    return [{ ...withOperation, semanticFit: assessSemanticFit(withOperation, chainBrands) }];
  });

  finish({ rescuedCount: usable.length, attemptedCount: attempted.length });
  return {
    evidences: usable,
    enrichments,
    referenceUrlResolutions: resolutions,
  };
};

export const getMaxEvidenceCount = (evidenceCount: number, config: EngineConfig): number =>
  Math.min(
    evidenceCount,
    Math.max(ENRICHMENT_BATCH_SIZE, config.targetCount * config.candidatePoolMultiplier),
  );

/**
 * LLM 채점에 올릴 후보 수. 이 중에서 최종 `targetCount`개를 고른다.
 *
 * 예전에는 목표의 2배(10개 요청이면 20개)였다. 그런데 실측에서 **최종 선택된 10개의
 * 조사 순위가 매번 풀의 맨 끝까지 걸쳐 있었다** — 을지로 3,4,5,6,7,17,29,33,44,45 /
 * 중간지점 1,2,6,18,19,22,23,31,35,39. 마지막에 조사된 후보가 계속 최종에 든다는 건
 * 풀 경계가 결과를 자르고 있다는 뜻이다. 더 넓게 보면 더 나은 후보가 들어온다.
 *
 * 3배로 넓히면 채점과 조사 비용이 함께 늘지만, 실행 시간이 3~4분 예산 안에 있어
 * 그 여유를 선택의 질에 쓰는 편이 낫다.
 */
const SCORING_POOL_MULTIPLIER = 3;

const getScoringPoolSize = (config: EngineConfig): number =>
  config.scoringPoolSize ??
  Math.max(
    config.targetCount,
    Math.min(
      config.targetCount * SCORING_POOL_MULTIPLIER,
      config.targetCount * config.candidatePoolMultiplier,
    ),
  );

const hasReferenceUrls = (
  resolution: ReferenceUrlResolution,
): resolution is ReferenceUrlResolution & {
  referenceUrls: NonNullable<ReferenceUrlResolution["referenceUrls"]>;
} => resolution.referenceUrls !== undefined;
