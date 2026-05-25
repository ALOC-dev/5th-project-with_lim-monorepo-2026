import type { DiscoverSeedsProcessResult } from "../types.js";

export const toDiscoverSeedsFailure = (
  error: unknown,
): DiscoverSeedsProcessResult => {
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
    message.includes("ANTHROPIC_API_KEY") ||
    message.includes("OPENAI_API_KEY") ||
    message.includes("discover.discovery_context LLM")
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
