import ky from "ky";

import { stripSearchMarkup } from "../utils/operation-hours.js";
import type { ScrapedUrlSnapshot, UrlScrapeCache } from "../utils/scrape-cache.js";
import { DEFAULT_EXTERNAL_API_TIMEOUT_MS, DESKTOP_BROWSER_USER_AGENT } from "./shared/constants.js";
import { stripHtml } from "./shared/text.js";
import type { UrlScrapeResult } from "./types.js";

export const getOrFetchStaticUrl = async (
  url: string,
  options: { fetchCache?: UrlScrapeCache; abortSignal?: AbortSignal },
): Promise<UrlScrapeResult> => {
  const parsedUrl = new URL(url);
  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    throw new Error(`Unsupported fetch URL protocol: ${parsedUrl.protocol}`);
  }

  const cached = await options.fetchCache?.get(parsedUrl.toString());
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

  const raw = await ky
    .get(parsedUrl.toString(), {
      timeout: DEFAULT_EXTERNAL_API_TIMEOUT_MS,
      signal: options.abortSignal,
      headers: {
        "User-Agent": DESKTOP_BROWSER_USER_AGENT,
        Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
      },
    })
    .text();
  const snapshot: ScrapedUrlSnapshot = {
    schemaVersion: 1,
    url: parsedUrl.toString(),
    capturedAt: new Date().toISOString(),
    frameTexts: [
      {
        url: parsedUrl.toString(),
        text: stripHtml(stripSearchMarkup(raw)).replace(/\s+/gu, " ").trim(),
      },
    ],
  };

  if (!options.fetchCache) {
    return {
      snapshot,
      cache: { status: "DISABLED", capturedAt: snapshot.capturedAt },
    };
  }

  const entry = await options.fetchCache.set(snapshot);
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
