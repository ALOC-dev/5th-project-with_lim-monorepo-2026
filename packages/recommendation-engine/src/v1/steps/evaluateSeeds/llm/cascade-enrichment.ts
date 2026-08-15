import type { Logger } from "../../../observability/logger.js";
import type { UrlScrapeResult } from "../tools/types.js";
import { enrichWithKakaoLocal } from "../tools/vendors/kakao-local.js";
import { scrapeNaverMapCandidate } from "../tools/vendors/naver-map.js";
import { enrichWithNaverSearch } from "../tools/vendors/naver-search.js";
import { buildUnknownEnrichment, unique } from "../utils/enrichment-merge.js";
import type {
  CandidateEnrichment,
  CandidateEnrichmentClient,
  CascadeEnrichmentOptions,
} from "../utils/enrichment-types.js";
import type { CandidateScoringEvidence } from "../utils/evidence.js";
import { OperationVerifier } from "../utils/operation-hours.js";
import { createBoundedWebFallbackClient } from "./bounded-web-fallback.js";
import type { OperationInfoParseResult } from "./operation-info.js";
import { parseOperationInfoWithLlmFallback } from "./operation-info.js";

// live 검증은 엔진 요청 자체를 동시성 2로 돌린다. 후보를 4개씩 동시에 보내면
// Naver Blog/Web 두 endpoint까지 합쳐 순간 16요청이 되어 Retry-After가 길게 걸렸다.
// 요구 상한(최대 4) 안에서 요청당 2로 제한해 전체 burst를 8요청으로 유지한다.
const DETERMINISTIC_PROBE_CONCURRENCY = 2;
const CASCADE_MAP_TIMEOUT_MS = 12_000;
const TARGETED_OPERATION_LLM_CONCURRENCY = 2;
const TARGETED_OPERATION_LLM_TIMEOUT_MS = 8_000;

type CascadeCandidate = {
  evidence: CandidateScoringEvidence;
  memo: CandidateEnrichment[];
  selected?: CandidateEnrichment;
  targetedLlmBudgetConsumed: boolean;
};

export type CascadeEnrichmentDependencies = {
  enrichWithKakaoLocal: typeof enrichWithKakaoLocal;
  enrichWithNaverSearch: typeof enrichWithNaverSearch;
  scrapeNaverMapCandidate: typeof scrapeNaverMapCandidate;
  parseOperationInfoWithLlmFallback: (
    options: Parameters<typeof parseOperationInfoWithLlmFallback>[0],
  ) => Promise<OperationInfoParseResult>;
  createBoundedWebFallbackClient: typeof createBoundedWebFallbackClient;
};

const DEFAULT_DEPENDENCIES: CascadeEnrichmentDependencies = {
  enrichWithKakaoLocal,
  enrichWithNaverSearch,
  scrapeNaverMapCandidate,
  parseOperationInfoWithLlmFallback,
  createBoundedWebFallbackClient,
};

