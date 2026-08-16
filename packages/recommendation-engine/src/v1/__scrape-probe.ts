import { loadPlaywright } from "./steps/evaluateSeeds/tools/shared/browser.js";
import { DESKTOP_BROWSER_USER_AGENT } from "./steps/evaluateSeeds/tools/shared/constants.js";
import type { PlaywrightBrowser } from "./steps/evaluateSeeds/tools/types.js";

/**
 * 네이버 영업시간을 펼치기 없이 받을 수 있는 경로를 찾는다.
 * 이모네 = pcmap place id 35444986 (앞선 진단에서 확인).
 */

const PLACE_ID = "35444986";
const HOUR_RANGE = /(?:[01]?\d|2[0-4]):[0-5]\d\s*[~\-–—]\s*(?:[01]?\d|2[0-4]):[0-5]\d/u;

const TARGETS = [
  ["PC 정보 탭", `https://pcmap.place.naver.com/restaurant/${PLACE_ID}/information`],
  ["PC 홈", `https://pcmap.place.naver.com/restaurant/${PLACE_ID}/home`],
  ["모바일 정보", `https://m.place.naver.com/restaurant/${PLACE_ID}/information`],
  ["모바일 홈", `https://m.place.naver.com/restaurant/${PLACE_ID}/home`],
] as const;

const MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

const browser: PlaywrightBrowser = await loadPlaywright().chromium.launch({
  headless: true,
  args: ["--disable-dev-shm-usage", "--no-sandbox"],
});

try {
  for (const [label, url] of TARGETS) {
    const page = await browser.newPage({
      userAgent: label.startsWith("모바일") ? MOBILE_UA : DESKTOP_BROWSER_USER_AGENT,
      viewport: label.startsWith("모바일")
        ? { width: 390, height: 844 }
        : { width: 1400, height: 1000 },
    });

    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20_000 });
      await page.waitForTimeout(5_000);

      const [main] = page.frames();
      const state = await main
        ?.evaluate(() => {
          const text = document.body?.innerText ?? "";
          return {
            length: text.replace(/\s+/gu, "").length,
            around: (text.match(/영업[\s\S]{0,260}/u)?.[0] ?? "").replace(/\s+/gu, " "),
            blocked: /보안\s*확인|자동\s*입력\s*방지/u.test(text),
          };
        })
        .catch(() => undefined);

      console.log(`\n${"=".repeat(64)}\n${label}\n${"=".repeat(64)}`);
      if (!state) {
        console.log("읽기 실패");
      } else {
        console.log(
          `길이 ${state.length}자 | 시간범위 ${HOUR_RANGE.test(state.around) ? "있음 ✅" : "없음"} | 봇차단 ${state.blocked ? "예" : "아니오"}`,
        );
        console.log("영업 영역: " + (state.around || "(없음)").slice(0, 240));
      }
    } catch (error) {
      console.log(`\n${label}: 실패 ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
}
