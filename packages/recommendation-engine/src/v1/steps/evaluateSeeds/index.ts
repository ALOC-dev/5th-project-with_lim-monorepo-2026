import type { EngineConfig } from "../../configs/types.js";
import type { UserInput } from "../../interfaces/input.contracts.js";
import type { PlaceRecommendationItem } from "../../interfaces/output.contracts.js";
import type { Logger } from "../../observability/logger.js";
import type { DiscoverSeedsOutput } from "../discoverSeeds/contracts.js";
import { type EvaluateSeedsEvaluation, EvaluateSeedsOutputSchema } from "./contracts.js";
import { createAgenticWebEnrichmentClient } from "./llm/enrichment.js";
import {
  type LlmCandidateEvaluation,
  LlmCandidateEvaluationSchema,
} from "./llm/scoring.contracts.js";
import { scoreCandidatesWithLlm } from "./llm/scoring.js";
import type { LlmScoringClient } from "./llm/scoring.types.js";
import {
  type ReferenceUrlResolution,
  resolveCandidateReferenceUrls,
} from "./tools/reference-urls.js";
import { loadPlaywright } from "./tools/shared/browser.js";
import type { PlaywrightBrowser, UrlScrapeResult } from "./tools/types.js";
import type { EvaluateSeedsOptions, EvaluateSeedsProcessResult } from "./types.js";
import {
  collectEnrichmentBatches,
  ENRICHMENT_BATCH_SIZE,
  getMaxEvidenceCount,
} from "./utils/enrichment-batches.js";
import { shouldRecommendByOperationHours } from "./utils/enrichment-merge.js";
import type {
  AgenticWebEnrichmentToolEvent,
  CandidateEnrichment,
  CandidateEnrichmentClient,
  CandidateEnrichmentRequest,
} from "./utils/enrichment-types.js";
import { buildCandidateScoringEvidence, type CandidateScoringEvidence } from "./utils/evidence.js";
import { toEvaluateSeedsFailure, toEvaluateSeedsLlmScoringFailure } from "./utils/failure.js";
import { toEvaluateSeedsEvaluation, toPlaceRecommendationItem } from "./utils/output.js";
import { buildRankedCandidates } from "./utils/ranking.js";
import { createLocalFileUrlScrapeCache } from "./utils/scrape-cache.js";

export type {
  CandidateEnrichment,
  CandidateEnrichmentClient,
  CandidateScoringEvidence,
  LlmCandidateEvaluation,
  LlmScoringClient,
};
export { createAgenticWebEnrichmentClient };

const agenticFetchCache = createLocalFileUrlScrapeCache({
  namespace: "agentic-fetch",
});
const kakaoMapScrapeCache = createLocalFileUrlScrapeCache({
  namespace: "kakao-map",
});
const naverMapScrapeCache = createLocalFileUrlScrapeCache({
  namespace: "naver-map",
});

const LIVE_MAX_CANDIDATES = ENRICHMENT_BATCH_SIZE;
const LIVE_MAX_CONCURRENCY = 4;
const LIVE_MAX_FETCHES_PER_CANDIDATE = 2;
const LIVE_MAX_TOOL_STEPS = 10;
const LIVE_TIMEOUT_MS = 120_000;
const LIVE_SCRAPE_TIMEOUT_MS = 20_000;
const LIVE_SCRAPE_SETTLE_MS = 750;
const LIVE_REFERENCE_URL_CONCURRENCY = 4;

