import type { UserInput } from "../../interfaces/input.js";
import type { EngineConfig } from "../../configs/types.js";
import type { PlaceRecommendationItem } from "../../interfaces/output.js";
import type { Logger } from "../../observability/logger.js";
import type { DiscoverSeedsOutput } from "../discoverSeeds/index.js";
import { createAgenticWebEnrichmentClient } from "./llm/enrichment.js";
import {
  buildCandidateScoringEvidence,
  type CandidateScoringEvidence,
} from "./utils/evidence.js";
import {
  mergeEvidenceWithEnrichment,
  shouldRecommendByOperationHours,
} from "./utils/enrichment-merge.js";
import {
  assessSemanticFit,
  attachSemanticFit,
  getSemanticScoreAdjustment,
} from "./utils/semantic-fit.js";
import type {
  AgenticWebEnrichmentToolEvent,
  CandidateEnrichment,
  CandidateEnrichmentClient,
  CandidateEnrichmentRequest,
} from "./utils/enrichment-types.js";
import { createLocalFileUrlScrapeCache } from "./utils/scrape-cache.js";
import {
  toEvaluateSeedsFailure,
  toEvaluateSeedsLlmScoringFailure,
} from "./utils/failure.js";
import { buildRankedCandidates } from "./utils/ranking.js";
import {
  toEvaluateSeedsEvaluation,
  toPlaceRecommendationItem,
} from "./utils/output.js";
import {
  LlmCandidateEvaluationSchema,
  scoreCandidatesWithLlm,
  type LlmCandidateEvaluation,
  type LlmScoringClient,
} from "./llm/scoring.js";
import { loadPlaywright } from "./tools/shared/browser.js";
import {
  resolveCandidateReferenceUrls,
  toReferenceUrlLog,
  type ReferenceUrlResolution,
} from "./tools/reference-urls.js";
import type {
  PlaywrightBrowser,
  UrlScrapeResult,
} from "./tools/types.js";
import {
  EvaluateSeedsOutputSchema,
  type EvaluateSeedsEvaluation,
  type EvaluateSeedsProcessResult,
} from "./types.js";

export type {
  CandidateScoringEvidence,
  CandidateEnrichment,
  CandidateEnrichmentClient,
  LlmCandidateEvaluation,
  LlmScoringClient,
};
export { createAgenticWebEnrichmentClient };

// 외부 source 호출 결과를 디스크에 캐시한다. 모듈 레벨로 두어 request 간 공유.
const agenticFetchCache = createLocalFileUrlScrapeCache({
  namespace: "agentic-fetch",
});
const kakaoMapScrapeCache = createLocalFileUrlScrapeCache({
  namespace: "kakao-map",
});
const naverMapScrapeCache = createLocalFileUrlScrapeCache({
  namespace: "naver-map",
});

// Live enrichment 파라미터. agentic이 후보별 1회 LLM 호출로 source/tool을 자유 선택한다.
const LIVE_MAX_CANDIDATES = 10;
const LIVE_MAX_CONCURRENCY = 4;
const LIVE_MAX_FETCHES_PER_CANDIDATE = 2;
const LIVE_MAX_TOOL_STEPS = 10;
const LIVE_TIMEOUT_MS = 60_000;
const LIVE_SCRAPE_TIMEOUT_MS = 8_000;
const LIVE_SCRAPE_SETTLE_MS = 750;
const LIVE_REFERENCE_URL_CONCURRENCY = 4;

