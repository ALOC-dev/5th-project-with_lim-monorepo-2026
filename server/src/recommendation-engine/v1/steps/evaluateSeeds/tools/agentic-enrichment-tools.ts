import { tool } from "ai";
import { z } from "zod";

import type { CandidateScoringEvidence } from "../utils/evidence.js";
import { buildUnknownEnrichment } from "../utils/enrichment-merge.js";
import type {
  AgenticEnrichmentSource,
  AgenticWebEnrichmentOptions,
  CandidateEnrichment,
} from "../utils/enrichment-types.js";
import { OperationVerifier, stripSearchMarkup } from "../utils/operation-hours.js";
import type { UrlScrapeCache } from "../utils/scrape-cache.js";
import { getOrFetchStaticUrl } from "./static-fetch.js";
import type { PlaywrightBrowser, UrlScrapeResult } from "./types.js";
import { enrichWithKakaoLocal } from "./vendors/kakao-local.js";
import {
  enrichWithNaverSearch,
  searchNaver,
} from "./vendors/naver-search.js";
import { scrapeNaverMapCandidate } from "./vendors/naver-map.js";
import { isUsableEvidenceUrl } from "../utils/source-url.js";

const AgenticEnrichmentSourceSchema = z.enum([
  "agentic",
  "kakao-local",
  "naver-search",
  "naver-map",
]);

export const AgenticFinalizeCandidateEvidenceSchema = z
  .object({
    selectedSource: AgenticEnrichmentSourceSchema,
    rawTextSnippet: z.string().default(""),
    sourceUrls: z.array(z.string().url()).default([]),
    reason: z.string().min(1),
    confidence: z.number().min(0).max(1).default(0),
    identityMatchScore: z.number().min(0).max(1).optional(),
    webMentionCount: z.number().int().nonnegative().optional(),
    sourceAgreementCount: z.number().int().nonnegative().optional(),
  })
  .strict();

export type AgenticFinalizeCandidateEvidence = z.infer<
  typeof AgenticFinalizeCandidateEvidenceSchema
>;

export type AgenticWebCandidateOptions = Required<
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
  fetchCache?: UrlScrapeCache;
  kakaoScrapeCache?: UrlScrapeCache;
  naverMapScrapeCache?: UrlScrapeCache;
  scrapeRequests: Map<string, Promise<UrlScrapeResult>>;
  getBrowser: () => Promise<PlaywrightBrowser>;
  onToolEvent?: AgenticWebEnrichmentOptions["onToolEvent"];
  logger?: AgenticWebEnrichmentOptions["logger"];
  abortSignal?: AbortSignal;
};

