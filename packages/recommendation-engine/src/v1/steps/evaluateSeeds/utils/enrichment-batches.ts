import type { EngineConfig } from "../../../configs/types.js";
import type { UserInput } from "../../../interfaces/input.contracts.js";
import type { Logger } from "../../../observability/logger.js";
import { type ReferenceUrlResolution, toReferenceUrlLog } from "../tools/reference-urls.js";
import {
  mergeEvidenceWithEnrichment,
  shouldRecommendByOperationHours,
} from "./enrichment-merge.js";
import type { CandidateEnrichment, CandidateEnrichmentRequest } from "./enrichment-types.js";
import type { CandidateScoringEvidence } from "./evidence.js";
import { assessSemanticFit, getSemanticScoreAdjustment } from "./semantic-fit.js";

export const ENRICHMENT_BATCH_SIZE = 10;

type EnrichCandidates = (
  request: CandidateEnrichmentRequest,
  logger: Logger,
) => Promise<CandidateEnrichment[]>;

type ResolveReferenceUrls = (
  evidences: CandidateScoringEvidence[],
) => Promise<ReferenceUrlResolution[]>;

type EnrichmentBatchLog = {
  batchNo: number;
  offset: number;
  evidenceCount: number;
  enrichmentCount: number;
  operationVerifiedCount: number;
  semanticPassedCount: number;
  semanticPenalizedCount: number;
  semanticRejectedCount: number;
  referenceVerifiedCount: number;
  referenceRejectedCount: number;
  selectedSoFar: number;
};

