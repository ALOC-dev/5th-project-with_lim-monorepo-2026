import type { EngineConfig } from "../../configs/types.js";
import type { UserInput } from "../../interfaces/input.contracts.js";
import type { PlaceRecommendationItem } from "../../interfaces/output.contracts.js";
import type { Logger } from "../../observability/logger.js";
import type { DiscoverSeedsOutput } from "../discoverSeeds/contracts.js";
import { type EvaluateSeedsEvaluation, EvaluateSeedsOutputSchema } from "./contracts.js";
import { createCascadeEnrichmentClient } from "./llm/cascade-enrichment.js";
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
  getMaxEvidenceCount,
} from "./utils/enrichment-batches.js";
import { shouldRecommendByOperationHours } from "./utils/enrichment-merge.js";
import type {
  CandidateEnrichment,
  CandidateEnrichmentClient,
  CandidateEnrichmentRequest,
} from "./utils/enrichment-types.js";
import { buildCandidateScoringEvidence, type CandidateScoringEvidence } from "./utils/evidence.js";
import { toEvaluateSeedsFailure, toEvaluateSeedsLlmScoringFailure } from "./utils/failure.js";
import { toEvaluateSeedsEvaluation, toPlaceRecommendationItem } from "./utils/output.js";
import { buildRankedCandidates } from "./utils/ranking.js";
import { createLocalFileUrlScrapeCache } from "./utils/scrape-cache.js";
import { assessPreEnrichmentSemanticFit } from "./utils/semantic-fit.js";

export type {
  CandidateEnrichment,
  CandidateEnrichmentClient,
  CandidateScoringEvidence,
  LlmCandidateEvaluation,
  LlmScoringClient,
};

const boundedWebFetchCache = createLocalFileUrlScrapeCache({
  namespace: "bounded-web-fetch",
});
const kakaoMapScrapeCache = createLocalFileUrlScrapeCache({
  namespace: "kakao-map",
});
const naverMapScrapeCache = createLocalFileUrlScrapeCache({
  namespace: "naver-map",
});

const LIVE_SCRAPE_TIMEOUT_MS = 20_000;
const LIVE_SCRAPE_SETTLE_MS = 750;
const LIVE_REFERENCE_URL_CONCURRENCY = 4;

/**
 * 실행 1건 동안 Chromium 하나만 쓰도록 공유 공급자를 만든다.
 *
 * 예전에는 enrichment 클라이언트와 reference URL 해결이 각자 브라우저를 띄웠고,
 * 그게 배치마다 반복됐다. 배치 5회 × 재시도 5회면 최대 50번 기동이고 1회당 1~3초다.
 * 실제로 쓰이기 전까지는 띄우지 않는다(전부 캐시 적중이면 한 번도 안 띄운다).
 */
const createSharedBrowserProvider = (): {
  getBrowser: () => Promise<PlaywrightBrowser>;
  close: () => Promise<void>;
} => {
  let browserPromise: Promise<PlaywrightBrowser> | undefined;

  return {
    getBrowser: () => {
      browserPromise ??= Promise.resolve().then(() =>
        loadPlaywright().chromium.launch({
          headless: true,
          args: ["--disable-dev-shm-usage", "--no-sandbox"],
        }),
      );
      return browserPromise;
    },
    close: async () => {
      const browser = await browserPromise?.catch(() => undefined);
      await browser?.close().catch(() => undefined);
    },
  };
};

const buildLiveEnrichmentClient = (
  logger: Logger,
  options: EvaluateSeedsOptions,
  getBrowser: () => Promise<PlaywrightBrowser>,
): CandidateEnrichmentClient => {
  const clientOptions = {
    getBrowser,
    openAiApiKey: options.secrets?.openAiApiKey,
    kakaoRestApiKey: options.secrets?.kakaoRestApiKey,
    clientId: options.secrets?.naverSearchClientId,
    clientSecret: options.secrets?.naverSearchClientSecret,
    scrapeTimeoutMs: LIVE_SCRAPE_TIMEOUT_MS,
    scrapeSettleMs: LIVE_SCRAPE_SETTLE_MS,
    fetchCache: boundedWebFetchCache,
    kakaoScrapeCache: kakaoMapScrapeCache,
    kakaoScrapePlaceDetails: false,
    naverMapScrapeCache,
    logger,
  };
  return createCascadeEnrichmentClient(clientOptions);
};