export const createAgenticEnrichmentTools = ({
  evidence,
  operationVerifier,
  options,
}: {
  evidence: CandidateScoringEvidence;
  operationVerifier: OperationVerifier;
  options: AgenticWebCandidateOptions;
}) => {
  // tool 호출은 LLM이 자율적으로 고르지만, 결과는 이 closure에 누적한다.
  // enrichmentMemo는 같은 vendor tool을 후보당 한 번만 실행하게 해 비용과 지연을 줄인다.
  let finalized: AgenticFinalizeCandidateEvidence | undefined;
  let fetchCount = 0;
  const enrichmentMemo = new Map<AgenticEnrichmentSource, CandidateEnrichment>();

  // LLM에는 전체 enrichment 객체 대신 판단에 필요한 요약만 넘긴다.
  // 긴 HTML/raw text는 로그에는 남기되 prompt payload는 작게 유지한다.
  const summarizeForLlm = (enrichment: CandidateEnrichment) => ({
    status: enrichment.operationVerification.status,
    reason: enrichment.operationVerification.reason,
    sourceUrls: enrichment.sourceUrls,
    placeMatchScore: enrichment.trustSignals?.placeMatchScore,
    confidence: enrichment.operationVerification.confidence,
    operationInfo: enrichment.operationInfo,
    rawTextSnippet: enrichment.rawTextSnippet?.slice(0, 800),
  });

  const emitLookup = (
    source: Exclude<AgenticEnrichmentSource, "agentic">,
    enrichment: CandidateEnrichment,
  ): void => {
    options.onToolEvent?.({
      type: "lookup",
      candidateId: evidence.candidateId,
      source,
      status: enrichment.operationVerification.status,
      sourceUrls: enrichment.sourceUrls,
      placeMatchScore: enrichment.trustSignals?.placeMatchScore,
    });
  };

  const safeLookup = async (
    sourceName: Exclude<AgenticEnrichmentSource, "agentic">,
    run: () => Promise<CandidateEnrichment>,
  ): Promise<CandidateEnrichment> => {
    // 벤더 lookup은 deterministic tool이다. 이미 호출한 source는 memo 결과를 재사용한다.
    const cached = enrichmentMemo.get(sourceName);
    if (cached) return cached;
    const toolLogger = options.logger?.withContext({
      extra: { candidateId: evidence.candidateId, source: sourceName },
    });
    const finish = toolLogger?.startTimer(
      `evaluateSeeds.enrichment.tool.${sourceName}.success`,
    );
    let result: CandidateEnrichment;
    let errorReason: string | undefined;
    try {
      result = await run();
    } catch (error) {
      // tool 실패는 LLM loop 전체를 깨지 않고 UNKNOWN enrichment로 흡수한다.
      // 그래야 다른 source를 시도하거나 최종적으로 후보만 제외할 수 있다.
      errorReason = error instanceof Error ? error.message : String(error);
      toolLogger?.error(
        `evaluateSeeds.enrichment.tool.${sourceName}.failure`,
        error,
      );
      result = buildUnknownEnrichment(
        evidence.candidateId,
        operationVerifier,
        errorReason,
        sourceName,
      );
    }
    enrichmentMemo.set(sourceName, result);
    emitLookup(sourceName, result);
    finish?.({
      status: result.operationVerification.status,
      sourceUrlCount: result.sourceUrls.length,
      ...(errorReason ? { errorReason } : {}),
    });
    return result;
  };

  return {
    enrichmentMemo,
    getFinalized: () => finalized,
    tools: {
      kakaoLocalLookup: tool({
        description:
          "Look up the candidate on Kakao Local (카카오 로컬). Best for verified place_url, coordinates, and identity/reference matching. Reference URLs are later verified by the same query/identity strategy as Naver Map, so never invent a URL. It may return UNKNOWN for hours even when the place match is useful. Idempotent per candidate.",
        inputSchema: z.object({}),
        execute: async () =>
          summarizeForLlm(
            await safeLookup("kakao-local", () =>
              enrichWithKakaoLocal(evidence, operationVerifier, {
                getBrowser: options.getBrowser,
                timeoutMs: options.scrapeTimeoutMs,
                settleMs: options.scrapeSettleMs,
                scrapeCache: options.kakaoScrapeCache,
                scrapeRequests: options.scrapeRequests,
                scrapePlaceDetails: options.kakaoScrapePlaceDetails,
              }),
            ),
          ),
      }),
      naverSearchLookup: tool({
        description:
          "Search Naver Blog + Web for the candidate's operating hours and reputation signals. Lightweight; idempotent per candidate.",
        inputSchema: z.object({}),
        execute: async () =>
          summarizeForLlm(
            await safeLookup("naver-search", () =>
              enrichWithNaverSearch(evidence, operationVerifier, {
                clientId: options.clientId,
                clientSecret: options.clientSecret,
                abortSignal: options.abortSignal,
              }),
            ),
          ),
      }),
      naverMapScrape: tool({
        description:
          "Scrape the Naver Map search/detail page for the candidate. Last resort only: use once when place identity is plausible but all cheaper tools lack weekly hours. Its reference URL is later checked with the same query/identity strategy as Kakao. Do not call after any tool already returned OPEN or CLOSED. Expensive (browser-based). Idempotent per candidate.",
        inputSchema: z.object({}),
        execute: async () =>
          summarizeForLlm(
            await safeLookup("naver-map", () =>
              scrapeNaverMapCandidate(evidence, operationVerifier, {
                getBrowser: options.getBrowser,
                timeoutMs: options.scrapeTimeoutMs,
                settleMs: options.scrapeSettleMs,
                scrapeCache: options.naverMapScrapeCache,
                scrapeRequests: options.scrapeRequests,
              }),
            ),
          ),
      }),
      searchEvidence: tool({
        description:
          "Free-form search of Korean blog/web snippets. Use only when the scoped *Lookup tools are not enough.",
        inputSchema: z.object({
          query: z
            .string()
            .min(2)
            .describe("Korean search query including place name and 영업시간."),
        }),
        execute: async ({ query }) => {
          const finish = options.logger
            ?.withContext({ extra: { candidateId: evidence.candidateId } })
            .startTimer("evaluateSeeds.enrichment.tool.search.success");
          const [blog, web] = await Promise.all([
            searchNaver("blog", query, options),
            searchNaver("webkr", query, options),
          ]);
          const items = [...blog.items, ...web.items]
            .map((item) => ({
              title: stripSearchMarkup(item.title),
              link: item.link,
              description: stripSearchMarkup(item.description),
            }))
            .filter((item) => item.link && isUsableEvidenceUrl(item.link))
            .slice(0, 8);
          options.onToolEvent?.({
            type: "search",
            candidateId: evidence.candidateId,
            query,
            resultCount: items.length,
            sourceUrls: items.map((item) => item.link),
          });
          finish?.({ resultCount: items.length, total: blog.total + web.total });
          return { total: blog.total + web.total, items };
        },
      }),
      fetchUrl: tool({
        description:
          "Fetch a static web page by URL and return normalized visible text. Use only URLs returned by searchEvidence.",
        inputSchema: z.object({
          url: z.string().url(),
        }),
        execute: async ({ url }) => {
          // 자유 fetch는 비용/지연과 prompt 크기를 키우기 쉬우므로 후보별 상한을 둔다.
          if (fetchCount >= options.maxFetchesPerCandidate) {
            return {
              url,
              skipped: true,
              reason: "candidate fetch limit reached",
              text: "",
            };
          }
          fetchCount += 1;
          const finish = options.logger
            ?.withContext({ extra: { candidateId: evidence.candidateId } })
            .startTimer("evaluateSeeds.enrichment.tool.fetch.success");
          const { snapshot, cache } = await getOrFetchStaticUrl(url, {
            fetchCache: options.fetchCache,
            abortSignal: options.abortSignal,
          });
          const text = snapshot.frameTexts
            .map((frame) => frame.text)
            .join("\n")
            .slice(0, 8_000);
          options.onToolEvent?.({
            type: "fetch",
            candidateId: evidence.candidateId,
            url,
            cache,
            textLength: text.length,
          });
          finish?.({ textLength: text.length, cacheStatus: cache.status });
          return { url, cache, text };
        },
      }),
      finalizeCandidateEvidence: tool({
        description:
          "Finish after enough evidence has been collected. Pick the single most reliable selectedSource. See system prompt for field rules.",
        inputSchema: AgenticFinalizeCandidateEvidenceSchema,
        execute: async (input) => {
          // 최종 판단은 반드시 이 tool call로 닫는다. generateText 본문은 사용하지 않는다.
          finalized = AgenticFinalizeCandidateEvidenceSchema.parse(input);
          return { accepted: true };
        },
      }),
    },
  };
};
