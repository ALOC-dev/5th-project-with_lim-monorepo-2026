import { createRequire } from "node:module";

import type { ScrapedUrlFrameText, ScrapedUrlSnapshot } from "../../utils/scrape-cache.js";
import type { KakaoLocalCandidateOptions, PlaywrightModule, PlaywrightPage } from "../types.js";
import {
  BROWSER_FRAME_EVALUATE_TIMEOUT_MS,
  BROWSER_PAGE_CONTENT_TIMEOUT_MS,
  DESKTOP_BROWSER_USER_AGENT,
} from "./constants.js";
import { stripHtml } from "./text.js";

const require = createRequire(import.meta.url);

export const loadPlaywright = (): PlaywrightModule => {
  try {
    return require("playwright") as PlaywrightModule;
  } catch {
    throw new Error(
      "playwright is required for Naver Map scraping but could not be loaded. " +
        "It is declared in this package's dependencies, so this usually means the browser " +
        "binaries are missing. Run `pnpm exec playwright install chromium`.",
    );
  }
};

export const scrapeGenericUrl = async (
  url: string,
  options: Pick<KakaoLocalCandidateOptions, "getBrowser" | "timeoutMs" | "settleMs">,
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
    await waitForRenderedContent(page, options.settleMs);
    // 펼치기를 실제로 눌렀을 때만 내부에서 한 번 더 기다린다. 예전에는 여기서
    // 무조건 1초를 더 잤는데, 대부분의 페이지에서는 그냥 버리는 시간이었다.
    await expandBusinessHoursIfAvailable(page, options.settleMs);

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

const CONTENT_POLL_INTERVAL_MS = 250;
/** 이만큼 기다려도 안 그려지면 포기하고 있는 것만 읽는다. */
const MAX_CONTENT_WAIT_MS = 6_000;
/** 길이가 이만큼 연속으로 변하지 않으면 렌더링이 끝난 것으로 본다. */
const STABLE_POLL_COUNT = 3;

/**
 * SPA 본문이 렌더링될 때까지 기다린다.
 *
 * 카카오맵·네이버지도는 HTML을 받은 뒤 JS로 내용을 그린다. `domcontentloaded` 직후
 * 고정 시간만 자고 읽으면 **네비게이션과 푸터만 있는 껍데기**를 가져온다. 실측에서
 * 카카오 상세 페이지 스크랩 결과가 "본문 바로가기 메뉴 바로가기 ... ©Kakao Corp."
 * 뿐이었고, 그래서 영업시간을 못 읽어 후보 대부분이 UNKNOWN으로 탈락했다.
 *
 * 고정 대기 대신 폴링해서 **준비되면 즉시 진행**한다. 빨리 그려지는 페이지에서는
 * 오히려 기다리는 시간이 줄어든다.
 */
export const waitForRenderedContent = async (
  page: PlaywrightPage,
  settleMs: number,
): Promise<boolean> => {
  const deadline = Date.now() + MAX_CONTENT_WAIT_MS;
  const [mainFrame] = page.frames();
  let previousLength = -1;
  let stableCount = 0;

  while (Date.now() < deadline) {
    const probe = await withTimeout(
      mainFrame?.evaluate(() => {
        const text = document.body?.innerText ?? "";
        return {
          // 실제 장소 정보가 그려졌는지 보는 표식.
          //
          // 길이로 판정하면 안 된다. 카카오맵 껍데기("본문 바로가기 메뉴 바로가기
          // 지도 검색 ... ©Kakao Corp.")만으로도 400자를 가볍게 넘어서, 길이 조건은
          // 렌더링 전에 이미 참이 된다. 실제로 그 방식으로는 아무것도 못 잡았다.
          hasPlaceContent:
            /장소명|장소\s*카테고리|별점|영업\s*(?:중|전|종료)|영업\s*시간|영업시간|운영\s*시간|휴무|라스트\s*오더/u.test(
              text,
            ),
          length: text.replace(/\s+/gu, "").length,
        };
      }) ?? Promise.resolve(undefined),
      BROWSER_FRAME_EVALUATE_TIMEOUT_MS,
      "browser frame evaluate timed out while waiting for rendered content",
    ).catch(() => undefined);

    if (probe?.hasPlaceContent) return true;

    // 표식이 없더라도 길이가 더 이상 변하지 않으면 렌더링이 끝난 정적 페이지다.
    // (블로그 같은 서버 렌더 페이지는 장소 표식이 없는 게 정상이다.)
    if (probe && probe.length === previousLength && probe.length > 0) {
      stableCount += 1;
      if (stableCount >= STABLE_POLL_COUNT) return true;
    } else {
      stableCount = 0;
    }
    previousLength = probe?.length ?? -1;

    await page.waitForTimeout(CONTENT_POLL_INTERVAL_MS);
  }

  await page.waitForTimeout(Math.min(settleMs, CONTENT_POLL_INTERVAL_MS));
  return false;
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
          // 카카오맵은 "영업정보", 네이버는 "영업시간"으로 쓴다. 예전에는 "영업시간"만
          // 확인해서 카카오 페이지에서는 펼치기 자체를 시도하지 않았다.
          if (!/영업\s*(?:시간|정보)|운영\s*시간/u.test(bodyText)) return false;

          // `span`도 포함해야 한다. 네이버 지도의 영업시간 펼치기는 `<span class="_UCia">`
          // 라서 `a,button,[role=button]`만 조회하던 예전 선택자에는 아예 안 걸렸고,
          // 클릭을 시도조차 못 했다.
          const elements = Array.from(
            document.querySelectorAll<HTMLElement>("a,button,[role='button'],span"),
          );
          const targets = elements.filter((element) => {
            const text = (element.innerText || element.textContent || "").trim();
            // 버튼 이름이 안 맞아 접힌 채로 긁고 있었다. 카카오맵 영업정보의 실제
            // 버튼 텍스트는 정확히 "펼치기"인데 패턴에는 "펼쳐보기"와 "더보기"만
            // 있었다. 접힌 상태에는 "영업 전 09:00 오픈"처럼 **오픈 시각만 있고
            // 마감 시각이 없어서** 스케줄을 못 만들고 UNKNOWN으로 탈락했다.
            // (실측: 이모네 — 펼치면 연중무휴 09:00~03:00이 요일별로 전부 나온다.)
            if (!/^(?:펼치기|펼쳐보기|더보기)$/u.test(text)) return false;

            // 영업시간 영역의 펼치기만 누른다. 페이지의 모든 "더보기"를 누르면
            // 주소·리뷰·로그인 같은 무관한 컨트롤까지 눌려 페이지를 이탈한다.
            // (실제로 전부 클릭했더니 카카오 로그인 페이지로 넘어갔다.)
            let node: HTMLElement | null = element;
            for (let depth = 0; node && depth < 4; depth += 1) {
              if (/영업\s*(?:시간|정보)|운영\s*시간/u.test(node.innerText ?? "")) return true;
              node = node.parentElement;
            }
            return false;
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
