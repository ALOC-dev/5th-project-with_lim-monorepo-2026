import type { DayOfWeek } from "../../../interfaces/output.contracts.js";
import {
  hasReferenceEntityEvidence,
  type ReferenceIdentityScore,
  scoreTextReferenceIdentity,
} from "../tools/shared/reference-query.js";
import { getOrFetchStaticUrl } from "../tools/static-fetch.js";
import type { NaverSearchCredentials, UrlScrapeResult } from "../tools/types.js";
import type { NaverSearchItem } from "../tools/vendors/naver-search.contracts.js";
import { searchNaver } from "../tools/vendors/naver-search.js";
import { unique } from "../utils/enrichment-merge.js";
import type {
  CandidateEnrichment,
  CandidateEnrichmentClient,
  CascadeEnrichmentOptions,
  EnrichmentSourceDetail,
} from "../utils/enrichment-types.js";
import type { CandidateScoringEvidence } from "../utils/evidence.js";
import { OperationVerifier, stripSearchMarkup } from "../utils/operation-hours.js";
import { isUsableEvidenceUrl } from "../utils/source-url.js";
import type { OperationInfoParseResult } from "./operation-info.js";
import { parseOperationInfoWithLlmFallback } from "./operation-info.js";

const FREE_SEARCH_CONCURRENCY = 2;
const MAX_FALLBACK_ROUNDS = 2;

const DAY_LABELS: Record<DayOfWeek, string> = {
  MONDAY: "월요일",
  TUESDAY: "화요일",
  WEDNESDAY: "수요일",
  THURSDAY: "목요일",
  FRIDAY: "금요일",
  SATURDAY: "토요일",
  SUNDAY: "일요일",
};

type BoundedSource = {
  url: string;
  text: string;
  identity: ReferenceIdentityScore;
  cache: CandidateEnrichment["scrapeCache"];
  round: number;
};

type BoundedCandidate = {
  evidence: CandidateScoringEvidence;
  usedQueries: Set<string>;
  fetchedUrls: Set<string>;
  sources: BoundedSource[];
  targetedLlmAllowed: boolean;
  selected?: CandidateEnrichment;
};

export type BoundedWebFallbackDependencies = {
  searchNaver: typeof searchNaver;
  getOrFetchStaticUrl: typeof getOrFetchStaticUrl;
  parseOperationInfoWithLlmFallback: (
    options: Parameters<typeof parseOperationInfoWithLlmFallback>[0],
  ) => Promise<OperationInfoParseResult>;
};

const DEFAULT_DEPENDENCIES: BoundedWebFallbackDependencies = {
  searchNaver,
  getOrFetchStaticUrl,
  parseOperationInfoWithLlmFallback,
};

/**
 * Cascade 최후 단계다. 정해진 두 검색어, 후보별 URL 한 개 fetch,
 * 한 번의 시간 전용 parser만 사용한다.
 */
export const createBoundedWebFallbackClient = (
  options: CascadeEnrichmentOptions,
  dependencies: BoundedWebFallbackDependencies = DEFAULT_DEPENDENCIES,
): CandidateEnrichmentClient => {
  return async ({ userInput, evidences }) => {
    const operationVerifier = new OperationVerifier(userInput.schedule);
    const states: BoundedCandidate[] = evidences.map((evidence) => ({
      evidence,
      usedQueries: new Set(),
      fetchedUrls: new Set(),
      sources: [],
      targetedLlmAllowed:
        !options.skipTargetedLlm &&
        !options.targetedLlmAlreadyUsedCandidateIds?.has(evidence.candidateId),
    }));

    // round 1 전체가 끝난 후에만 round 2를 시작한다. 따라서 느린 후보도 두 번째
    // 검색으로 다른 후보의 첫 기회를 앞지르지 못한다.
    for (let round = 1; round <= MAX_FALLBACK_ROUNDS; round += 1) {
      const pending = states.filter((state) => !state.selected);
      if (pending.length === 0) break;
      await mapWithConcurrency(pending, FREE_SEARCH_CONCURRENCY, (state) =>
        runSearchRound({
          state,
          round,
          operationVerifier,
          options,
          dependencies,
        }),
      );
    }

    // 검색/fetch 원문이 있으나 결정론 parser가 확정하지 못한 후보만 한 번 더 파싱한다.
    // source conflict는 여기서 추측해 해소하지 않고 UNKNOWN으로 보존한다.
    for (const state of states) {
      if (state.selected || state.sources.length === 0) continue;
      if (!state.targetedLlmAllowed) {
        options.logger?.info("evaluateSeeds.enrichment.cascade.branch", {
          candidateId: state.evidence.candidateId,
          branch: options.skipTargetedLlm
            ? "TARGETED_LLM_DEFERRED"
            : "TARGETED_LLM_BUDGET_EXHAUSTED",
        });
        continue;
      }
      const source = [...state.sources].sort(
        (left, right) => right.identity.identityScore - left.identity.identityScore,
      )[0];
      if (!source) continue;
      const parsed = await parseTargetedOnce({
        source,
        evidence: state.evidence,
        operationVerifier,
        options,
        dependencies,
      });
      if (parsed.operationInfo) {
        const verification = operationVerifier.verify(parsed.operationInfo, [source.url]);
        if (verification.status !== "UNKNOWN") {
          state.selected = toEnrichment({
            candidateId: state.evidence.candidateId,
            source,
            operationInfo: parsed.operationInfo,
            operationVerification: verification,
            parser: parsed.parser,
            reason: parsed.reason,
          });
        }
      }
    }

    return states.map((state) =>
      state.selected ?? buildBoundedUnknown(state.evidence, operationVerifier, state.sources),
    );
  };
};

