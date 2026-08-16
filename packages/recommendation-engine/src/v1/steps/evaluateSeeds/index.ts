import type { EngineConfig } from "../../configs/types.js";
import type { UserInput } from "../../interfaces/input.contracts.js";
import type { PlaceRecommendationItem } from "../../interfaces/output.contracts.js";
import type { Logger } from "../../observability/logger.js";
import { mapWithConcurrency } from "../../utils/concurrency.js";
import {
  type Coordinate,
  toDistanceMeters,
  toMaxCandidateDistanceMeters,
  toSearchRadiusMeters,
} from "../../utils/geo.js";
import type { DiscoverSeedsOutput } from "../discoverSeeds/contracts.js";
import { type EvaluateSeedsEvaluation, EvaluateSeedsOutputSchema } from "./contracts.js";
import { createAgenticWebEnrichmentClient } from "./llm/enrichment.js";
import {
  type LlmCandidateEvaluation,
  LlmCandidateEvaluationSchema,
} from "./llm/scoring.contracts.js";
import { scoreCandidatesWithLlm } from "./llm/scoring.js";
import type { LlmScoringClient } from "./llm/scoring.types.js";
import { scoreShortlistRelevance } from "./llm/shortlist.js";
import {
  findExistingKakaoMapUrl,
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
import { buildRankedCandidates, type RankedCandidate } from "./utils/ranking.js";
import { createLocalFileUrlScrapeCache } from "./utils/scrape-cache.js";
import {
  assessSemanticFit,
  type ChainBrands,
  findChainBrands,
  requestNamesDishFamily,
  scoreDishAffinity,
  toSemanticBrandKey,
} from "./utils/semantic-fit.js";

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
): CandidateEnrichmentClient =>
  createAgenticWebEnrichmentClient({
    getBrowser,
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
    // 카카오 로컬 REST API는 영업시간을 주지 않는다. 상호/주소/좌표/place_url뿐이다.
    // 영업시간은 place.map.kakao.com 상세 페이지에만 있어서, 이 스크랩을 끄면
    // 카카오는 구조적으로 OPEN 판정을 낼 수 없다(실측: kakao-local OPEN 0건 / UNKNOWN 8건).
    // 그 결과 더 느리고 실패율 높은 우회로(네이버 지도 스크랩, 웹 검색)에 의존하게 되고,
    // 후보가 모자라 재시도가 반복되면서 오히려 전체가 느려졌다.
    kakaoScrapePlaceDetails: true,
    naverMapScrapeCache,
    onToolEvent: (event) => logAgenticToolEvent(logger, event),
    logger,
  });

