import { parseOperationInfoWithLlmFallback } from "../../llm/operation-info.js";
import type { CandidateEnrichment } from "../../utils/enrichment-types.js";
import type { CandidateScoringEvidence } from "../../utils/evidence.js";
import { type OperationVerifier } from "../../utils/operation-hours.js";
import { inferPriceRangePerPersonFromText } from "../../utils/price.js";
import type { ScrapedUrlFrameText, ScrapedUrlSnapshot } from "../../utils/scrape-cache.js";
import {
  collectFrameTextsForUrl,
  expandBusinessHoursIfAvailable,
  withTimeout,
} from "../shared/browser.js";
import {
  BROWSER_FRAME_EVALUATE_TIMEOUT_MS,
  DESKTOP_BROWSER_USER_AGENT,
  NAVER_MAP_SEARCH_BASE_URL,
} from "../shared/constants.js";
import {
  buildReferenceQueryVariants,
  type ReferenceUrlMatch,
  scoreTextReferenceIdentity,
} from "../shared/reference-query.js";
import { normalizeText } from "../shared/text.js";
import type { PlaywrightPage, ScrapeNaverMapCandidateOptions, UrlScrapeResult } from "../types.js";

export const scrapeNaverMapCandidate = async (
  evidence: CandidateScoringEvidence,
  operationVerifier: OperationVerifier,
  options: ScrapeNaverMapCandidateOptions,
): Promise<CandidateEnrichment> => {
  const query = buildNaverMapSearchQuery(evidence);
  const searchUrl = `${NAVER_MAP_SEARCH_BASE_URL}/${encodeURIComponent(query)}`;

  const { snapshot, cache } = await getOrScrapeNaverMapUrl(searchUrl, evidence, options);
  const searchableText = chooseCandidateText(snapshot.frameTexts, evidence);
  const operationParse = await parseOperationInfoWithLlmFallback({
    text: searchableText,
    openAiApiKey: options.openAiApiKey,
    evidence,
    operationVerifier,
    sourceName: "naver-map",
    sourceTextKind: "scraped_page",
  });
  const operationInfo = operationParse.operationInfo;
  const sourceUrls = [searchUrl];
  const operationVerification = operationInfo
    ? operationVerifier.verify(operationInfo, sourceUrls)
    : operationVerifier.unknown({
        reason: operationParse.reason,
        sourceUrls,
      });

  return {
    candidateId: evidence.candidateId,
    source: "naver-map",
    sourceUrls,
    operationInfo,
    operationVerification,
    priceRangePerPerson: inferPriceRangePerPersonFromText(searchableText, evidence.category),
    rawTextSnippet: searchableText.slice(0, 2_000),
    scrapeCache: cache,
    sourceDetails: [
      {
        source: "naver-map",
        status: operationVerification.status,
        reason: operationVerification.reason,
        sourceUrls,
        confidence: operationVerification.confidence,
        identityMatchScore: scoreNaverMapTextIdentity(searchableText, evidence).identityScore,
        operationParser: operationParse.parser,
        operationParseReason: operationParse.reason,
        sourceTextKind: "scraped_page",
        rawTextSnippet: searchableText.slice(0, 700),
        scrapeCache: cache,
      },
    ],
  };
};

export const resolveNaverMapReferenceUrl = async (
  evidence: CandidateScoringEvidence,
  options: ScrapeNaverMapCandidateOptions,
): Promise<ReferenceUrlMatch | undefined> => {
  for (const query of buildReferenceQueryVariants(evidence)) {
    const searchUrl = `${NAVER_MAP_SEARCH_BASE_URL}/${encodeURIComponent(query.query)}`;
    const { snapshot } = await getOrScrapeNaverMapUrl(searchUrl, evidence, options);
    const searchableText = chooseCandidateText(snapshot.frameTexts, evidence);
    const identity = scoreNaverMapTextIdentity(searchableText, evidence);
    if (hasUsefulDetailText(searchableText, evidence) && identity.accepted) {
      return {
        url: searchUrl,
        query,
        identity,
      };
    }
  }
  return undefined;
};

const getOrScrapeNaverMapUrl = async (
  url: string,
  evidence: CandidateScoringEvidence,
  options: ScrapeNaverMapCandidateOptions,
): Promise<UrlScrapeResult> => {
  const inFlight = options.scrapeRequests.get(url);
  if (inFlight) return inFlight;

  const request = readOrScrapeNaverMapUrl(url, evidence, options).finally(() => {
    options.scrapeRequests.delete(url);
  });
  options.scrapeRequests.set(url, request);
  return request;
};