const buildLiveEnrichmentClient = (
  logger: Logger,
  options: EvaluateSeedsOptions,
): CandidateEnrichmentClient =>
  createAgenticWebEnrichmentClient({
    openAiApiKey: options.secrets?.openAiApiKey,
    kakaoRestApiKey: options.secrets?.kakaoRestApiKey,
    clientId: options.secrets?.naverSearchClientId,
    clientSecret: options.secrets?.naverSearchClientSecret,
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
  options: EvaluateSeedsOptions,
): Promise<CandidateEnrichment[]> => {
  return buildLiveEnrichmentClient(logger, options)(request);
};

const logAgenticToolEvent = (logger: Logger, event: AgenticWebEnrichmentToolEvent): void => {
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

export const evaluateSeeds = async (
  userInput: UserInput,
  discoverSeedsOutput: DiscoverSeedsOutput,
  config: EngineConfig,
  logger: Logger,
  options: EvaluateSeedsOptions = {},
): Promise<EvaluateSeedsProcessResult> => {
  const stepLogger = logger.withContext({
    attemptNo: discoverSeedsOutput.attemptNo,
  });
  const finish = stepLogger.startTimer("evaluateSeeds.evaluation.success");
  stepLogger.info("evaluateSeeds.evaluation.start", {
    seedCount: discoverSeedsOutput.seeds.length,
    targetCount: config.targetCount,
  });

  // 1) Seed를 scoring/evaluation 공용 evidence 형태로 정규화한다.
  // seedKey를 candidateId로 쓰면 LLM, enrichment, 로그가 같은 후보를 안정적으로 가리킨다.
  const evidences = discoverSeedsOutput.seeds.map((seed, index) =>
    buildCandidateScoringEvidence(seed, getSeedKey(discoverSeedsOutput, index), userInput),
  );
  stepLogger.info("evaluateSeeds.evidence.built", {
    evidenceCount: evidences.length,
    candidateIds: evidences.map((evidence) => evidence.candidateId),
  });

  if (evidences.length === 0) {
    stepLogger.warn("evaluateSeeds.evaluation.needs_more_seeds", {
      reason: "ZERO_SEEDS",
    });
    return {
      ok: true,
      needsMoreSeeds: {
        status: "NEEDS_MORE_SEEDS",
        reason: "ZERO_SEEDS",
        excludeSeedKeys: [],
      },
    };
  }

  // 2) 외부 source와 LLM tool loop로 후보별 근거를 보강한다.
  // 여기서 얻은 operationInfo는 hard gate에 쓰이므로 stub/default 값을 만들지 않는다.
  let enrichedEvidences: CandidateScoringEvidence[];
  let operationVerifiedCount = 0;
  let semanticPenalizedCount = 0;
  let referenceRejectedCount = 0;
  try {
    options.onProgress?.('enriching');
    const finishEnrichment = stepLogger.startTimer("evaluateSeeds.enrichment.success");
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
      enrichCandidates: (request, enrichmentLogger) =>
        enrichCandidates(request, enrichmentLogger, options),
      resolveReferenceUrls: (evidences) => resolveReferenceUrlsForEvidences(evidences, options),
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
      rejectedCount: enrichmentResult.evaluatedEvidenceCount - enrichedEvidences.length,
      batches: enrichmentResult.batches,
      // `.log.json` 분석용 상세 근거. `.result.json`에는 사용자-facing 결과만 남긴다.
      verifications: enrichmentResult.enrichments.map((enrichment) => ({
        candidateId: enrichment.candidateId,
        source: enrichment.source,
        status: enrichment.operationVerification.status,
        reason: enrichment.operationVerification.reason,
        knownScheduleCount: enrichment.operationInfo
          ? Object.values(enrichment.operationInfo.schedules).filter(
              (schedule) => schedule.status !== "UNKNOWN",
            ).length
          : 0,
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
      errorCode: failure.ok ? "UNKNOWN_EVALUATE_SEEDS_ERROR" : failure.errorCode,
    });
    return failure;
  }

  if (enrichedEvidences.length === 0) {
    // 6) 추천 가능한 후보가 없으면 엔진 실패가 아니라 다음 discover attempt를 요청한다.
    // 영업시간 문제와 의미 부적합 문제를 retry reason으로 구분해 다음 탐색 전략을 조정한다.
    const reason =
      referenceRejectedCount > 0 && operationVerifiedCount > 0
        ? "REFERENCE_URL_REJECTED_HEAVY"
        : operationVerifiedCount > 0
          ? "LOW_QUALITY"
          : "TOO_FEW_OPEN_NOW";
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
    options.onProgress?.('scoring');
    const finishScoring = stepLogger.startTimer("evaluateSeeds.llm_scoring.success");
    stepLogger.info("evaluateSeeds.llm_scoring.start", {
      evidenceCount: enrichedEvidences.length,
      client: "configured",
    });
    const raw = await scoreCandidatesWithLlm({
      evidences: enrichedEvidences,
      openAiApiKey: options.secrets?.openAiApiKey,
    });
    llmEvaluations = raw.map((evaluation) => LlmCandidateEvaluationSchema.parse(evaluation));
    finishScoring({
      evaluationCount: llmEvaluations.length,
    });
  } catch (error) {
    const failure = toEvaluateSeedsLlmScoringFailure(error);
    stepLogger.error("evaluateSeeds.llm_scoring.failure", error, {
      errorCode: failure.ok ? "UNKNOWN_EVALUATE_SEEDS_ERROR" : failure.errorCode,
    });
    return failure;
  }

  // 8) deterministic ranking.
  // LLM 응답 누락 후보는 제외하고, semantic penalty와 config weights를 적용해 정렬한다.
  const ranked = buildRankedCandidates(enrichedEvidences, llmEvaluations, config.weights);
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

  const top = ranked.slice(0, config.targetCount);
  stepLogger.info("evaluateSeeds.ranking.selected", {
    selectedCount: top.length,
    selectedCandidateIds: top.map((entry) => entry.evidence.candidateId),
    topScore: top[0]?.scores.total,
  });

  const items: PlaceRecommendationItem[] = top.map((candidate) =>
    toPlaceRecommendationItem(candidate, userInput),
  );
  const evaluations: EvaluateSeedsEvaluation[] = top.map(toEvaluateSeedsEvaluation);

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
      errorCode: failure.ok ? "UNKNOWN_EVALUATE_SEEDS_ERROR" : failure.errorCode,
    });
    return failure;
  }
};

const getSeedKey = (discoverSeedsOutput: DiscoverSeedsOutput, index: number): string => {
  const seedKey = discoverSeedsOutput.seedKeys[index];
  if (!seedKey) {
    throw new Error(`Missing seedKey for discovered seed index ${index}`);
  }
  return seedKey;
};

const resolveReferenceUrlsForEvidences = async (
  evidences: CandidateScoringEvidence[],
  options: EvaluateSeedsOptions,
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
    return await mapWithConcurrency(evidences, LIVE_REFERENCE_URL_CONCURRENCY, (evidence) =>
      resolveCandidateReferenceUrls(evidence, {
        getBrowser,
        naverMapScrapeCache,
        scrapeRequests,
        kakaoRestApiKey: options.secrets?.kakaoRestApiKey,
        timeoutMs: LIVE_SCRAPE_TIMEOUT_MS,
        settleMs: LIVE_SCRAPE_SETTLE_MS,
      }),
    );
  } finally {
    const browser = await browserPromise;
    await browser?.close();
  }
};

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