// agentic client는 request마다 만든다 — onToolEvent가 request-scoped logger를 캡처해야 하기 때문.
// browser/cache 인스턴스는 모듈 레벨 cache로 공유하므로 생성 비용은 무시할 수준.
const buildLiveEnrichmentClient = (logger: Logger): CandidateEnrichmentClient =>
  createAgenticWebEnrichmentClient({
    maxCandidates: LIVE_MAX_CANDIDATES,
    maxConcurrency: LIVE_MAX_CONCURRENCY,
    maxFetchesPerCandidate: LIVE_MAX_FETCHES_PER_CANDIDATE,
    maxToolSteps: LIVE_MAX_TOOL_STEPS,
    timeoutMs: LIVE_TIMEOUT_MS,
    scrapeTimeoutMs: LIVE_SCRAPE_TIMEOUT_MS,
    scrapeSettleMs: LIVE_SCRAPE_SETTLE_MS,
    fetchCache: agenticFetchCache,
    kakaoScrapeCache: kakaoMapScrapeCache,
    kakaoScrapePlaceDetails: false,
    naverMapScrapeCache,
    onToolEvent: (event) => logAgenticToolEvent(logger, event),
    logger,
  });

const enrichCandidates = async (
  request: CandidateEnrichmentRequest,
  logger: Logger,
): Promise<CandidateEnrichment[]> => {
  return buildLiveEnrichmentClient(logger)(request);
};

const logAgenticToolEvent = (
  logger: Logger,
  event: AgenticWebEnrichmentToolEvent,
): void => {
  if (event.type === "search") {
    logger.info("evaluateSeeds.enrichment.tool.search", {
      candidateId: event.candidateId,
      query: event.query,
      resultCount: event.resultCount,
      sourceUrls: event.sourceUrls,
    });
    return;
  }

  if (event.type === "fetch") {
    logger.info("evaluateSeeds.enrichment.tool.fetch", {
      candidateId: event.candidateId,
      url: event.url,
      cache: event.cache,
      textLength: event.textLength,
    });
    return;
  }

  if (event.type === "lookup") {
    logger.info("evaluateSeeds.enrichment.tool.lookup", {
      candidateId: event.candidateId,
      source: event.source,
      status: event.status,
      sourceUrls: event.sourceUrls,
      placeMatchScore: event.placeMatchScore,
    });
    return;
  }

  logger.info("evaluateSeeds.enrichment.tool.finalize", {
    candidateId: event.candidateId,
    source: event.source,
    status: event.status,
    reason: event.reason,
    sourceUrls: event.sourceUrls,
    confidence: event.confidence,
  });
};