export const createCascadeEnrichmentClient = (
  options: CascadeEnrichmentOptions,
  dependencies: CascadeEnrichmentDependencies = DEFAULT_DEPENDENCIES,
): CandidateEnrichmentClient => {
  return async ({ userInput, evidences }) => {
    const operationVerifier = new OperationVerifier(userInput.schedule);
    const logger = options.logger;
    const states = await mapWithConcurrency(
      evidences,
      DETERMINISTIC_PROBE_CONCURRENCY,
      async (evidence): Promise<CascadeCandidate> => {
        const candidateLogger = logger?.withContext({
          extra: { candidateId: evidence.candidateId },
        });
        const finish = candidateLogger?.startTimer(
          "evaluateSeeds.enrichment.cascade.probe.success",
        );
        const [kakao, naver] = await Promise.all([
          safeProbe(
            () =>
              dependencies.enrichWithKakaoLocal(evidence, operationVerifier, {
                getBrowser: requireBrowser(options),
                timeoutMs: options.scrapeTimeoutMs ?? 20_000,
                settleMs: options.scrapeSettleMs ?? 750,
                scrapeCache: options.kakaoScrapeCache,
                scrapeRequests: new Map(),
                scrapePlaceDetails: false,
                kakaoRestApiKey: options.kakaoRestApiKey,
                openAiApiKey: options.openAiApiKey,
                allowLlmFallback: false,
                logger,
              }),
            evidence,
            operationVerifier,
            "kakao-local",
            logger,
          ),
          safeProbe(
            () =>
              dependencies.enrichWithNaverSearch(evidence, operationVerifier, {
                clientId: options.clientId ?? "",
                clientSecret: options.clientSecret ?? "",
                openAiApiKey: options.openAiApiKey,
                allowLlmFallback: false,
                retryLimit: 0,
                logger,
              }),
            evidence,
            operationVerifier,
            "naver-search",
            logger,
          ),
        ]);
        const memo = [kakao, naver];
        const selected = selectConsistentOperationSource(memo);
        finish?.({
          statuses: memo.map((enrichment) => ({
            source: enrichment.source,
            status: enrichment.operationVerification.status,
          })),
          selectedSource: selected?.source,
        });
        return { evidence, memo, selected, targetedLlmBudgetConsumed: false };
      },
    );

    // Naver Map은 후보 동일성이 강한 결정론 source다. free-search보다 먼저 확인해서
    // 여기서 확정되는 후보는 추가 검색/fetch queue를 전혀 소비하지 않게 한다.
    const mapFallbackStates = states.filter(
      (state) => !state.selected || hasSourceConflict(state.memo),
    );
    const naverMapScrapeRequests = new Map<string, Promise<UrlScrapeResult>>();
    await mapWithConcurrency(
      mapFallbackStates,
      DETERMINISTIC_PROBE_CONCURRENCY,
      async (state) => {
        logger?.info("evaluateSeeds.enrichment.cascade.branch", {
          candidateId: state.evidence.candidateId,
          branch: "NAVER_MAP",
        });
        const naverMap = await safeProbe(
          () =>
            dependencies.scrapeNaverMapCandidate(state.evidence, operationVerifier, {
              getBrowser: requireBrowser(options),
              timeoutMs: Math.min(options.scrapeTimeoutMs ?? CASCADE_MAP_TIMEOUT_MS, CASCADE_MAP_TIMEOUT_MS),
              settleMs: options.scrapeSettleMs ?? 750,
              scrapeCache: options.naverMapScrapeCache,
              scrapeRequests: naverMapScrapeRequests,
              openAiApiKey: options.openAiApiKey,
              allowLlmFallback: false,
              logger,
            }),
          state.evidence,
          operationVerifier,
          "naver-map",
          logger,
        );
        state.memo.push(naverMap);
      },
    );

    for (const state of mapFallbackStates) {
      state.selected = selectConsistentOperationSource(state.memo);
    }

    // 최후에 남은 UNKNOWN/충돌 후보만 bounded web fallback으로 넘긴다. 후보별 1/2차
    // 공정 queue와 URL fetch 상한은 fallback client가 책임지고, 시간 LLM은 아래의
    // 공용 최종 lane에서만 한 번 호출한다.
    const boundedFallbackStates = states.filter(
      (state) => !state.selected || hasSourceConflict(state.memo),
    );
    if (boundedFallbackStates.length > 0) {
      for (const state of boundedFallbackStates) {
        logger?.info("evaluateSeeds.enrichment.cascade.branch", {
          candidateId: state.evidence.candidateId,
          branch: "BOUNDED_WEB_FALLBACK",
        });
      }
      const fallbackClient = dependencies.createBoundedWebFallbackClient({
        ...options,
        skipTargetedLlm: true,
      });
      const fallbackResults = await fallbackClient({
        userInput,
        evidences: boundedFallbackStates.map((state) => state.evidence),
      });
      const fallbackById = new Map(
        fallbackResults.map((enrichment) => [enrichment.candidateId, enrichment]),
      );
      for (const state of boundedFallbackStates) {
        const fallback = fallbackById.get(state.evidence.candidateId);
        if (fallback) state.memo.push(fallback);
        state.selected = selectConsistentOperationSource(state.memo);
      }
    }

    // targeted LLM은 모든 결정론 source를 수집한 뒤에만 한 번 쓴다. Map 또는 bounded
    // fetch가 OPEN/CLOSED면 호출하지 않고, 정말 미파싱인 경우에는 더 동일성 높은
    // bounded-fetch 원문을 우선 사용한다.
    const targetedStates = states.filter(
      (state) =>
        (!state.selected || hasSourceConflict(state.memo)) &&
        !state.targetedLlmBudgetConsumed &&
        selectTargetedOperationSource(state.memo) !== undefined,
    );
    await mapWithConcurrency(
      targetedStates,
      TARGETED_OPERATION_LLM_CONCURRENCY,
      async (state) => {
        const source = selectTargetedOperationSource(state.memo);
        if (!source) return;
        logger?.info("evaluateSeeds.enrichment.cascade.branch", {
          candidateId: state.evidence.candidateId,
          branch: hasSourceConflict(state.memo)
            ? "TARGETED_LLM_SOURCE_CONFLICT"
            : "TARGETED_LLM_AFTER_BOUNDED",
        });
        const targeted = await applyTargetedOperationLlm(
          source,
          state.evidence,
          operationVerifier,
          options,
          dependencies,
        );
        state.targetedLlmBudgetConsumed = true;
        state.memo = replaceSource(state.memo, targeted);
        state.selected = selectConsistentOperationSource(state.memo);
      },
    );

    return states.map((state) => {
      const selected =
        state.selected ??
        buildUnknownEnrichment(
          state.evidence.candidateId,
          operationVerifier,
          "Cascade exhausted all enrichment stages",
          "none",
        );
      const merged = mergeSourceMemo(selected, state.memo);
      logger?.info("evaluateSeeds.enrichment.cascade.branch", {
        candidateId: state.evidence.candidateId,
        branch: "FINAL",
        selectedSource: merged.source,
        status: merged.operationVerification.status,
      });
      return merged;
    });
  };
};

