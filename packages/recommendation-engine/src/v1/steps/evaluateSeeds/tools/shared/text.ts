import { stripSearchMarkup } from "../../utils/operation-hours.js";

export const normalizeText = (value: string): string => value.toLowerCase().replace(/\s+/gu, "");

export const normalizeComparableText = (value: string): string =>
  stripSearchMarkup(value)
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "");

export const tokenizeComparableText = (value: string): string[] =>
  stripSearchMarkup(value)
    .toLowerCase()
    .split(/[^\p{Letter}\p{Number}]+/gu)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);

export const clamp01 = (value: number): number => Math.min(Math.max(value, 0), 1);

/**
 * 봇 차단·보안 확인 페이지인지.
 *
 * 네이버는 헤드리스 브라우저를 감지하면 "보안 확인을 완료해 주세요" 페이지를 준다.
 * 그 페이지에는 영업시간이 없으므로 파서는 "영업시간 없음"으로 판정하는데, 그건
 * **"이 가게에 영업시간 정보가 없다"가 아니라 "우리가 못 봤다"** 이다. 둘을 구분해야
 * 로그만 보고도 원인을 알 수 있고, 다른 source로 넘어갈 판단도 가능하다.
 *
 * 우회하지 않는다. 감지해서 정직하게 실패로 기록한다.
 */
export const isBotCheckPage = (value: string): boolean =>
  /보안\s*확인을\s*완료|자동\s*입력\s*방지|비정상적인\s*접근|captcha|일시적으로\s*제한/iu.test(value);

/**
 * HTML에서 사람이 읽는 텍스트만 남긴다.
 *
 * 예전에는 `<script>`만 걷어내고 `<style>`은 두어서, 태그를 지운 뒤 **CSS 본문이
 * 그대로 텍스트로 남았다.** 실측에서 카카오맵 스크랩 결과가
 * "body, div, ul, li { margin: 0; padding: 0 } img { border: 0 none } ..."로 시작했고,
 * 네이버는 4만 자 중 대부분이 CSS였다. 그 쓰레기 텍스트가 영업시간 파서와 LLM에
 * 그대로 들어가 판정을 망쳤다.
 */
export const stripHtml = (value: string): string =>
  value
    .replace(/<!--[\s\S]*?-->/gu, " ")
    .replace(/<script[\s\S]*?<\/script>/giu, " ")
    .replace(/<style[\s\S]*?<\/style>/giu, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/giu, " ")
    .replace(/<template[\s\S]*?<\/template>/giu, " ")
    .replace(/<[^>]+>/gu, " ");