// discoverSeeds가 만든 seed 후보를 최종 추천 후보로 좁히는 stage 오케스트레이터.
// 큰 흐름은 evidence 정규화 -> agentic enrichment -> hard/semantic gate
// -> LLM scoring -> deterministic ranking/output 변환 순서다.
export const evaluateSeeds = async (
  userInput: UserInput,
  discoverSeedsOutput: DiscoverSeedsOutput,
  config: EngineConfig,
  logger: Logger,
): Promise<EvaluateSeedsProcessResult> => {
  const stepLogger = logger.withContext({
    attemptNo: discoverSeedsOutput.attemptNo,
  });
  const finish = stepLogger.startTimer("evaluateSeeds.evaluation.success");
  stepLogger.info("evaluateSeeds.evaluation.start", {
    seedCount: discoverSeedsOutput.seeds.length,
    targetCount: config.targetCount,
    approachCount: discoverSeedsOutput.plan.approaches.length,
  });

  // 1) Seed를 scoring/evaluation 공용 evidence 형태로 정규화한다.
  // seedKey를 candidateId로 쓰면 LLM, enrichment, 로그가 같은 후보를 안정적으로 가리킨다.
  const evidences = discoverSeedsOutput.seeds.map((seed, index) =>
    buildCandidateScoringEvidence(
      seed,
      getSeedKey(discoverSeedsOutput, index),
      userInput,
    ),
  );
  stepLogger.info("evaluateSeeds.evidence.built", {
    evidenceCount: evidences.length,
    candidateIds: evidences.map((evidence) => evidence.candidateId),
  });

  if (evidences.length === 0) {
    stepLogger.warn("evaluateSeeds.evaluation.failure", {
      errorCode: "EVALUATE_SEEDS_NO_RECOMMENDABLE_CANDIDATES",
      reason: "zero_seeds",
    });
    return {
      ok: false,
      failedStep: "evaluateSeeds",
      errorCode: "EVALUATE_SEEDS_NO_RECOMMENDABLE_CANDIDATES",
      message: "discoverSeeds produced zero seeds",
    };
  }

  // 2) 외부 source와 LLM tool loop로 후보별 근거를 보강한다.
  // 여기서 얻은 operationInfo는 hard gate에 쓰이므로 stub/default 값을 만들지 않는다.
  let enrichedEvidences: CandidateScoringEvidence[];
  let operationVerifiedCount = 0;
  let semanticPenalizedCount = 0;
  let referenceRejectedCount = 0;
  try {
    const finishEnrichment = stepLogger.startTimer(
      "evaluateSeeds.enrichment.success",
    );
    stepLogger.info("evaluateSeeds.enrichment.start", {
      evidenceCount: evidences.length,
      client: "agentic",
      initialBatchSize: LIVE_MAX_CANDIDATES,
      maxEvidenceCount: getMaxEvidenceCount(evidences.length, config),
    });
    const enrichmentResult = await collectEnrichmentBatches({
      userInput,
      evidences,
      config,
      logger: stepLogger,
    });
    enrichedEvidences = enrichmentResult.enrichedEvidences;
    operationVerifiedCount = enrichmentResult.operationVerifiedCount;
    semanticPenalizedCount = enrichmentResult.semanticPenalizedCount;
    referenceRejectedCount = enrichmentResult.referenceRejectedCount;
    finishEnrichment({
      enrichmentCount: enrichmentResult.enrichments.length,
      evaluatedEvidenceCount: enrichmentResult.evaluatedEvidenceCount,
      skippedEvidenceCount: evidences.length - enrichmentResult.evaluatedEvidenceCount,
      verifiedOpenCount: enrichedEvidences.length,
      rejectedCount:
        enrichmentResult.evaluatedEvidenceCount - enrichedEvidences.length,
      batches: enrichmentResult.batches,
      // `.log.json` 분석용 상세 근거. `.result.json`에는 사용자-facing 결과만 남긴다.
      verifications: enrichmentResult.enrichments.map((enrichment) => ({
        candidateId: enrichment.candidateId,
        source: enrichment.source,
        status: enrichment.operationVerification.status,
        reason: enrichment.operationVerification.reason,
        scheduleCount: enrichment.operationInfo?.schedules.length ?? 0,
        sourceUrls: enrichment.sourceUrls,
        sourceDetails: enrichment.sourceDetails,
        scrapeCache: enrichment.scrapeCache,
        rawTextSnippet: enrichment.rawTextSnippet?.slice(0, 1_500),
      })),
      rejected: enrichmentResult.enrichments
        .filter((enrichment) => !shouldRecommendByOperationHours(enrichment))
        .map((enrichment) => ({
          candidateId: enrichment.candidateId,
          source: enrichment.source,
          status: enrichment.operationVerification.status,
          reason: enrichment.operationVerification.reason,
          sourceUrls: enrichment.operationVerification.sourceUrls,
          sourceDetails: enrichment.sourceDetails,
          scrapeCache: enrichment.scrapeCache,
          rawTextSnippet: enrichment.rawTextSnippet?.slice(0, 1_500),
        })),
      semanticPenalizedCount,
      notSemanticallyEvaluatedDueToOperationUnknown:
        enrichmentResult.notSemanticallyEvaluatedDueToOperationUnknown,
      referenceRejected: enrichmentResult.referenceUrlResolutions
        .filter((resolution) => !resolution.referenceUrls)
        .map((resolution) => ({
          candidateId: resolution.evidence.candidateId,
          name: resolution.evidence.name,
          rejectedReason: resolution.rejectedReason,
          source: resolution.source,
        })),
    });
  } catch (error) {
    const failure = toEvaluateSeedsFailure(error);
    stepLogger.error("evaluateSeeds.enrichment.failure", error, {
      errorCode: failure.ok
        ? "UNKNOWN_EVALUATE_SEEDS_ERROR"
        : failure.errorCode,
    });
    return failure;
  }

  if (enrichedEvidences.length === 0) {
    // 6) 추천 가능한 후보가 없으면 엔진 실패가 아니라 다음 discover attempt를 요청한다.
    // 영업시간 문제와 의미 부적합 문제를 retry reason으로 구분해 다음 탐색 전략을 조정한다.
    const reason = operationVerifiedCount > 0 ? "LOW_QUALITY" : "TOO_FEW_OPEN_NOW";
    stepLogger.warn("evaluateSeeds.evaluation.needs_more_seeds", {
      reason,
      rejectedSeedKeyCount: discoverSeedsOutput.seedKeys.length,
      operationVerifiedCount,
      semanticPenalizedCount,
      referenceRejectedCount,
    });
    return {
      ok: true,
      needsMoreSeeds: {
        status: "NEEDS_MORE_SEEDS",
        reason,
        excludeSeedKeys: discoverSeedsOutput.seedKeys,
      },
    };
  }

  // 7) LLM scoring.
  // LLM은 raw 차원 점수와 설명 근거만 만든다. 최종 total은 ranking util에서 일관되게 계산한다.
  let llmEvaluations: LlmCandidateEvaluation[];
  try {
    const finishScoring = stepLogger.startTimer(
      "evaluateSeeds.llm_scoring.success",
    );
    stepLogger.info("evaluateSeeds.llm_scoring.start", {
      evidenceCount: enrichedEvidences.length,
      client: "configured",
    });
    const raw = await scoreCandidatesWithLlm({ evidences: enrichedEvidences });
    llmEvaluations = raw.map((evaluation) =>
      LlmCandidateEvaluationSchema.parse(evaluation),
    );
    finishScoring({
      evaluationCount: llmEvaluations.length,
    });
  } catch (error) {
    const failure = toEvaluateSeedsLlmScoringFailure(error);
    stepLogger.error("evaluateSeeds.llm_scoring.failure", error, {
      errorCode: failure.ok
        ? "UNKNOWN_EVALUATE_SEEDS_ERROR"
        : failure.errorCode,
    });
    return failure;
  }

  // 8) deterministic ranking.
  // LLM 응답 누락 후보는 제외하고, semantic penalty와 config weights를 적용해 정렬한다.
  const ranked = buildRankedCandidates(
    enrichedEvidences,
    llmEvaluations,
    config.weights,
  );
  stepLogger.info("evaluateSeeds.ranking.built", {
    rankedCount: ranked.length,
    droppedEvaluationCount: enrichedEvidences.length - ranked.length,
  });

  if (ranked.length === 0) {
    stepLogger.warn("evaluateSeeds.evaluation.failure", {
      errorCode: "EVALUATE_SEEDS_NO_RECOMMENDABLE_CANDIDATES",
      reason: "no_valid_evaluations",
    });
    return {
      ok: false,
      failedStep: "evaluateSeeds",
      errorCode: "EVALUATE_SEEDS_NO_RECOMMENDABLE_CANDIDATES",
      message: "LLM returned no valid evaluation",
    };
  }

  // 9) 최종 출력 조립.
  // 사용자-facing item과 내부 evaluation을 같이 만든 뒤 schema 검증을 한 번만 수행한다.
  const top = ranked.slice(0, config.targetCount);
  const items: PlaceRecommendationItem[] = [];
  const evaluations: EvaluateSeedsEvaluation[] = [];
  stepLogger.info("evaluateSeeds.ranking.selected", {
    selectedCount: top.length,
    selectedCandidateIds: top.map((entry) => entry.evidence.candidateId),
    topScore: top[0]?.scores.total,
  });

  for (const entry of top) {
    items.push(toPlaceRecommendationItem(entry));
    evaluations.push(toEvaluateSeedsEvaluation(entry));
  }

  try {
    const output = EvaluateSeedsOutputSchema.parse({ items, evaluations });
    finish({
      itemCount: output.items.length,
      evaluationCount: output.evaluations.length,
      topScore: output.evaluations[0]?.scores.total,
    });
    return { ok: true, data: output };
  } catch (error) {
    const failure = toEvaluateSeedsFailure(error);
    stepLogger.error("evaluateSeeds.evaluation.failure", error, {
      errorCode: failure.ok
        ? "UNKNOWN_EVALUATE_SEEDS_ERROR"
        : failure.errorCode,
    });
    return failure;
  }
};