const applyTargetedOperationLlm = async (
  enrichment: CandidateEnrichment,
  evidence: CandidateScoringEvidence,
  operationVerifier: OperationVerifier,
  options: CascadeEnrichmentOptions,
  dependencies: CascadeEnrichmentDependencies,
): Promise<CandidateEnrichment> => {
  const finish = options.logger
    ?.withContext({ extra: { candidateId: evidence.candidateId, source: enrichment.source } })
    .startTimer("evaluateSeeds.enrichment.cascade.targeted_llm.success");
  const parsed = await withTimeout(
    dependencies.parseOperationInfoWithLlmFallback({
      text: enrichment.rawTextSnippet,
      openAiApiKey: options.openAiApiKey,
      evidence,
      operationVerifier,
      sourceName: enrichment.source,
      sourceTextKind: enrichment.source === "naver-search" ? "snippet" : "scraped_page",
      allowLlmFallback: true,
      maxRetries: 0,
      logger: options.logger,
    }),
    TARGETED_OPERATION_LLM_TIMEOUT_MS,
    `Targeted operation-hours LLM timed out after ${TARGETED_OPERATION_LLM_TIMEOUT_MS}ms`,
  ).catch((error): OperationInfoParseResult => {
    options.logger?.error("evaluateSeeds.enrichment.cascade.targeted_llm.failure", error, {
      candidateId: evidence.candidateId,
      source: enrichment.source,
      timeoutMs: TARGETED_OPERATION_LLM_TIMEOUT_MS,
      recoverable: true,
    });
    return {
      parser: "none",
      reason: error instanceof Error ? error.message : String(error),
    };
  });
  const verification = parsed.operationInfo
    ? operationVerifier.verify(parsed.operationInfo, enrichment.sourceUrls)
    : operationVerifier.unknown({
        reason: parsed.reason,
        sourceUrls: enrichment.sourceUrls,
        confidence: enrichment.operationVerification.confidence,
      });
  finish?.({
    parser: parsed.parser,
    status: verification.status,
    retryCount: 0,
  });
  return {
    ...enrichment,
    operationInfo: parsed.operationInfo,
    operationVerification: verification,
    sourceDetails: (enrichment.sourceDetails ?? []).map((detail) =>
      detail.source === enrichment.source
        ? {
            ...detail,
            status: verification.status,
            reason: verification.reason,
            confidence: verification.confidence,
            operationParser: parsed.parser,
            operationParseReason: parsed.reason,
          }
        : detail,
    ),
  };
};

const selectTargetedOperationSource = (
  memo: readonly CandidateEnrichment[],
): CandidateEnrichment | undefined =>
  memo
    .filter((entry) => entry.rawTextSnippet?.trim())
    .sort((left, right) => {
      const sourcePriority = (entry: CandidateEnrichment): number =>
        entry.source === "bounded-web" ? 2 : entry.source === "naver-search" ? 1 : 0;
      return (
        sourcePriority(right) - sourcePriority(left) ||
        (right.trustSignals?.placeMatchScore ?? 0) - (left.trustSignals?.placeMatchScore ?? 0)
      );
    })[0];