const enrichCandidates = async (
  request: CandidateEnrichmentRequest,
  logger: Logger,
  options: EvaluateSeedsOptions,
  getBrowser: () => Promise<PlaywrightBrowser>,
): Promise<CandidateEnrichment[]> => {
  return buildLiveEnrichmentClient(logger, options, getBrowser)(request);
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
  const prioritizedEvidences = prioritizeEvidencesForEvaluation(evidences, userInput);
  const preEnrichmentAssessments = prioritizedEvidences.map((evidence) => ({
    evidence,
    semanticFit: assessPreEnrichmentSemanticFit(evidence),
  }));
  const prefilteredEvidences = preEnrichmentAssessments
    .filter(({ semanticFit }) => semanticFit.status !== "REJECT")
    .map(({ evidence }) => evidence);
  stepLogger.info("evaluateSeeds.evidence.built", {
    evidenceCount: evidences.length,
    candidateIds: evidences.map((evidence) => evidence.candidateId),
    prioritizedCandidateIds: prioritizedEvidences.map((evidence) => evidence.candidateId),
    prefilteredCandidateIds: prefilteredEvidences.map((evidence) => evidence.candidateId),
  });
  stepLogger.info("evaluateSeeds.pre_enrichment_semantic_gate.filtered", {
    evaluatedCount: preEnrichmentAssessments.length,
    passedCount: prefilteredEvidences.length,
    rejectedCount: preEnrichmentAssessments.length - prefilteredEvidences.length,
    rejected: preEnrichmentAssessments
      .filter(({ semanticFit }) => semanticFit.status === "REJECT")
      .map(({ evidence, semanticFit }) => ({
        candidateId: evidence.candidateId,
        name: evidence.name,
        reason: semanticFit.reason,
        negativeSignals: semanticFit.negativeSignals,
      })),
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

  // 2) 결정론 source와 제한된 targeted LLM으로 후보별 근거를 보강한다.
  // 여기서 얻은 operationInfo는 hard gate에 쓰이므로 stub/default 값을 만들지 않는다.
  let enrichedEvidences: CandidateScoringEvidence[];
  let operationVerifiedCount = 0;
  let semanticPenalizedCount = 0;
  let semanticRejectedCount = 0;
  let referenceRejectedCount = 0;
  // 이 실행에서 쓰는 Chromium은 하나뿐이다. enrichment와 reference URL 해결이
  // 같은 인스턴스를 나눠 쓰고, 배치를 다 돈 뒤 한 번만 닫는다.
  const sharedBrowser = createSharedBrowserProvider();
  try {
    options.onProgress?.('enriching');
    const finishEnrichment = stepLogger.startTimer("evaluateSeeds.enrichment.success");
    stepLogger.info("evaluateSeeds.enrichment.start", {
      evidenceCount: prefilteredEvidences.length,
      client: "cascade",
      maxEvidenceCount: getMaxEvidenceCount(prefilteredEvidences.length, config),
    });
    const enrichmentResult = await collectEnrichmentBatches({
      userInput,
      evidences: prefilteredEvidences,
      config,
      logger: stepLogger,
      enrichCandidates: (request, enrichmentLogger) =>
        enrichCandidates(request, enrichmentLogger, options, sharedBrowser.getBrowser),
      resolveReferenceUrls: (evidences) =>
        resolveReferenceUrlsForEvidences(evidences, options, sharedBrowser.getBrowser),
      session: options.session,
    });
    enrichedEvidences = enrichmentResult.enrichedEvidences;
    operationVerifiedCount = enrichmentResult.operationVerifiedCount;
    semanticPenalizedCount = enrichmentResult.semanticPenalizedCount;
    semanticRejectedCount = enrichmentResult.semanticRejectedCount;
    referenceRejectedCount = enrichmentResult.referenceRejectedCount;
    finishEnrichment({
      enrichmentCount: enrichmentResult.enrichments.length,
      evaluatedEvidenceCount: enrichmentResult.evaluatedEvidenceCount,
      skippedEvidenceCount: prefilteredEvidences.length - enrichmentResult.evaluatedEvidenceCount,
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
      semanticRejectedCount,
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
  } finally {
    // 브라우저를 쓰는 단계는 여기서 끝난다. 성공/실패와 무관하게 반드시 닫는다.
    await sharedBrowser.close();
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
      semanticRejectedCount,
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

  // 후보 수가 목표에 미달한 상태에서 scoring하면 다음 discovery attempt에서 같은
  // 검증 완료 후보를 다시 score해야 하고 diversity 비교도 깨진다. enrichment/reference
  // session cache에 보존된 stable 후보와 새 후보를 합친 뒤 최종 한 번만 scoring한다.
  if (
    enrichedEvidences.length < config.targetCount &&
    discoverSeedsOutput.nextQueries.length > 0
  ) {
    stepLogger.info("evaluateSeeds.llm_scoring.deferred", {
      qualifiedCandidateCount: enrichedEvidences.length,
      targetCount: config.targetCount,
      nextQueryCount: discoverSeedsOutput.nextQueries.length,
      reuseOnNextAttempt: true,
    });
    stepLogger.warn("evaluateSeeds.evaluation.needs_more_seeds", {
      reason: "LOW_QUALITY",
      qualifiedCandidateCount: enrichedEvidences.length,
      targetCount: config.targetCount,
      deferredScoring: true,
    });
    return {
      ok: true,
      needsMoreSeeds: {
        status: "NEEDS_MORE_SEEDS",
        reason: "LOW_QUALITY",
        excludeSeedKeys: [],
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
      logger: stepLogger,
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

  if (ranked.length < config.targetCount && discoverSeedsOutput.nextQueries.length > 0) {
    stepLogger.warn("evaluateSeeds.evaluation.needs_more_seeds", {
      reason: "LOW_QUALITY",
      rankedCount: ranked.length,
      targetCount: config.targetCount,
      nextQueryCount: discoverSeedsOutput.nextQueries.length,
    });
    return {
      ok: true,
      needsMoreSeeds: {
        status: "NEEDS_MORE_SEEDS",
        reason: "LOW_QUALITY",
        excludeSeedKeys: [],
      },
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

const prioritizeEvidencesForEvaluation = (
  evidences: CandidateScoringEvidence[],
  userInput: UserInput,
): CandidateScoringEvidence[] =>
  evidences
    .map((evidence, index) => ({
      evidence,
      index,
      score: getLightweightEvaluationPriority(evidence, userInput),
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(({ evidence }) => evidence);

export const getLightweightEvaluationPriority = (
  evidence: CandidateScoringEvidence,
  userInput: UserInput,
): number => {
  const request = userInput.userNaturalLanguageRequest;
  const candidateText = [
    evidence.name,
    evidence.category.mainCategory,
    evidence.category.subCategory,
    ...evidence.category.tags,
  ].join(" ");
  let score = 0;

  if (hasCafeIntent(request) && /카페|커피|디저트|베이커리|브런치/iu.test(candidateText)) {
    score += 30;
  }
  if (
    hasFoodIntent(request) &&
    /음식점|식당|맛집|한식|중식|일식|양식|고기|파스타/iu.test(candidateText)
  ) {
    score += 30;
  }
  if (hasDrinkIntent(request) && /술집|호프|펍|포차|이자카야|와인|바\b/iu.test(candidateText)) {
    score += 30;
  }
  // 증명 가능한 식이/맥주 요청은 일반 업종보다 통과율이 낮다. 관련된 구조화 tag를
  // 앞 배치로 보내야 같은 10개 후보 예산 안에서 5개 완주 확률이 올라간다. 이것은
  // 후보의 claim을 확정하지 않으며, 실제 식이·맥주 hard gate는 enrichment 뒤에 그대로
  // 적용된다.
  if (
    /비건|vegan/iu.test(request) &&
    /비건|vegan|plant\s*-?\s*based|플랜트\s*-?\s*베이스드/iu.test(candidateText)
  ) {
    score += 45;
  }
  if (/채식|vegetarian/iu.test(request) && /채식|vegetarian/iu.test(candidateText)) {
    score += 45;
  }
  if (/할랄|halal/iu.test(request) && /할랄|halal/iu.test(candidateText)) {
    score += 45;
  }
  if (
    /맥주|호프|펍|브루잉|\b(?:beer|pub|brewery)\b/iu.test(request) &&
    /맥주|호프|펍|브루잉|\b(?:beer|pub|brewery)\b/iu.test(candidateText)
  ) {
    score += 45;
  }

  const distanceMeters = evidence.accessibilitySignals.distanceMeters;
  if (distanceMeters !== undefined) {
    score += Math.max(0, 20 - distanceMeters / 500);
  }
  if (evidence.placeInfo.roadAddress || evidence.placeInfo.address) score += 5;
  if (evidence.trustSignals.evidenceUrls.length > 0) score += 5;

  return score;
};

const hasCafeIntent = (request: string): boolean =>
  /카페|커피|디저트|브런치|베이커리|티룸|차\b|tea|coffee|cafe/iu.test(request);

const hasFoodIntent = (request: string): boolean =>
  /맛집|식당|음식|곱창|고기|파스타|한식|중식|일식|양식|비건|점심|저녁/iu.test(request);

const hasDrinkIntent = (request: string): boolean =>
  /술집|맥주|펍|호프|바\b|bar\b|포차|와인|칵테일|이자카야/iu.test(request);

const resolveReferenceUrlsForEvidences = async (
  evidences: CandidateScoringEvidence[],
  options: EvaluateSeedsOptions,
  getBrowser: () => Promise<PlaywrightBrowser>,
): Promise<ReferenceUrlResolution[]> => {
  const scrapeRequests = new Map<string, Promise<UrlScrapeResult>>();

  return mapWithConcurrency(evidences, LIVE_REFERENCE_URL_CONCURRENCY, (evidence) =>
    resolveCandidateReferenceUrls(evidence, {
      getBrowser,
      naverMapScrapeCache,
      scrapeRequests,
      kakaoRestApiKey: options.secrets?.kakaoRestApiKey,
      timeoutMs: LIVE_SCRAPE_TIMEOUT_MS,
      settleMs: LIVE_SCRAPE_SETTLE_MS,
    }),
  );
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
