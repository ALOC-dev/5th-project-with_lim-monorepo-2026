import { tool } from "ai";

import type { CandidateScoringEvidence } from "../utils/evidence.js";
import { buildUnknownEnrichment } from "../utils/enrichment-merge.js";
import type {
  AgenticEnrichmentSource,
  AgenticWebEnrichmentOptions,
  CandidateEnrichment,
} from "../utils/enrichment-types.js";
import {
  OperationVerifier,
  stripSearchMarkup,
} from "../utils/operation-hours.js";
import { getOrFetchStaticUrl } from "./static-fetch.js";
import { enrichWithKakaoLocal } from "./vendors/kakao-local.js";
import {
  enrichWithNaverSearch,
  searchNaver,
} from "./vendors/naver-search.js";
import { scrapeNaverMapCandidate } from "./vendors/naver-map.js";
import { isUsableEvidenceUrl } from "../utils/source-url.js";
import {
  AgenticFetchUrlInputSchema,
  AgenticFinalizeCandidateEvidenceSchema,
  AgenticSearchEvidenceInputSchema,
  EmptyToolInputSchema,
  type AgenticFinalizeCandidateEvidence,
} from "./agentic-enrichment-tools.contracts.js";
import type { AgenticWebCandidateOptions } from "./agentic-enrichment-tools.types.js";

export type { AgenticFinalizeCandidateEvidence } from "./agentic-enrichment-tools.contracts.js";
export type { AgenticWebCandidateOptions } from "./agentic-enrichment-tools.types.js";

export const createAgenticEnrichmentTools = ({
  evidence,
  operationVerifier,
  options,
}: {
  evidence: CandidateScoringEvidence;
  operationVerifier: OperationVerifier;
  options: AgenticWebCandidateOptions;
}) => {
  let finalized: AgenticFinalizeCandidateEvidence | undefined;
  let fetchCount = 0;
  const enrichmentMemo = new Map<AgenticEnrichmentSource, CandidateEnrichment>();

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
          "Look up Kakao Local for place identity, coordinates, place_url, and optional hours. Idempotent per candidate; never invent URLs.",
        inputSchema: EmptyToolInputSchema,
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
                kakaoRestApiKey: options.kakaoRestApiKey,
                openAiApiKey: options.openAiApiKey,
              }),
            ),
          ),
      }),
      naverSearchLookup: tool({
        description:
          "Search Naver Blog/Web snippets for hours and reputation signals. Lightweight and idempotent.",
        inputSchema: EmptyToolInputSchema,
        execute: async () =>
          summarizeForLlm(
            await safeLookup("naver-search", () =>
              enrichWithNaverSearch(evidence, operationVerifier, {
                clientId: options.clientId,
                clientSecret: options.clientSecret,
                openAiApiKey: options.openAiApiKey,
                abortSignal: options.abortSignal,
              }),
            ),
          ),
      }),
      naverMapScrape: tool({
        description:
          "Scrape Naver Map as a last resort when cheaper tools lack weekly hours. Expensive; do not call after OPEN/CLOSED evidence.",
        inputSchema: EmptyToolInputSchema,
        execute: async () =>
          summarizeForLlm(
            await safeLookup("naver-map", () =>
              scrapeNaverMapCandidate(evidence, operationVerifier, {
                getBrowser: options.getBrowser,
                timeoutMs: options.scrapeTimeoutMs,
                settleMs: options.scrapeSettleMs,
                scrapeCache: options.naverMapScrapeCache,
                scrapeRequests: options.scrapeRequests,
                openAiApiKey: options.openAiApiKey,
              }),
            ),
          ),
      }),
      searchEvidence: tool({
        description:
          "Free-form Korean blog/web snippet search. Use only when scoped lookup tools are insufficient.",
        inputSchema: AgenticSearchEvidenceInputSchema,
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
        inputSchema: AgenticFetchUrlInputSchema,
        execute: async ({ url }) => {
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
          "Finish after enough evidence. Pick the single most reliable selectedSource.",
        inputSchema: AgenticFinalizeCandidateEvidenceSchema,
        execute: async (input) => {
          finalized = AgenticFinalizeCandidateEvidenceSchema.parse(input);
          return { accepted: true };
        },
      }),
    },
  };
};