const selectConsistentOperationSource = (
  memo: readonly CandidateEnrichment[],
): CandidateEnrichment | undefined => {
  const established = memo.filter(
    (entry) =>
      entry.operationInfo !== undefined && entry.operationVerification.status !== "UNKNOWN",
  );
  if (established.length === 0) return undefined;
  if (new Set(established.map((entry) => entry.operationVerification.status)).size > 1) {
    return undefined;
  }
  return [...established].sort(
    (left, right) =>
      right.operationVerification.confidence - left.operationVerification.confidence,
  )[0];
};

const hasSourceConflict = (memo: readonly CandidateEnrichment[]): boolean =>
  new Set(
    memo
      .filter(
        (entry) =>
          entry.operationInfo !== undefined && entry.operationVerification.status !== "UNKNOWN",
      )
      .map((entry) => entry.operationVerification.status),
  ).size > 1;

const mergeSourceMemo = (
  selected: CandidateEnrichment,
  memo: readonly CandidateEnrichment[],
): CandidateEnrichment => {
  const all = [...memo, selected];
  return {
    ...selected,
    sourceUrls: unique(all.flatMap((entry) => entry.sourceUrls)),
    sourceDetails: dedupeSourceDetails(all.flatMap((entry) => entry.sourceDetails ?? [])),
    dietaryClaims: dedupeByJson(all.flatMap((entry) => entry.dietaryClaims ?? [])),
    beerVenueClaims: dedupeByJson(all.flatMap((entry) => entry.beerVenueClaims ?? [])),
    verifiedPriceClaims: dedupeByJson(all.flatMap((entry) => entry.verifiedPriceClaims ?? [])),
    priceRangePerPerson:
      selected.priceRangePerPerson ?? all.find((entry) => entry.priceRangePerPerson)?.priceRangePerPerson,
    trustSignals: {
      ...all.reduce((merged, entry) => ({ ...merged, ...(entry.trustSignals ?? {}) }), {}),
      ...(selected.trustSignals ?? {}),
      sourceAgreementCount: all.filter(
        (entry) =>
          entry.operationVerification.status === selected.operationVerification.status &&
          entry.operationVerification.status !== "UNKNOWN",
      ).length,
    },
  };
};

const replaceSource = (
  memo: CandidateEnrichment[],
  replacement: CandidateEnrichment,
): CandidateEnrichment[] =>
  memo.map((entry) => (entry.source === replacement.source ? replacement : entry));

const dedupeSourceDetails = (
  details: NonNullable<CandidateEnrichment["sourceDetails"]>,
): NonNullable<CandidateEnrichment["sourceDetails"]> =>
  dedupeByJson(details);

const dedupeByJson = <T>(values: readonly T[]): T[] => {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = JSON.stringify(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const safeProbe = async (
  run: () => Promise<CandidateEnrichment>,
  evidence: CandidateScoringEvidence,
  operationVerifier: OperationVerifier,
  source: CandidateEnrichment["source"],
  logger?: Logger,
): Promise<CandidateEnrichment> => {
  try {
    return await run();
  } catch (error) {
    logger?.error("evaluateSeeds.enrichment.cascade.probe.failure", error, {
      candidateId: evidence.candidateId,
      source,
      recoverable: true,
    });
    return buildUnknownEnrichment(
      evidence.candidateId,
      operationVerifier,
      error instanceof Error ? error.message : String(error),
      source,
    );
  }
};

const requireBrowser = (
  options: CascadeEnrichmentOptions,
): NonNullable<CascadeEnrichmentOptions["getBrowser"]> => {
  if (!options.getBrowser) throw new Error("Cascade enrichment requires a shared browser provider");
  return options.getBrowser;
};

const mapWithConcurrency = async <TItem, TResult>(
  items: readonly TItem[],
  concurrency: number,
  mapper: (item: TItem, index: number) => Promise<TResult>,
): Promise<TResult[]> => {
  const results = new Array<TResult>(items.length);
  let nextIndex = 0;
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(items.length, concurrency)) }, async () => {
      while (nextIndex < items.length) {
        const index = nextIndex++;
        const item = items[index];
        if (item !== undefined) results[index] = await mapper(item, index);
      }
    }),
  );
  return results;
};

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> => {
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
