import { hasToolCall, stepCountIs } from "ai";

import type { UserInput } from "../../../interfaces/input.contracts.js";
import {
  generateRecommendationText,
  RECOMMENDATION_LLM_MODEL_ID,
} from "../../../llm/ai-sdk.js";
import type { Logger } from "../../../observability/logger.js";
import type { CandidateScoringEvidence } from "../utils/evidence.js";
import { buildUnknownEnrichment, unique } from "../utils/enrichment-merge.js";
import type {
  AgenticEnrichmentSource,
  AgenticWebEnrichmentOptions,
  AgenticWebEnrichmentToolEvent,
  CandidateEnrichment,
  CandidateEnrichmentClient,
} from "../utils/enrichment-types.js";
import { OperationVerifier } from "../utils/operation-hours.js";
import { parseOperationInfoWithLlmFallback } from "./operation-info.js";
import { inferPriceRangePerPersonFromText } from "../utils/price.js";
import type { UrlScrapeCache } from "../utils/scrape-cache.js";
import { loadPlaywright } from "../tools/shared/browser.js";
import type { PlaywrightBrowser, UrlScrapeResult } from "../tools/types.js";
import {
  createAgenticEnrichmentTools,
  type AgenticFinalizeCandidateEvidence,
} from "../tools/agentic-enrichment-tools.js";

const DEFAULT_SCRAPER_TIMEOUT_MS = 15_000;
const DEFAULT_SETTLE_MS = 2_000;
const DEFAULT_MAX_CONCURRENCY = 4;
const DEFAULT_AGENTIC_MODEL_ID = RECOMMENDATION_LLM_MODEL_ID;
const DEFAULT_AGENTIC_MAX_CANDIDATES = 8;
const DEFAULT_AGENTIC_MAX_FETCHES_PER_CANDIDATE = 3;
const DEFAULT_AGENTIC_MAX_TOOL_STEPS = 5;
const DEFAULT_AGENTIC_TIMEOUT_MS = 35_000;

const buildAgenticEnrichmentSystemPrompt = (limits: {
  maxFetchesPerCandidate: number;
  maxToolSteps: number;
}): string => `너는 한국 로컬 장소 추천 엔진의 근거 수집 에이전트다.
목표는 후보 장소의 실제 영업시간과 장소 일치도를 검증할 수 있는 근거를 모으는 것이다.

사용 가능한 tool:
- kakaoLocalLookup: 카카오 로컬에서 후보를 검색한다. place_url, 좌표, 상호명 일치도 같은 "실제 장소 존재/참조 URL" 검증에 가장 중요하다.
- naverSearchLookup: 네이버 블로그/웹 검색 스니펫을 받아 외부 언급/리뷰 신호를 본다.
- naverMapScrape: 네이버 지도 페이지를 직접 스크랩한다. 영업시간/휴무/리뷰/상세 페이지 텍스트 검증에 강하지만 비싸므로 다른 source가 부족할 때 사용.
- searchEvidence: 자유 검색어로 네이버 블로그/웹 검색.
- fetchUrl: searchEvidence가 반환한 URL의 본문을 가져온다. 후보당 최대 ${limits.maxFetchesPerCandidate}회.
- finalizeCandidateEvidence: 종합 후 반드시 마지막에 호출한다.

전략 (전체 tool 호출은 최대 ${limits.maxToolSteps} step 안에서 끝낸다):
1) 먼저 kakaoLocalLookup으로 후보 일치와 영업시간을 확인한다.
2) Kakao가 "OPEN"/"CLOSED" 상태를 반환하면 selectedSource="kakao-local"로 채택한다.
3) Kakao가 UNKNOWN이어도 place_url과 identityMatchScore가 높으면 reference 근거로는 유효하다. 영업시간은 naverSearchLookup / searchEvidence + fetchUrl / naverMapScrape로 보강한다.
4) Naver Search snippet에 "영업시간", "운영시간", "휴무", "연중무휴", "주중/주말" 문구가 있고 OPEN/CLOSED가 반환되면 즉시 selectedSource="naver-search"로 finalize한다. 추가 fetch나 naverMapScrape를 하지 않는다.
5) searchEvidence/fetchUrl로 주간 운영시간 원문을 확보했고 parse 가능한 rawTextSnippet이 있으면 selectedSource="agentic"로 finalize한다. 추가 Naver Map 확인을 기다리지 않는다.
6) naverMapScrape는 마지막 수단이다. Kakao place_url 또는 Naver Search가 장소 일치를 강하게 시사하지만 영업시간 원문이 없을 때 후보당 최대 1회만 사용한다. Naver Map이 UNKNOWN이면 더 반복하지 말고 UNKNOWN으로 finalize한다.
7) 이미 어떤 deterministic tool이 OPEN/CLOSED를 반환한 뒤에는 더 비싼 tool을 호출하지 않는다.

finalize 규칙:
- selectedSource: 가장 신뢰할 만한 단일 source를 명시. 외부 source 채택 시 그 tool의 결과를 그대로 신뢰한다.
- Kakao/Naver reference URL은 엔진이 같은 query/identity scoring 전략으로 별도 검증한다. reference URL을 추측하지 말고 tool 결과의 identityMatchScore와 실제 sourceUrls만 근거로 삼는다.
- selectedSource === "agentic"일 때만 rawTextSnippet에 영업시간 원문을 그대로 복사하고, sourceUrls에 근거 URL을 채운다. 다른 source 채택 시 둘 다 비워도 된다.
- selectedSource는 영업시간 판정을 뒷받침하는 source로 고른다. Kakao가 reference만 확인하고 영업시간은 UNKNOWN이면 Kakao를 selectedSource로 고르지 말고, 시간 근거가 있는 Naver/Search/agentic source를 고른다.
- OPEN/CLOSED가 하나라도 확인되면 빠르게 finalize해 전체 batch가 timeout되지 않게 한다.
- reason: 채택 이유를 한국어 1~2문장으로.
- identityMatchScore: 후보명/주소가 결과와 얼마나 맞는지 (0~1).
- sourceAgreementCount: 동일한 영업시간을 보인 source 수. 모르면 비움.
- 확실한 근거가 없으면 추측하지 말고 reason에 부족한 점을 명시한다.`;