const runSearchRound = async ({
  state,
  round,
  operationVerifier,
  options,
  dependencies,
}: {
  state: BoundedCandidate;
  round: number;
  operationVerifier: OperationVerifier;
  options: CascadeEnrichmentOptions;
  dependencies: BoundedWebFallbackDependencies;
}): Promise<void> => {
  const query = buildFallbackQuery(state.evidence, operationVerifier, round);
  if (state.usedQueries.has(query)) return;
  state.usedQueries.add(query);

  const candidateLogger = options.logger?.withContext({
    extra: { candidateId: state.evidence.candidateId },
  });
  const finish = candidateLogger?.startTimer("evaluateSeeds.enrichment.bounded_web.search.success");
  candidateLogger?.info("evaluateSeeds.enrichment.cascade.branch", {
    branch: "BOUNDED_WEB_SEARCH",
    fallbackRound: round,
  });

  let items: NaverSearchItem[] = [];
  try {
    const response = await dependencies.searchNaver("webkr", query, {
      clientId: options.clientId ?? "",
      clientSecret: options.clientSecret ?? "",
      retryLimit: 0,
      logger: options.logger,
    } satisfies NaverSearchCredentials);
    items = response.items;
  } catch (error) {
    candidateLogger?.error("evaluateSeeds.enrichment.bounded_web.search.failure", error, {
      fallbackRound: round,
      retryCount: 0,
      recoverable: true,
    });
    finish?.({ fallbackRound: round, resultCount: 0, identityRejectedCount: 0, retryCount: 0 });
    return;
  }

  const candidates = items
    .filter((item) => item.link && isUsableEvidenceUrl(item.link))
    .map((item) => ({
      item,
      identity: scoreTextReferenceIdentity(
        `${stripSearchMarkup(item.title)}\n${stripSearchMarkup(item.description)}`,
        state.evidence,
      ),
    }))
    .filter(({ identity }) => identity.accepted && hasReferenceEntityEvidence(identity))
    .filter(({ item }) => !state.fetchedUrls.has(item.link))
    .sort((left, right) => right.identity.identityScore - left.identity.identityScore);
  const selected = candidates[0];
  const identityRejectedCount = items.length - candidates.length;
  finish?.({
    fallbackRound: round,
    resultCount: items.length,
    identityRejectedCount,
    selectedUrlCount: selected ? 1 : 0,
    retryCount: 0,
  });
  if (!selected) return;

  state.fetchedUrls.add(selected.item.link);
  const fetchFinish = candidateLogger?.startTimer("evaluateSeeds.enrichment.bounded_web.fetch.success");
  let fetched: UrlScrapeResult;
  try {
    fetched = await dependencies.getOrFetchStaticUrl(selected.item.link, {
      fetchCache: options.fetchCache,
    });
  } catch (error) {
    candidateLogger?.error("evaluateSeeds.enrichment.bounded_web.fetch.failure", error, {
      fallbackRound: round,
      recoverable: true,
    });
    return;
  }

  const text = fetched.snapshot.frameTexts
    .map((frame) => frame.text)
    .join("\n")
    .slice(0, 8_000);
  fetchFinish?.({
    fallbackRound: round,
    cacheStatus: fetched.cache.status,
    textLength: text.length,
  });
  const source: BoundedSource = {
    url: selected.item.link,
    text,
    identity: selected.identity,
    cache: fetched.cache,
    round,
  };
  state.sources.push(source);

  const parsed = await dependencies.parseOperationInfoWithLlmFallback({
    text,
    openAiApiKey: options.openAiApiKey,
    evidence: state.evidence,
    operationVerifier,
    sourceName: "bounded-web",
    sourceTextKind: "bounded_fetch",
    allowLlmFallback: false,
    logger: options.logger,
  });
  if (!parsed.operationInfo) return;
  const verification = operationVerifier.verify(parsed.operationInfo, [source.url]);
  if (verification.status === "UNKNOWN") return;
  state.selected = toEnrichment({
    candidateId: state.evidence.candidateId,
    source,
    operationInfo: parsed.operationInfo,
    operationVerification: verification,
    parser: parsed.parser,
    reason: parsed.reason,
  });
};

