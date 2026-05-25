import { createRequire } from "node:module";

import type {
  ScrapedUrlFrameText,
  ScrapedUrlSnapshot,
} from "../../utils/scrape-cache.js";
import {
  BROWSER_FRAME_EVALUATE_TIMEOUT_MS,
  BROWSER_PAGE_CONTENT_TIMEOUT_MS,
  DESKTOP_BROWSER_USER_AGENT,
} from "./constants.js";
import { stripHtml } from "./text.js";
import type {
  KakaoLocalCandidateOptions,
  PlaywrightModule,
  PlaywrightPage,
} from "../types.js";

const require = createRequire(import.meta.url);

export const loadPlaywright = (): PlaywrightModule => {
  try {
    return require("playwright") as PlaywrightModule;
  } catch {
    throw new Error(
      "playwright dependency is required for Naver Map scraping. Install it in the server package before running this client.",
    );
  }
};

export const scrapeGenericUrl = async (
  url: string,
  options: Pick<
    KakaoLocalCandidateOptions,
    "getBrowser" | "timeoutMs" | "settleMs"
  >,
): Promise<ScrapedUrlSnapshot> => {
  const browser = await options.getBrowser();
  const page = await browser.newPage({
    userAgent: DESKTOP_BROWSER_USER_AGENT,
  });

  try {
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: options.timeoutMs,
    });
    await page.waitForTimeout(options.settleMs);
    await expandBusinessHoursIfAvailable(page, options.settleMs);
    await page.waitForTimeout(Math.min(1_000, options.settleMs));

    return {
      schemaVersion: 1,
      url,
      capturedAt: new Date().toISOString(),
      frameTexts: await collectFrameTextsForUrl(page, url),
    };
  } finally {
    await page.close();
  }
};

export const expandBusinessHoursIfAvailable = async (
  page: PlaywrightPage,
  settleMs: number,
): Promise<void> => {
  let expanded = false;
  for (const frame of page.frames()) {
    try {
      const clicked = await withTimeout(
        frame.evaluate(() => {
          const bodyText = document.body?.innerText ?? "";
          if (!bodyText.includes("영업시간")) return false;

          const elements = Array.from(
            document.querySelectorAll<HTMLElement>("a,button,[role='button']"),
          );
          const targets = elements.filter((element) => {
            const text = element.innerText || element.textContent || "";
            return /펼쳐보기|더보기/u.test(text);
          });
          targets.forEach((target) => target.click());
          return targets.length > 0;
        }),
        BROWSER_FRAME_EVALUATE_TIMEOUT_MS,
        "browser frame evaluate timed out while expanding business hours",
      );
      expanded ||= clicked;
    } catch {
      // Detail frames can re-render while expansion controls are clicked.
    }
  }

  if (expanded) await page.waitForTimeout(settleMs);
};

export const collectFrameTextsForUrl = async (
  page: PlaywrightPage,
  url: string,
): Promise<ScrapedUrlFrameText[]> => {
  const pageHtml = await withTimeout(
    page.content(),
    BROWSER_PAGE_CONTENT_TIMEOUT_MS,
    "browser page content read timed out",
  );
  const texts: ScrapedUrlFrameText[] = [{ url, text: stripHtml(pageHtml) }];

  for (const frame of page.frames()) {
    try {
      const text = await withTimeout(
        frame.evaluate(() => document.body?.innerText ?? ""),
        BROWSER_FRAME_EVALUATE_TIMEOUT_MS,
        "browser frame text evaluate timed out",
      );
      if (text.trim()) texts.push({ url: frame.url(), text });
    } catch {
      // Cross-origin or transient frames can disappear while the page renders.
    }
  }

  return texts;
};

export const withTimeout = async <TResult>(
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