const buildAgenticEnrichmentPrompt = (
  userInput: UserInput,
  evidence: CandidateScoringEvidence,
  operationVerifier: OperationVerifier,
): string =>
  [
    "다음 후보의 영업시간과 신뢰 근거를 보강해줘.",
    "검색어에는 장소명, 주소 또는 동네, '영업시간'을 포함해.",
    "```json",
    JSON.stringify(
      {
        requestedSchedule: {
          dateISO: userInput.schedule.dateISO,
          dayOfWeek: operationVerifier.requestedDayOfWeek,
          time24h: userInput.schedule.time24h,
          stayDurationMinutes: userInput.schedule.stayDurationMinutes,
        },
        candidate: {
          candidateId: evidence.candidateId,
          name: evidence.name,
          category: evidence.category,
          address: evidence.placeInfo.address,
          roadAddress: evidence.placeInfo.roadAddress,
          placeUrl: evidence.placeInfo.placeUrl,
        },
        existingSignals: {
          naturalLanguageRequest: evidence.userFit.naturalLanguageRequest,
          trustSignals: evidence.trustSignals,
          accessibilitySignals: evidence.accessibilitySignals,
        },
      },
      null,
      2,
    ),
    "```",
  ].join("\n");

export const createAgenticWebEnrichmentClient = ({
  modelId = DEFAULT_AGENTIC_MODEL_ID,
  openAiApiKey,
  kakaoRestApiKey,
  clientId,
  clientSecret,
  maxCandidates = DEFAULT_AGENTIC_MAX_CANDIDATES,
  maxConcurrency = DEFAULT_MAX_CONCURRENCY,
  maxFetchesPerCandidate = DEFAULT_AGENTIC_MAX_FETCHES_PER_CANDIDATE,
  maxToolSteps = DEFAULT_AGENTIC_MAX_TOOL_STEPS,
  timeoutMs = DEFAULT_AGENTIC_TIMEOUT_MS,
  fetchCache,
  headless = true,
  scrapeTimeoutMs = DEFAULT_SCRAPER_TIMEOUT_MS,
  scrapeSettleMs = DEFAULT_SETTLE_MS,
  kakaoScrapeCache,
  kakaoScrapePlaceDetails = true,
  naverMapScrapeCache,
  onToolEvent,
  logger,
}: AgenticWebEnrichmentOptions = {}): CandidateEnrichmentClient => {
  return async ({ userInput, evidences }) => {
    const operationVerifier = new OperationVerifier(userInput.schedule);

    if (!clientId || !clientSecret) {
      return evidences.map((evidence) =>
        buildUnknownEnrichment(
          evidence.candidateId,
          operationVerifier,
          "Naver Search credentials were not configured",
          "agentic-web",
        ),
      );
    }

    let browserPromise: Promise<PlaywrightBrowser> | undefined;
    const getBrowser = (): Promise<PlaywrightBrowser> => {
      browserPromise ??= Promise.resolve().then(() =>
        loadPlaywright().chromium.launch({ headless }),
      );
      return browserPromise;
    };

    try {
      return await mapWithConcurrency(
        evidences.slice(0, maxCandidates),
        maxConcurrency,
        async (evidence) => {
          const abortController = new AbortController();
          const timeout = setTimeout(() => abortController.abort(), timeoutMs);
          try {
            return await enrichWithAgenticWeb(
              userInput,
              evidence,
              operationVerifier,
              {
                modelId,
                openAiApiKey,
                kakaoRestApiKey,
                clientId,
                clientSecret,
                maxFetchesPerCandidate,
                maxToolSteps,
                timeoutMs,
                scrapeTimeoutMs,
                scrapeSettleMs,
                kakaoScrapePlaceDetails,
                fetchCache,
                kakaoScrapeCache,
                naverMapScrapeCache,
                scrapeRequests: new Map(),
                getBrowser,
                onToolEvent,
                logger,
                abortSignal: abortController.signal,
              },
            );
          } catch (error) {
            return buildUnknownEnrichment(
              evidence.candidateId,
              operationVerifier,
              error instanceof Error ? error.message : String(error),
              "agentic-web",
            );
          } finally {
            clearTimeout(timeout);
          }
        },
      );
    } finally {
      const browser = await browserPromise;
      await browser?.close();
    }
  };
};