const readOrScrapeNaverMapUrl = async (
  url: string,
  evidence: CandidateScoringEvidence,
  options: ScrapeNaverMapCandidateOptions,
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

  const snapshot = await scrapeNaverMapUrl(url, evidence, options);
  if (!options.scrapeCache) {
    return {
      snapshot,
      cache: { status: "DISABLED", capturedAt: snapshot.capturedAt },
    };
  }

  const searchableText = chooseCandidateText(snapshot.frameTexts, evidence);
  if (!hasUsefulDetailText(searchableText, evidence)) {
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

const scrapeNaverMapUrl = async (
  url: string,
  evidence: CandidateScoringEvidence,
  options: ScrapeNaverMapCandidateOptions,
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
    await openCandidateDetailIfAvailable(page, evidence, options.settleMs);
    await waitForNaverDetailText(page, evidence, options.settleMs);
    await expandBusinessHoursIfAvailable(page, options.settleMs);
    await waitForNaverDetailText(page, evidence, options.settleMs);

    return {
      schemaVersion: 1,
      url,
      capturedAt: new Date().toISOString(),
      frameTexts: await collectFrameTexts(page),
    };
  } finally {
    await page.close();
  }
};

const buildNaverMapSearchQuery = (evidence: CandidateScoringEvidence): string =>
  buildReferenceQueryVariants(evidence)[0]?.query ?? evidence.name;

const openCandidateDetailIfAvailable = async (
  page: PlaywrightPage,
  evidence: CandidateScoringEvidence,
  settleMs: number,
): Promise<void> => {
  for (const frame of page.frames()) {
    try {
      const clicked = await withTimeout(
        frame.evaluate((candidateName) => {
          const normalize = (value: string): string => value.toLowerCase().replace(/\s+/gu, "");
          const expected = normalize(candidateName);
          const elements = Array.from(
            document.querySelectorAll<HTMLElement>("a,button,[role='button']"),
          );
          const target = elements.find((element) =>
            normalize(element.innerText || element.textContent || "").includes(expected),
          );
          if (!target) return false;
          target.click();
          return true;
        }, evidence.name),
        BROWSER_FRAME_EVALUATE_TIMEOUT_MS,
        "browser frame evaluate timed out while opening candidate detail",
      );
      if (clicked) {
        await page.waitForTimeout(settleMs);
        return;
      }
    } catch {
      // Naver Map frames are dynamic and can detach during route transitions.
    }
  }
};

const waitForNaverDetailText = async (
  page: PlaywrightPage,
  evidence: CandidateScoringEvidence,
  settleMs: number,
): Promise<void> => {
  const maxPolls = 4;
  for (let pollNo = 0; pollNo < maxPolls; pollNo += 1) {
    const frameTexts = await collectFrameTexts(page);
    const text = chooseCandidateText(frameTexts, evidence);
    if (hasUsefulDetailText(text, evidence)) return;
    await page.waitForTimeout(settleMs);
  }
};

const hasUsefulDetailText = (text: string, evidence: CandidateScoringEvidence): boolean => {
  const identity = scoreNaverMapTextIdentity(text, evidence);
  if (!identity.accepted) return false;
  return (
    /영업\s*중|곧\s*영업\s*종료|영업\s*종료|오늘\s*휴무|현재\s*휴무/u.test(text) ||
    text.includes("영업시간") ||
    text.includes("방문자 리뷰") ||
    text.includes("블로그 리뷰") ||
    text.includes("홈\n") ||
    text.includes("정보 수정 제안")
  );
};

const scoreNaverMapTextIdentity = (text: string, evidence: CandidateScoringEvidence) =>
  scoreTextReferenceIdentity(text, evidence);

const collectFrameTexts = async (page: PlaywrightPage): Promise<ScrapedUrlFrameText[]> => {
  return collectFrameTextsForUrl(page, NAVER_MAP_SEARCH_BASE_URL);
};

const chooseCandidateText = (
  frameTexts: ScrapedUrlFrameText[],
  evidence: CandidateScoringEvidence,
): string => {
  const name = normalizeText(evidence.name);
  const address = normalizeText(evidence.placeInfo.roadAddress || evidence.placeInfo.address);

  const scored = frameTexts
    .map((item) => {
      const normalized = normalizeText(item.text);
      let score = 0;
      if (/entryIframe|place/iu.test(item.url)) score += 3;
      if (normalized.includes(name)) score += 2;
      if (address && normalized.includes(address)) score += 2;
      if (normalized.includes("영업")) score += 1;
      if (normalized.includes("시간")) score += 1;
      return { ...item, score };
    })
    .sort((a, b) => b.score - a.score);

  return scored[0]?.text ?? "";
};
