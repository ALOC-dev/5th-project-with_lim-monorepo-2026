import type { DiscoverSeedsProcessResult } from "../types.js";
import { NO_UNVISITED_SEARCH_QUERIES_MESSAGE } from "./constants.js";

// discoverSeeds 내부에서 발생한 임의의 예외를 엔진이 이해할 수 있는 실패 result로 좁힌다.
// 분류 기준:
//   - TMAP API key 누락 / 네트워크 호출 실패      → DISCOVER_SEEDS_PROVIDER_ERROR
//   - 접근/오버페치 LLM 호출 또는 응답 파싱 실패   → DISCOVER_SEEDS_PLAN_ERROR
//   - visited 필터 결과 후보가 0개                → DISCOVER_SEEDS_PLAN_ERROR
//   - 그 외(zod 검증 실패 포함)                   → DISCOVER_SEEDS_POSTPROCESSING_ERROR
// 호출자(engine)는 errorCode를 보고 재시도/중단 여부를 결정한다.
export const toDiscoverSeedsFailure = (error: unknown): DiscoverSeedsProcessResult => {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes("TMAP_APP_KEY") || message.includes("Request failed")) {
    return {
      ok: false,
      failedStep: "discoverSeeds",
      errorCode: "DISCOVER_SEEDS_PROVIDER_ERROR",
      message,
    };
  }

  if (
    message.includes(NO_UNVISITED_SEARCH_QUERIES_MESSAGE) ||
    message.includes("ANTHROPIC_API_KEY") ||
    message.includes("OPENAI_API_KEY") ||
    message.includes("discover.approaches LLM") ||
    message.includes("discover.overfetch LLM") ||
    message.includes("approach LLM") ||
    message.includes("overfetch LLM")
  ) {
    return {
      ok: false,
      failedStep: "discoverSeeds",
      errorCode: "DISCOVER_SEEDS_PLAN_ERROR",
      message,
    };
  }

  return {
    ok: false,
    failedStep: "discoverSeeds",
    errorCode: "DISCOVER_SEEDS_POSTPROCESSING_ERROR",
    message,
  };
};