const mapWithConcurrency = async <TItem, TResult>(
  items: TItem[],
  concurrency: number,
  mapper: (item: TItem, index: number) => Promise<TResult>,
): Promise<TResult[]> => {
  const results = new Array<TResult>(items.length);
  let nextIndex = 0;
  const workerCount =
    items.length <= 0 || !Number.isFinite(concurrency)
      ? 1
      : Math.max(1, Math.min(items.length, Math.floor(concurrency)));

  const workers = Array.from(
    { length: workerCount },
    async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        const item = items[index];
        if (item === undefined) continue;
        results[index] = await mapper(item, index);
      }
    },
  );

  await Promise.all(workers);
  return results;
};

const withTimeout = async <TResult>(
  promise: Promise<TResult>,
  timeoutMs: number,
  message: string,
): Promise<TResult> => {
  let timeout: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
};

type AgenticWebCandidateOptions = Required<
  Pick<
    AgenticWebEnrichmentOptions,
    | "modelId"
    | "clientId"
    | "clientSecret"
    | "maxFetchesPerCandidate"
    | "maxToolSteps"
    | "timeoutMs"
    | "scrapeTimeoutMs"
    | "scrapeSettleMs"
    | "kakaoScrapePlaceDetails"
  >
> & {
  openAiApiKey?: AgenticWebEnrichmentOptions["openAiApiKey"];
  kakaoRestApiKey?: AgenticWebEnrichmentOptions["kakaoRestApiKey"];
  fetchCache?: UrlScrapeCache;
  kakaoScrapeCache?: UrlScrapeCache;
  naverMapScrapeCache?: UrlScrapeCache;
  scrapeRequests: Map<string, Promise<UrlScrapeResult>>;
  getBrowser: () => Promise<PlaywrightBrowser>;
  onToolEvent?: (event: AgenticWebEnrichmentToolEvent) => void;
  logger?: Logger;
  abortSignal?: AbortSignal;
};