const getSeedKey = (
  discoverSeedsOutput: DiscoverSeedsOutput,
  index: number,
): string => {
  const seedKey = discoverSeedsOutput.seedKeys[index];
  if (!seedKey) {
    throw new Error(`Missing seedKey for discovered seed index ${index}`);
  }
  return seedKey;
};

type SemanticAssessment = {
  evidence: CandidateScoringEvidence;
  semanticFit: ReturnType<typeof assessSemanticFit>;
};

type EnrichmentBatchLog = {
  batchNo: number;
  offset: number;
  evidenceCount: number;
  enrichmentCount: number;
  operationVerifiedCount: number;
  semanticPassedCount: number;
  semanticRejectedCount: number;
  semanticPenalizedCount: number;
  referenceVerifiedCount: number;
  referenceRejectedCount: number;
  selectedSoFar: number;
};

type EnrichmentBatchCollection = {
  enrichments: CandidateEnrichment[];
  enrichedEvidences: CandidateScoringEvidence[];
  referenceUrlResolutions: ReferenceUrlResolution[];
  semanticRejected: SemanticAssessment[];
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

const collectEnrichmentBatches = async ({
  userInput,
  evidences,
  config,
  logger,
}: {
  userInput: UserInput;
  evidences: CandidateScoringEvidence[];
  config: EngineConfig;
  logger: Logger;
}): Promise<EnrichmentBatchCollection> => {
  const maxEvidenceCount = getMaxEvidenceCount(evidences.length, config);
  const allEnrichments: CandidateEnrichment[] = [];
  const selectedEvidences: CandidateScoringEvidence[] = [];
  const allReferenceUrlResolutions: ReferenceUrlResolution[] = [];
  const allSemanticRejected: SemanticAssessment[] = [];
  let semanticPenalizedCount = 0;
  const notSemanticallyEvaluatedDueToOperationUnknown: EnrichmentBatchCollection["notSemanticallyEvaluatedDueToOperationUnknown"] =
    [];
  const batches: EnrichmentBatchLog[] = [];
  let operationVerifiedCount = 0;
  let referenceRejectedCount = 0;
  let evaluatedEvidenceCount = 0;

  for (
    let offset = 0, batchNo = 1;
    offset < maxEvidenceCount && selectedEvidences.length < config.targetCount;
    offset += LIVE_MAX_CANDIDATES, batchNo += 1
  ) {
    const batchEvidences = evidences.slice(offset, offset + LIVE_MAX_CANDIDATES);
    evaluatedEvidenceCount += batchEvidences.length;
    logger.info("evaluateSeeds.enrichment.batch.start", {
      batchNo,
      offset,
      evidenceCount: batchEvidences.length,
      selectedSoFar: selectedEvidences.length,
      maxEvidenceCount,
    });

    const batchEnrichments = await enrichCandidates(
      { userInput, evidences: batchEvidences },
      logger,
    );
    allEnrichments.push(...batchEnrichments);
    const enrichmentByCandidateId = new Map(
      batchEnrichments.map((enrichment) => [
        enrichment.candidateId,
        enrichment,
      ]),
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
    const semanticRejected: SemanticAssessment[] = [];
    allSemanticRejected.push(...semanticRejected);
    const semanticPassed = semanticAssessments
      .map(({ evidence, semanticFit }) =>
        attachSemanticFit(evidence, semanticFit),
      );
    const semanticPenalized = semanticAssessments.filter(
      ({ semanticFit }) => semanticFit.status === "PENALIZE",
    );
    semanticPenalizedCount += semanticPenalized.length;

    logger.info("evaluateSeeds.semantic_gate.filtered", {
      batchNo,
      evaluatedCount: semanticAssessments.length,
      passedCount: semanticPassed.length,
      rejectedCount: semanticRejected.length,
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
      rejected: semanticRejected.map(({ evidence, semanticFit }) => ({
        candidateId: evidence.candidateId,
        name: evidence.name,
        category: evidence.category,
        reason: semanticFit.reason,
        negativeSignals: semanticFit.negativeSignals,
      })),
    });

    const finishReferenceUrls = logger.startTimer(
      "evaluateSeeds.reference_urls.success",
    );
    logger.info("evaluateSeeds.reference_urls.start", {
      batchNo,
      evidenceCount: semanticPassed.length,
    });
    const referenceUrlResolutions =
      await resolveReferenceUrlsForEvidences(semanticPassed);
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
      semanticRejectedCount: semanticRejected.length,
      semanticPenalizedCount: semanticPenalized.length,
      referenceVerifiedCount: verified.length,
      referenceRejectedCount: batchReferenceRejectedCount,
      selectedSoFar: selectedEvidences.length,
    };
    batches.push(batchLog);
    logger.info("evaluateSeeds.enrichment.batch.success", batchLog);
  }

  return {
    enrichments: allEnrichments,
    enrichedEvidences: selectedEvidences.slice(0, config.targetCount),
    referenceUrlResolutions: allReferenceUrlResolutions,
    semanticRejected: allSemanticRejected,
    semanticPenalizedCount,
    notSemanticallyEvaluatedDueToOperationUnknown,
    operationVerifiedCount,
    referenceRejectedCount,
    evaluatedEvidenceCount,
    batches,
  };
};

const getMaxEvidenceCount = (
  evidenceCount: number,
  config: EngineConfig,
): number =>
  Math.min(
    evidenceCount,
    Math.max(LIVE_MAX_CANDIDATES, config.targetCount * config.candidatePoolMultiplier),
  );

const resolveReferenceUrlsForEvidences = async (
  evidences: CandidateScoringEvidence[],
): Promise<ReferenceUrlResolution[]> => {
  let browserPromise: Promise<PlaywrightBrowser> | undefined;
  const scrapeRequests = new Map<string, Promise<UrlScrapeResult>>();
  const getBrowser = (): Promise<PlaywrightBrowser> => {
    browserPromise ??= Promise.resolve().then(() =>
      loadPlaywright().chromium.launch({ headless: true }),
    );
    return browserPromise;
  };

  try {
    return await mapWithConcurrency(
      evidences,
      LIVE_REFERENCE_URL_CONCURRENCY,
      (evidence) =>
        resolveCandidateReferenceUrls(evidence, {
          getBrowser,
          naverMapScrapeCache,
          scrapeRequests,
          timeoutMs: LIVE_SCRAPE_TIMEOUT_MS,
          settleMs: LIVE_SCRAPE_SETTLE_MS,
        }),
    );
  } finally {
    const browser = await browserPromise;
    await browser?.close();
  }
};

const hasReferenceUrls = (
  resolution: ReferenceUrlResolution,
): resolution is ReferenceUrlResolution & {
  referenceUrls: NonNullable<ReferenceUrlResolution["referenceUrls"]>;
} => resolution.referenceUrls !== undefined;

const mapWithConcurrency = async <TItem, TResult>(
  items: TItem[],
  concurrency: number,
  mapper: (item: TItem, index: number) => Promise<TResult>,
): Promise<TResult[]> => {
  const results = new Array<TResult>(items.length);
  let nextIndex = 0;
  const workerCount = Math.max(1, Math.min(items.length, concurrency));

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        const item = items[index];
        if (item === undefined) continue;
        results[index] = await mapper(item, index);
      }
    }),
  );

  return results;
};
