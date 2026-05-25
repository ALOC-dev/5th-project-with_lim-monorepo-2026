import type { AgenticWebEnrichmentOptions } from "../utils/enrichment-types.js";
import type { UrlScrapeCache } from "../utils/scrape-cache.js";
import type { PlaywrightBrowser, UrlScrapeResult } from "./types.js";

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
  openAiApiKey?: AgenticWebEnrichmentOptions["openAiApiKey"];
  kakaoRestApiKey?: AgenticWebEnrichmentOptions["kakaoRestApiKey"];
  fetchCache?: UrlScrapeCache;
  kakaoScrapeCache?: UrlScrapeCache;
  naverMapScrapeCache?: UrlScrapeCache;
  scrapeRequests: Map<string, Promise<UrlScrapeResult>>;
  getBrowser: () => Promise<PlaywrightBrowser>;
  onToolEvent?: AgenticWebEnrichmentOptions["onToolEvent"];
  logger?: AgenticWebEnrichmentOptions["logger"];
  abortSignal?: AbortSignal;
};