const parseTargetedOnce = async ({
  source,
  evidence,
  operationVerifier,
  options,
  dependencies,
}: {
  source: BoundedSource;
  evidence: CandidateScoringEvidence;
  operationVerifier: OperationVerifier;
  options: CascadeEnrichmentOptions;
  dependencies: BoundedWebFallbackDependencies;
}): Promise<OperationInfoParseResult> => {
  const finish = options.logger
    ?.withContext({ extra: { candidateId: evidence.candidateId } })
    .startTimer("evaluateSeeds.enrichment.bounded_web.targeted_llm.success");
  const parsed = await dependencies.parseOperationInfoWithLlmFallback({
    text: source.text,
    openAiApiKey: options.openAiApiKey,
    evidence,
    operationVerifier,
    sourceName: "bounded-web",
    sourceTextKind: "bounded_fetch",
    allowLlmFallback: true,
    maxRetries: 0,
    logger: options.logger,
  });
  const status = parsed.operationInfo
    ? operationVerifier.verify(parsed.operationInfo, [source.url]).status
    : "UNKNOWN";
  finish?.({ parser: parsed.parser, status, fallbackRound: source.round, retryCount: 0 });
  return parsed;
};

const buildFallbackQuery = (
  evidence: CandidateScoringEvidence,
  operationVerifier: OperationVerifier,
  round: number,
): string => {
  const place = [evidence.name, evidence.placeInfo.roadAddress || evidence.placeInfo.address]
    .filter(Boolean)
    .join(" ");
  return round === 1
    ? `${place} 영업시간`
    : `${place} ${DAY_LABELS[operationVerifier.requestedDayOfWeek]} 휴무 영업시간`;
};

const toEnrichment = ({
  candidateId,
  source,
  operationInfo,
  operationVerification,
  parser,
  reason,
}: {
  candidateId: string;
  source: BoundedSource;
  operationInfo: NonNullable<CandidateEnrichment["operationInfo"]>;
  operationVerification: CandidateEnrichment["operationVerification"];
  parser: "deterministic" | "llm" | "none";
  reason: string;
}): CandidateEnrichment => ({
  candidateId,
  source: "bounded-web",
  sourceUrls: [source.url],
  operationInfo,
  operationVerification,
  rawTextSnippet: source.text,
  scrapeCache: source.cache,
  trustSignals: { placeMatchScore: source.identity.identityScore },
  sourceDetails: [toSourceDetail(source, operationVerification.status, parser, reason)],
});

const buildBoundedUnknown = (
  evidence: CandidateScoringEvidence,
  operationVerifier: OperationVerifier,
  sources: readonly BoundedSource[],
): CandidateEnrichment => {
  const urls = unique(sources.map((source) => source.url));
  const bestSource = [...sources].sort(
    (left, right) => right.identity.identityScore - left.identity.identityScore,
  )[0];
  return {
    candidateId: evidence.candidateId,
    source: "bounded-web",
    sourceUrls: urls,
    operationVerification: operationVerifier.unknown({
      reason:
        sources.length > 0
          ? "Bounded web sources did not establish requested operation hours"
          : "Bounded web search found no identity-qualified source",
      sourceUrls: urls,
    }),
    rawTextSnippet: bestSource?.text,
    sourceDetails: sources.map((source) =>
      toSourceDetail(source, "UNKNOWN", "none", "Operation hours remained unparseable"),
    ),
  };
};

const toSourceDetail = (
  source: BoundedSource,
  status: CandidateEnrichment["operationVerification"]["status"],
  parser: "deterministic" | "llm" | "none",
  reason: string,
): EnrichmentSourceDetail => ({
  source: "bounded-web",
  status,
  reason,
  sourceUrls: [source.url],
  confidence: status === "UNKNOWN" ? 0 : 0.9,
  identityMatchScore: source.identity.identityScore,
  referenceIdentity: {
    nameScore: source.identity.nameScore,
    addressScore: source.identity.addressScore,
    identityScore: source.identity.identityScore,
    acceptedReason: source.identity.acceptedReason,
  },
  operationParser: parser,
  operationParseReason: reason,
  sourceTextKind: "bounded_fetch",
  scrapeCache: source.cache,
});

const mapWithConcurrency = async <T>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T) => Promise<void>,
): Promise<void> => {
  let nextIndex = 0;
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(items.length, concurrency)) }, async () => {
      while (nextIndex < items.length) {
        const item = items[nextIndex++];
        if (item !== undefined) await mapper(item);
      }
    }),
  );
};