const enrichCandidates = async (
  request: CandidateEnrichmentRequest,
  logger: Logger,
  options: EvaluateSeedsOptions,
  getBrowser: () => Promise<PlaywrightBrowser>,
): Promise<CandidateEnrichment[]> => {
  return buildLiveEnrichmentClient(logger, options, getBrowser)(request);
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
  // 요청 지점에서 너무 먼 후보는 조사하기 전에 버린다.
  //
  // 지도 검색 API의 반경은 근사치라 요청 범위를 넘는 결과가 섞여 들어온다. 예전에는
  // 이걸 거르지 않고 거리 점수로 약하게 깎기만 해서 "혜화에서 요청했는데 종각이
  // 나오는" 일이 생겼다. 여기서 걸러야 먼 후보를 조사하는 비용도 함께 아낀다.
  const maxDistanceMeters = toMaxCandidateDistanceMeters(toSearchRadiusMeters(userInput));
  const tooFarEvidences = evidences.filter(
    (evidence) =>
      evidence.accessibilitySignals.distanceMeters !== undefined &&
      evidence.accessibilitySignals.distanceMeters > maxDistanceMeters,
  );
  const tooFarIds = new Set(tooFarEvidences.map((evidence) => evidence.candidateId));
  const nearbyEvidences = evidences.filter(
    (evidence) => !tooFarIds.has(evidence.candidateId),
  );
  // 무엇을 조사할지 LLM에게 먼저 물어본다. 조사 예산이 한정돼 있어 이 순서가
  // 사실상 최종 후보군을 결정하는데, 정규식 휴리스틱만으로는 "조용한", "데이트",
  // "가족 모임" 같은 조건을 다룰 수 없다. 실패하면 휴리스틱 순서를 그대로 쓴다.
  const shortlistRelevance = await scoreShortlistRelevance(
    userInput,
    nearbyEvidences,
    stepLogger,
    { openAiApiKey: options.secrets?.openAiApiKey },
  ).catch(() => new Map<string, number>());

  // 어떤 브랜드가 체인인지는 목록이 아니라 이 후보 풀의 빈도로 정한다.
  const chainBrands = findChainBrands(nearbyEvidences.map((evidence) => evidence.name));

  const prioritizedEvidences = prioritizeEvidencesForEvaluation(
    nearbyEvidences,
    userInput,
    shortlistRelevance,
    chainBrands,
  );
  stepLogger.info("evaluateSeeds.evidence.built", {
    shortlistScoredCount: shortlistRelevance.size,
    evidenceCount: evidences.length,
    maxDistanceMeters,
    tooFarCount: tooFarEvidences.length,
    tooFar: tooFarEvidences.map((evidence) => ({
      name: evidence.name,
      distanceMeters: Math.round(evidence.accessibilitySignals.distanceMeters ?? 0),
    })),
    prioritizedCandidateIds: prioritizedEvidences.map((evidence) => evidence.candidateId),
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
  let evaluatedEvidenceCountForMeta = 0;
  let operationVerifiedCount = 0;
  let semanticPenalizedCount = 0;
  let referenceRejectedCount = 0;
  // 이 실행에서 쓰는 Chromium은 하나뿐이다. enrichment와 reference URL 해결이
  // 같은 인스턴스를 나눠 쓰고, 배치를 다 돈 뒤 한 번만 닫는다.
  const sharedBrowser = createSharedBrowserProvider();
  try {
    options.onProgress?.('enriching');
    const finishEnrichment = stepLogger.startTimer("evaluateSeeds.enrichment.success");
    stepLogger.info("evaluateSeeds.enrichment.start", {
      evidenceCount: prioritizedEvidences.length,
      client: "agentic",
      initialBatchSize: LIVE_MAX_CANDIDATES,
      maxEvidenceCount: getMaxEvidenceCount(prioritizedEvidences.length, config),
    });
    const enrichmentResult = await collectEnrichmentBatches({
      userInput,
      evidences: prioritizedEvidences,
      chainBrands,
      config,
      logger: stepLogger,
      enrichCandidates: (request, enrichmentLogger) =>
        enrichCandidates(request, enrichmentLogger, options, sharedBrowser.getBrowser),
      resolveReferenceUrls: (evidences, resolveOptions) =>
        resolveReferenceUrlsForEvidences(
          evidences,
          options,
          sharedBrowser.getBrowser,
          resolveOptions,
        ),
    });
    enrichedEvidences = enrichmentResult.enrichedEvidences;
    evaluatedEvidenceCountForMeta = enrichmentResult.evaluatedEvidenceCount;
    operationVerifiedCount = enrichmentResult.operationVerifiedCount;
    semanticPenalizedCount = enrichmentResult.semanticPenalizedCount;
    referenceRejectedCount = enrichmentResult.referenceRejectedCount;
    finishEnrichment({
      enrichmentCount: enrichmentResult.enrichments.length,
      evaluatedEvidenceCount: enrichmentResult.evaluatedEvidenceCount,
      skippedEvidenceCount: prioritizedEvidences.length - enrichmentResult.evaluatedEvidenceCount,
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

  // 업종을 지목하지 않은 요청에서만 업종 비율을 제한한다. "회기 곱창"에 걸면
  // 곱창집을 밀어내게 된다.
  const top = selectTopWithSpatialSpread(ranked, config.targetCount, {
    capCategoryShare: !requestNamesDishFamily(userInput.userNaturalLanguageRequest),
  });
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
    const funnel = {
      tooFarCount: tooFarEvidences.length,
      enrichedCount: evaluatedEvidenceCountForMeta,
      operationVerifiedCount,
      operationUnverifiedUsedCount: top.filter(
        (candidate) => candidate.evidence.operationUnverified,
      ).length,
      referenceRejectedCount,
    };

    // 목표를 못 채웠으면 더 찾아 달라고 알린다.
    //
    // 예전에는 "다음 페이지가 남아 있을 때"만 알렸다. 그런데 검색어 자체가 나쁘면
    // 첫 시도에 페이지가 소진되고, 그때가 바로 검색어를 새로 만들어야 할 때다.
    // 실측에서 "압구정 파인다이닝"의 검색어 4개 중 2개가 0건이었고("파인다이닝
    // 코스요리", "미쉐린 레스토랑" — 지도 업종 분류에 없는 말이다) 페이지가
    // 소진돼 재시도가 막힌 채 5곳만 나왔다.
    //
    // 지금까지 만든 결과를 함께 넘겨, 재시도가 끝내 실패해도 이것만은 남긴다.
    if (ranked.length < config.targetCount) {
      stepLogger.warn("evaluateSeeds.evaluation.needs_more_seeds", {
        reason: "LOW_QUALITY",
        rankedCount: ranked.length,
        targetCount: config.targetCount,
        nextQueryCount: discoverSeedsOutput.nextQueries.length,
        partialItemCount: output.items.length,
      });
      return {
        ok: true,
        needsMoreSeeds: {
          status: "NEEDS_MORE_SEEDS",
          reason: "LOW_QUALITY",
          excludeSeedKeys: [],
        },
        partial: { data: output, funnel },
      };
    }

    return { ok: true, data: output, funnel };
  } catch (error) {
    const failure = toEvaluateSeedsFailure(error);
    stepLogger.error("evaluateSeeds.evaluation.failure", error, {
      errorCode: failure.ok ? "UNKNOWN_EVALUATE_SEEDS_ERROR" : failure.errorCode,
    });
    return failure;
  }
};

/**
 * 사실상 같은 자리에 있는 두 후보로 추천 자리를 나눠 쓰지 않게 한다.
 *
 * 실측에서 "강남역 조용한 카페" 추천 두 곳의 거리가 **0m**(같은 지하상가), "을지로
 * 맥주 펍"의 두 곳이 1m, 중간지점의 두 곳이 10m였다. 다른 가게이긴 하지만 "어디로
 * 갈까"를 정하는 입장에서는 같은 자리라, 10개 중 한 칸을 사실상 낭비한다.
 *
 * 밀어낸 후보는 버리지 않고 뒤에 쌓아 뒀다가 자리가 남으면 채운다. 목록을 비워두는
 * 것보다는 가까운 후보라도 채우는 편이 낫다.
 */
const MIN_DISTINCT_PLACE_METERS = 60;

/**
 * 같은 브랜드가 목록에서 차지할 수 있는 최대 자리 수.
 *
 * 실측에서 "홍대 곱창" 추천 10건 중 3건이 `김덕후의곱창조`(홍대본점·2호점·3호점)였고,
 * "회기역 이자카야"는 `오사카고양이` 두 지점이 들어왔다. 같은 브랜드 지점은 사용자
 * 입장에서 사실상 같은 선택지라, 한 브랜드가 목록의 3할을 가져가면 고를 게 줄어든다.
 */
const MAX_PER_BRAND = 1;

/**
 * 후보가 모자라 밀어낸 것을 되채울 때 허용하는 브랜드당 최대 자리 수.
 *
 * 상한 1을 넘겨야 목록을 채울 수 있는 상황에서도, 한 브랜드가 목록의 3할을
 * 가져가는 것보다는 2할에서 멈추는 편이 낫다.
 */
const MAX_PER_BRAND_WHEN_SHORT = 2;

/**
 * 업종을 지목하지 않은 요청에서 한 업종이 차지할 수 있는 최대 비율.
 *
 * "다 같이 모여서 저녁 먹을 곳"처럼 업종 제약이 없는 요청에 중식이 10건 중 7건을
 * 차지한 적이 있다. 틀린 답은 아니지만, 고르라고 주는 목록에서 한 업종이 7할이면
 * 고를 게 없는 것과 같다. 반대로 "회기 곱창"에 이 제한을 걸면 곱창집을 밀어내게
 * 되므로, 업종을 지목한 요청에는 적용하지 않는다.
 */
const MAX_CATEGORY_SHARE = 0.4;

export const selectTopWithSpatialSpread = (
  ranked: RankedCandidate[],
  targetCount: number,
  { capCategoryShare = false }: { capCategoryShare?: boolean } = {},
): RankedCandidate[] => {
  const picked: RankedCandidate[] = [];
  const deferred: RankedCandidate[] = [];
  const brandCounts = new Map<string, number>();
  const categoryCounts = new Map<string, number>();
  const maxPerCategory = Math.max(1, Math.floor(targetCount * MAX_CATEGORY_SHARE));

  for (const candidate of ranked) {
    if (picked.length >= targetCount) break;

    const isCrowded = picked.some(
      (chosen) =>
        toDistanceMeters(toSeedCoordinate(chosen), toSeedCoordinate(candidate)) <
        MIN_DISTINCT_PLACE_METERS,
    );
    const brand = toBrandKey(candidate.evidence.name);
    const isBrandFull = (brandCounts.get(brand) ?? 0) >= MAX_PER_BRAND;
    const category = toCategoryKey(candidate);
    const isCategoryFull =
      capCategoryShare && (categoryCounts.get(category) ?? 0) >= maxPerCategory;

    if (isCrowded || isBrandFull || isCategoryFull) {
      deferred.push(candidate);
      continue;
    }
    picked.push(candidate);
    brandCounts.set(brand, (brandCounts.get(brand) ?? 0) + 1);
    categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
  }

  // 밀어낸 후보는 버리지 않는다. 목록을 비워두는 것보다는 채우는 편이 낫다.
  //
  // 다만 한 번에 다 풀면 상한이 통째로 무력해진다. 실측에서 후보가 14개뿐이던
  // "회기역 이자카야"에 `오사카고양이` 세 지점이 그렇게 들어왔다. 브랜드 상한을
  // 조금만 늘려 한 번 더 채우고, 그래도 모자랄 때만 완전히 푼다.
  fillFromDeferred(picked, deferred, targetCount, brandCounts, MAX_PER_BRAND_WHEN_SHORT);
  fillFromDeferred(picked, deferred, targetCount, brandCounts, Number.POSITIVE_INFINITY);

  return picked;
};

const fillFromDeferred = (
  picked: RankedCandidate[],
  deferred: RankedCandidate[],
  targetCount: number,
  brandCounts: Map<string, number>,
  maxPerBrand: number,
): void => {
  for (const candidate of deferred) {
    if (picked.length >= targetCount) return;
    if (picked.includes(candidate)) continue;

    const brand = toBrandKey(candidate.evidence.name);
    if ((brandCounts.get(brand) ?? 0) >= maxPerBrand) continue;

    picked.push(candidate);
    brandCounts.set(brand, (brandCounts.get(brand) ?? 0) + 1);
  }
};

/** 지점명을 떼어낸 브랜드 이름. 의미 판정의 체인 집계와 같은 규칙을 쓴다. */
const toBrandKey = toSemanticBrandKey;

const toCategoryKey = (candidate: RankedCandidate): string =>
  candidate.evidence.category.subCategory ||
  candidate.evidence.category.mainCategory ||
  "기타";

const toSeedCoordinate = (candidate: RankedCandidate): Coordinate => ({
  lat: candidate.evidence.raw.seed.latitude,
  lng: candidate.evidence.raw.seed.longitude,
});

const getSeedKey = (discoverSeedsOutput: DiscoverSeedsOutput, index: number): string => {
  const seedKey = discoverSeedsOutput.seedKeys[index];
  if (!seedKey) {
    throw new Error(`Missing seedKey for discovered seed index ${index}`);
  }
  return seedKey;
};

/**
 * LLM 사전 선별 점수를 휴리스틱과 같은 눈금으로 맞추기 위한 배율.
 *
 * 휴리스틱은 의도 일치 +30, 음식 계열 ±25, 의미 감점 −40~−20, 거리 0~20 규모다.
 * 0~100 점수에 0.8을 곱하면 0~80이 되어 **주 기준으로 작동하되**, 휴리스틱이
 * 확실하게 아는 것(업종 충돌 −40 등)은 여전히 뒤집을 수 있다.
 */
const SHORTLIST_RELEVANCE_WEIGHT = 0.8;

const prioritizeEvidencesForEvaluation = (
  evidences: CandidateScoringEvidence[],
  userInput: UserInput,
  shortlistRelevance: Map<string, number> = new Map(),
  chainBrands: ChainBrands = new Set(),
): CandidateScoringEvidence[] => {
  // 점수를 못 받은 후보는 받은 후보들의 중간값으로 채운다. 0을 주면 LLM 호출이
  // 일부 실패했을 때 그 후보들만 통째로 뒤로 밀려 조사조차 못 받는다.
  const scored = [...shortlistRelevance.values()].sort((a, b) => a - b);
  const fallbackRelevance = scored.length > 0 ? (scored[Math.floor(scored.length / 2)] ?? 50) : 0;

  const ordered = evidences
    .map((evidence, index) => ({
      evidence,
      index,
      score:
        getLightweightEvaluationPriority(evidence, userInput, chainBrands) +
        (shortlistRelevance.get(evidence.candidateId) ?? fallbackRelevance) *
          SHORTLIST_RELEVANCE_WEIGHT,
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(({ evidence }) => evidence);

  // 업종을 지목한 요청은 점수 순 그대로 둔다. "회기 곱창"에 업종을 섞으면
  // 곱창집 대신 카페와 분식집을 조사하게 된다.
  if (requestNamesDishFamily(userInput.userNaturalLanguageRequest)) return ordered;

  return interleaveByCategory(ordered);
};

/**
 * 업종별로 번갈아 배치한다. 포괄적인 요청에만 쓴다.
 *
 * 조사(enrichment)는 예산이 정해져 있어 앞쪽 후보만 보고 끝난다. 요청이 포괄적이면
 * 업종 가점이 모든 음식점에 똑같이 붙어서 사실상 **거리가 순서를 지배**하고,
 * 결과적으로 가장 가까운 한두 업종만 조사된다. 실측에서 "다 같이 저녁 먹을 곳"에
 * 검색어는 한식·중식·이탈리안으로 잘 나뉘었는데도 조사된 30건이 근처 중식·한식에
 * 쏠려 추천 10건이 중식 6 / 한식 4가 됐고 이탈리안은 한 곳도 남지 않았다.
 *
 * 여기서 섞어야 한다. 조사되지 않은 후보는 나중에 어떤 방법으로도 되살릴 수 없다.
 */
const interleaveByCategory = (
  evidences: CandidateScoringEvidence[],
): CandidateScoringEvidence[] => {
  const buckets = new Map<string, CandidateScoringEvidence[]>();
  for (const evidence of evidences) {
    const key = evidence.category.subCategory || evidence.category.mainCategory || "기타";
    const bucket = buckets.get(key);
    if (bucket) bucket.push(evidence);
    else buckets.set(key, [evidence]);
  }

  // 각 업종의 1순위를 먼저, 그다음 2순위를 도는 식으로 채운다. 업종 내부의
  // 순서는 위에서 매긴 점수 순 그대로다.
  const lists = [...buckets.values()];
  const maxBucketSize = Math.max(...lists.map((list) => list.length));
  const interleaved: CandidateScoringEvidence[] = [];
  for (let rank = 0; rank < maxBucketSize; rank += 1) {
    for (const list of lists) {
      const evidence = list[rank];
      if (evidence) interleaved.push(evidence);
    }
  }
  return interleaved;
};

const getLightweightEvaluationPriority = (
  evidence: CandidateScoringEvidence,
  userInput: UserInput,
  chainBrands: ChainBrands = new Set(),
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

  const distanceMeters = evidence.accessibilitySignals.distanceMeters;
  if (distanceMeters !== undefined) {
    score += Math.max(0, 20 - distanceMeters / 500);
  }
  // 요청이 특정 음식을 지목했으면, 그 음식을 파는 곳을 먼저 조사한다.
  // 위의 intent 가점(+30)은 "음식점이면 전부"라서 곱창집과 김밥집이 동점이 된다.
  score += scoreDishAffinity(request, candidateText) * 25;

  // 의미가 어긋나는 후보는 조사 순서에서도 뒤로 보낸다.
  //
  // 예전에는 의미 판정을 조사가 끝난 뒤 채점에서만 썼다. 그런데 조사 예산이
  // 한정돼 있어서, 역세권처럼 어긋나는 후보가 조밀한 곳에서는 그것들이 거리
  // 점수로 앞자리를 차지하고 풀을 채워 버린다. 실측에서 "강남역 조용한 카페"의
  // 최종 10건 중 3건이 크게 감점된 프랜차이즈(36·31·29점)였다 — 그 위에 남은
  // 후보가 6개뿐이라 자리를 채우려고 끌어올린 결과였다.
  //
  // 이 판정은 상호와 업종만 보므로 조사 전에도 그대로 쓸 수 있다.
  const semanticFit = assessSemanticFit(evidence, chainBrands);
  if (semanticFit.severity === "STRONG") score -= 40;
  else if (semanticFit.severity === "SOFT") score -= 20;

  if (evidence.placeInfo.roadAddress || evidence.placeInfo.address) score += 5;
  if (evidence.trustSignals.evidenceUrls.length > 0) score += 5;
  // 카카오에서 나온 seed는 참조 URL을 이미 들고 있다. 확인에 REST 호출도,
  // 네이버 지도 스크랩도 필요 없다. 출력 계약은 참조 URL이 없는 후보를 아예
  // 받지 않으므로, 이런 후보를 먼저 조사하면 같은 배치 예산으로 살아남는
  // 후보가 늘어난다. 다만 의미 적합(+30)이나 거리(+20)를 뒤집을 만큼 크게
  // 주지는 않는다 — 어디까지나 동점을 가르는 용도다.
  if (findExistingKakaoMapUrl(evidence) !== undefined) score += 8;

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
  resolveOptions: { allowNaverFallback?: boolean } = {},
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
      allowNaverFallback: resolveOptions.allowNaverFallback === true,
    }),
  );
};