export type EnrichmentBatchCollection = {
  enrichments: CandidateEnrichment[];
  enrichedEvidences: CandidateScoringEvidence[];
  referenceUrlResolutions: ReferenceUrlResolution[];
  semanticPenalizedCount: number;
  semanticRejectedCount: number;
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
}: {
  userInput: UserInput;
  evidences: CandidateScoringEvidence[];
  config: EngineConfig;
  logger: Logger;
  enrichCandidates: EnrichCandidates;
  resolveReferenceUrls: ResolveReferenceUrls;
}): Promise<EnrichmentBatchCollection> => {
  const maxEvidenceCount = getMaxEvidenceCount(evidences.length, config);
  const scoringPoolSize = getScoringPoolSize(config);
  const allEnrichments: CandidateEnrichment[] = [];
  const selectedEvidences: CandidateScoringEvidence[] = [];
  const allReferenceUrlResolutions: ReferenceUrlResolution[] = [];
  let semanticPenalizedCount = 0;
  let semanticRejectedCount = 0;
  const notSemanticallyEvaluatedDueToOperationUnknown: EnrichmentBatchCollection["notSemanticallyEvaluatedDueToOperationUnknown"] =
    [];
  const batches: EnrichmentBatchLog[] = [];
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

    const batchEnrichments = await enrichCandidates(
      { userInput, evidences: batchEvidences },
      logger,
    );
    allEnrichments.push(...batchEnrichments);
    const enrichmentByCandidateId = new Map(
      batchEnrichments.map((enrichment) => [enrichment.candidateId, enrichment]),
    );

    const operationVerifiedEvidences = batchEvidences.flatMap((evidence) => {
      const enrichment = enrichmentByCandidateId.get(evidence.candidateId);
      if (!enrichment) return [];
      if (!shouldRecommendByOperationHours(enrichment)) return [];
      return [mergeEvidenceWithEnrichment(evidence, enrichment)];
    });
    operationVerifiedCount += operationVerifiedEvidences.length;
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
      semanticFit: assessSemanticFit(evidence),
    }));
    // 일반적인 업종 차이는 감점으로만 다루되, 사용자가 명시한 식문화/서울 권역과
    // 구조화된 후보 정보가 정면으로 충돌할 때는 참조 URL·LLM 점수까지 진행시키지 않는다.
    // 정보가 없거나 복수 지역/복수 식문화를 말한 요청은 REJECT가 아니라 PASS/PENALIZE다.
    const semanticPassed = semanticAssessments
      .filter(({ semanticFit }) => semanticFit.status !== "REJECT")
      .map(({ evidence, semanticFit }) => ({
        ...evidence,
        semanticFit,
      }));
    const semanticPenalized = semanticAssessments.filter(
      ({ semanticFit }) => semanticFit.status === "PENALIZE",
    );
    const semanticRejected = semanticAssessments.filter(
      ({ semanticFit }) => semanticFit.status === "REJECT",
    );
    semanticPenalizedCount += semanticPenalized.length;
    semanticRejectedCount += semanticRejected.length;

    logger.info("evaluateSeeds.semantic_gate.filtered", {
      batchNo,
      evaluatedCount: semanticAssessments.length,
      passedCount: semanticPassed.length,
      penalizedCount: semanticPenalized.length,
      rejectedCount: semanticRejected.length,
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
      rejected: semanticRejected.map(({ evidence, semanticFit }) => ({
        candidateId: evidence.candidateId,
        name: evidence.name,
        category: evidence.category,
        status: semanticFit.status,
        severity: semanticFit.severity,
        score: semanticFit.score,
        reason: semanticFit.reason,
        negativeSignals: semanticFit.negativeSignals,
      })),
    });

    const finishReferenceUrls = logger.startTimer("evaluateSeeds.reference_urls.success");
    logger.info("evaluateSeeds.reference_urls.start", {
      batchNo,
      evidenceCount: semanticPassed.length,
    });
    const referenceUrlResolutions = await resolveReferenceUrls(semanticPassed);
    allReferenceUrlResolutions.push(...referenceUrlResolutions);
    const batchReferenceRejectedCount = referenceUrlResolutions.filter(
      (resolution) => !resolution.referenceUrls,
    ).length;
    referenceRejectedCount += batchReferenceRejectedCount;
    const verified = referenceUrlResolutions
      .filter(hasReferenceUrls)
      .map((resolution) => resolution.evidence);
    selectedEvidences.push(...verified);
    finishReferenceUrls({
      batchNo,
      verifiedCount: verified.length,
      rejectedCount: batchReferenceRejectedCount,
      selectedSoFar: selectedEvidences.length,
      results: referenceUrlResolutions.map((resolution) => ({
        candidateId: resolution.evidence.candidateId,
        name: resolution.evidence.name,
        ...toReferenceUrlLog(resolution),
      })),
    });

    const batchLog = {
      batchNo,
      offset,
      evidenceCount: batchEvidences.length,
      enrichmentCount: batchEnrichments.length,
      operationVerifiedCount: operationVerifiedEvidences.length,
      semanticPassedCount: semanticPassed.length,
      semanticPenalizedCount: semanticPenalized.length,
      semanticRejectedCount: semanticRejected.length,
      referenceVerifiedCount: verified.length,
      referenceRejectedCount: batchReferenceRejectedCount,
      selectedSoFar: selectedEvidences.length,
    };
    batches.push(batchLog);
    logger.info("evaluateSeeds.enrichment.batch.success", batchLog);
  }

  return {
    enrichments: allEnrichments,
    enrichedEvidences: selectedEvidences.slice(0, scoringPoolSize),
    referenceUrlResolutions: allReferenceUrlResolutions,
    semanticPenalizedCount,
    semanticRejectedCount,
    notSemanticallyEvaluatedDueToOperationUnknown,
    operationVerifiedCount,
    referenceRejectedCount,
    evaluatedEvidenceCount,
    batches,
  };
};

export const getMaxEvidenceCount = (evidenceCount: number, config: EngineConfig): number =>
  Math.min(
    evidenceCount,
    Math.max(ENRICHMENT_BATCH_SIZE, config.targetCount * config.candidatePoolMultiplier),
  );

const getScoringPoolSize = (config: EngineConfig): number =>
  config.scoringPoolSize ??
  Math.max(
    config.targetCount,
    Math.min(config.targetCount * 2, config.targetCount * config.candidatePoolMultiplier),
  );

const hasReferenceUrls = (
  resolution: ReferenceUrlResolution,
): resolution is ReferenceUrlResolution & {
  referenceUrls: NonNullable<ReferenceUrlResolution["referenceUrls"]>;
} => resolution.referenceUrls !== undefined;
