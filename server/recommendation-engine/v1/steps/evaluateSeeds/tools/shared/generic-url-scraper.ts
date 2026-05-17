import type { KakaoLocalCandidateOptions, UrlScrapeResult } from "../types.js";
import { scrapeGenericUrl } from "./browser.js";

export const getOrScrapeGenericUrl = async (
  url: string,
  options: Pick<
    KakaoLocalCandidateOptions,
    "getBrowser" | "timeoutMs" | "settleMs" | "scrapeCache" | "scrapeRequests"
  >,
): Promise<UrlScrapeResult> => {
  const inFlight = options.scrapeRequests.get(url);
  if (inFlight) return inFlight;

  const request = readOrScrapeGenericUrl(url, options).finally(() => {
    options.scrapeRequests.delete(url);
  });
  options.scrapeRequests.set(url, request);
  return request;
};

const readOrScrapeGenericUrl = async (
  url: string,
  options: Pick<
    KakaoLocalCandidateOptions,
    "getBrowser" | "timeoutMs" | "settleMs" | "scrapeCache"
  >,
): Promise<UrlScrapeResult> => {
  const cached = await options.scrapeCache?.get(url);
  if (cached) {
    return {
      snapshot: cached.snapshot,
      cache: {
        status: "HIT",
        key: cached.key,
        path: cached.path,
        capturedAt: cached.snapshot.capturedAt,
      },
    };
  }

  const snapshot = await scrapeGenericUrl(url, options);
  if (!options.scrapeCache) {
    return {
      snapshot,
      cache: { status: "DISABLED", capturedAt: snapshot.capturedAt },
    };
  }

  const text = snapshot.frameTexts.map((frame) => frame.text).join("\n");
  if (!/영업|시간|오전|오후|휴무|닫|열/u.test(text)) {
    return {
      snapshot,
      cache: { status: "WRITE_SKIPPED", capturedAt: snapshot.capturedAt },
    };
  }

  const entry = await options.scrapeCache.set(snapshot);
  return {
    snapshot: entry.snapshot,
    cache: {
      status: "MISS",
      key: entry.key,
      path: entry.path,
      capturedAt: entry.snapshot.capturedAt,
    },
  };
};