const enrichWithAgenticWeb = async (
  userInput: UserInput,
  evidence: CandidateScoringEvidence,
  operationVerifier: OperationVerifier,
  options: AgenticWebCandidateOptions,
): Promise<CandidateEnrichment> => {
  const { tools, getFinalized, enrichmentMemo } = createAgenticEnrichmentTools({
    evidence,
    operationVerifier,
    options,
  });

  await withTimeout(
    generateRecommendationText({
      task: "evaluate.enrichment",
      modelId: options.modelId,
      openAiApiKey: options.openAiApiKey,
      tools,
      stopWhen: [
        hasToolCall("finalizeCandidateEvidence"),
        stepCountIs(options.maxToolSteps),
      ],
      maxOutputTokens: 700,
      timeout: { totalMs: options.timeoutMs, stepMs: options.timeoutMs },
      abortSignal: options.abortSignal,
      system: buildAgenticEnrichmentSystemPrompt({
        maxFetchesPerCandidate: options.maxFetchesPerCandidate,
        maxToolSteps: options.maxToolSteps,
      }),
      prompt: buildAgenticEnrichmentPrompt(
        userInput,
        evidence,
        operationVerifier,
      ),
    }),
    options.timeoutMs,
    `Agentic web enrichment timed out after ${options.timeoutMs}ms`,
  );

  const finalized = getFinalized();

  if (!finalized) {
    return (
      getBestMemoEntry(enrichmentMemo)?.enrichment ??
      buildUnknownEnrichment(
        evidence.candidateId,
        operationVerifier,
        "Agentic web enrichment did not finalize candidate evidence",
        "agentic-web",
      )
    );
  }

  return await buildFinalEnrichmentFromAgentic(
    finalized,
    enrichmentMemo,
    evidence,
    operationVerifier,
    {
      onToolEvent: options.onToolEvent,
      openAiApiKey: options.openAiApiKey,
    },
  );
};

const buildFinalEnrichmentFromAgentic = async (
  finalized: AgenticFinalizeCandidateEvidence,
  memo: Map<AgenticEnrichmentSource, CandidateEnrichment>,
  evidence: CandidateScoringEvidence,
  operationVerifier: OperationVerifier,
  options: Pick<AgenticWebEnrichmentOptions, "onToolEvent" | "openAiApiKey">,
): Promise<CandidateEnrichment> => {
  if (finalized.selectedSource === "agentic") {
    const operationParse = await parseOperationInfoWithLlmFallback({
      text: finalized.rawTextSnippet,
      evidence,
      operationVerifier,
      sourceName: "agentic-web",
      sourceTextKind: "agentic_fetch",
      openAiApiKey: options.openAiApiKey,
    });
    const operationInfo = operationParse.operationInfo;
    const sourceUrls = unique(finalized.sourceUrls);
    const operationVerification = operationInfo
      ? operationVerifier.verify(operationInfo, sourceUrls)
      : operationVerifier.unknown({
          reason: operationParse.reason || finalized.reason,
          sourceUrls,
          confidence: finalized.confidence,
        });

    options.onToolEvent?.({
      type: "finalize",
      candidateId: evidence.candidateId,
      source: "agentic",
      status: operationVerification.status,
      reason: operationVerification.reason,
      sourceUrls,
      confidence: operationVerification.confidence,
    });

    const supportingSourceDetails = getSupportingSourceDetails(
      memo,
      finalized.selectedSource,
    );

    return {
      candidateId: evidence.candidateId,
      source: "agentic-web",
      sourceUrls,
      operationInfo,
      operationVerification,
      priceRangePerPerson: inferPriceRangePerPersonFromText(
        finalized.rawTextSnippet,
        evidence.category,
      ),
      trustSignals: {
        webMentionCount: finalized.webMentionCount,
        sourceAgreementCount:
          finalized.sourceAgreementCount ?? (sourceUrls.length > 0 ? 1 : 0),
        placeMatchScore: finalized.identityMatchScore,
      },
      rawTextSnippet: finalized.rawTextSnippet.slice(0, 2_000),
      sourceDetails: [
        ...supportingSourceDetails,
        {
          source: "agentic-web",
          status: operationVerification.status,
          reason: operationVerification.reason,
          sourceUrls,
          confidence: operationVerification.confidence,
          identityMatchScore: finalized.identityMatchScore,
          operationParser: operationParse.parser,
          operationParseReason: operationParse.reason,
          sourceTextKind: "agentic_fetch",
          rawTextSnippet: finalized.rawTextSnippet.slice(0, 700),
        },
      ],
    };
  }

  const baseEntry = chooseExternalBaseEntry(finalized.selectedSource, memo);
  if (!baseEntry) {
    return buildUnknownEnrichment(
      evidence.candidateId,
      operationVerifier,
      `Agentic selected ${finalized.selectedSource} without calling its lookup tool`,
      "agentic-web",
    );
  }
  const { source: baseSource, enrichment: base } = baseEntry;
  const finalizedReason =
    baseSource === finalized.selectedSource
      ? finalized.reason
      : `${finalized.reason} Selected ${finalized.selectedSource} was UNKNOWN, so ${baseSource} memo was used.`;

  const mergedTrustSignals = {
    ...(base.trustSignals ?? {}),
    ...(finalized.identityMatchScore !== undefined
      ? { placeMatchScore: finalized.identityMatchScore }
      : {}),
    ...(finalized.webMentionCount !== undefined
      ? { webMentionCount: finalized.webMentionCount }
      : {}),
    ...(finalized.sourceAgreementCount !== undefined
      ? { sourceAgreementCount: finalized.sourceAgreementCount }
      : {}),
  };
  const finalizedPriceRange = inferPriceRangePerPersonFromText(
    finalized.rawTextSnippet,
    evidence.category,
  );
  const supportingSourceDetails = getSupportingSourceDetails(memo, baseSource);

  options.onToolEvent?.({
    type: "finalize",
    candidateId: evidence.candidateId,
    source: baseSource,
    status: base.operationVerification.status,
    reason: finalizedReason,
    sourceUrls: base.sourceUrls,
    confidence: base.operationVerification.confidence,
  });

  return {
    ...base,
    priceRangePerPerson: base.priceRangePerPerson ?? finalizedPriceRange,
    trustSignals: mergedTrustSignals,
    sourceDetails: [
      ...(base.sourceDetails ?? []),
      ...supportingSourceDetails,
      {
        source: "agentic-web",
        status: base.operationVerification.status,
        reason: finalizedReason,
        sourceUrls: base.sourceUrls,
        confidence: finalized.confidence,
        identityMatchScore: finalized.identityMatchScore,
      },
    ],
  };
};

