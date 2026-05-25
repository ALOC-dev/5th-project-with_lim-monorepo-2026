import type { UrlScrapeCacheMetadata } from "../utils/enrichment-types.js";
import type { ScrapedUrlSnapshot, UrlScrapeCache } from "../utils/scrape-cache.js";

export type PlaywrightPage = {
  goto(url: string, options?: Record<string, unknown>): Promise<unknown>;
  waitForTimeout(ms: number): Promise<unknown>;
  content(): Promise<string>;
  frames(): Array<{
    url(): string;
    evaluate<T, Arg = undefined>(fn: (arg: Arg) => T, arg?: Arg): Promise<T>;
  }>;
  close(): Promise<unknown>;
};

export type PlaywrightBrowser = {
  newPage(options?: Record<string, unknown>): Promise<PlaywrightPage>;
  close(): Promise<unknown>;
};

export type PlaywrightModule = {
  chromium: {
    launch(options?: Record<string, unknown>): Promise<PlaywrightBrowser>;
  };
};

export type UrlScrapeResult = {
  snapshot: ScrapedUrlSnapshot;
  cache: UrlScrapeCacheMetadata;
};

export type ScrapeNaverMapCandidateOptions = {
  openAiApiKey?: string;
  timeoutMs: number;
  settleMs: number;
  getBrowser: () => Promise<PlaywrightBrowser>;
  scrapeCache?: UrlScrapeCache;
  scrapeRequests: Map<string, Promise<UrlScrapeResult>>;
};

export type KakaoLocalCandidateOptions = {
  openAiApiKey?: string;
  kakaoRestApiKey?: string;
  timeoutMs: number;
  settleMs: number;
  scrapePlaceDetails: boolean;
  getBrowser: () => Promise<PlaywrightBrowser>;
  scrapeCache?: UrlScrapeCache;
  scrapeRequests: Map<string, Promise<UrlScrapeResult>>;
};

export type NaverSearchCredentials = {
  clientId: string;
  clientSecret: string;
  openAiApiKey?: string;
  abortSignal?: AbortSignal;
};