type MemoEntry = {
  source: AgenticEnrichmentSource;
  enrichment: CandidateEnrichment;
};

const chooseExternalBaseEntry = (
  selectedSource: Exclude<AgenticEnrichmentSource, "agentic">,
  memo: Map<AgenticEnrichmentSource, CandidateEnrichment>,
): MemoEntry | undefined => {
  const selected = memo.get(selectedSource);
  if (!selected) return undefined;
  if (selected.operationVerification.status !== "UNKNOWN") {
    return { source: selectedSource, enrichment: selected };
  }

  const best = getBestMemoEntry(memo);
  if (best?.enrichment.operationVerification.status !== "UNKNOWN") {
    return best;
  }
  return { source: selectedSource, enrichment: selected };
};

const getSupportingSourceDetails = (
  memo: Map<AgenticEnrichmentSource, CandidateEnrichment>,
  selectedSource: AgenticEnrichmentSource,
): NonNullable<CandidateEnrichment["sourceDetails"]> =>
  [...memo.entries()]
    .filter(([source]) => source !== selectedSource)
    .flatMap(([, enrichment]) => enrichment.sourceDetails ?? []);

const getBestMemoEntry = (
  memo: Map<AgenticEnrichmentSource, CandidateEnrichment>,
): MemoEntry | undefined => {
  const entries = [...memo.entries()].map(([source, enrichment]) => ({
    source,
    enrichment,
  }));
  const byConfidence = [...entries].sort(
    (left, right) =>
      (right.enrichment.operationVerification.confidence ?? 0) -
      (left.enrichment.operationVerification.confidence ?? 0),
  );
  return (
    entries.find(({ enrichment }) => isOpenEnrichment(enrichment)) ??
    entries.find(({ enrichment }) => isClosedEnrichment(enrichment)) ??
    byConfidence[0]
  );
};

const isOpenEnrichment = (enrichment: CandidateEnrichment): boolean =>
  enrichment.operationVerification.status === "OPEN" &&
  enrichment.operationInfo !== undefined;

const isClosedEnrichment = (enrichment: CandidateEnrichment): boolean =>
  enrichment.operationVerification.status === "CLOSED";
