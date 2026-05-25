import type { RecommendationEngineSecrets } from "../../credentials.js";
import type { DiscoverSeedsOutput } from "./contracts.js";

export type {
  DiscoverSeedsOutput,
  DiscoveryContext,
  EvaluateSeedsRetryReason,
  SearchQuery,
} from "./contracts.js";

export type DiscoverSeedsProcessResult =
  | { ok: true; data: DiscoverSeedsOutput }
  | {
      ok: false;
      failedStep: "discoverSeeds";
      errorCode:
        | "DISCOVER_SEEDS_PLAN_ERROR"
        | "DISCOVER_SEEDS_PROVIDER_ERROR"
        | "DISCOVER_SEEDS_POSTPROCESSING_ERROR";
      message: string;
    };

export type DiscoverSeedsOptions = {
  secrets?: Pick<RecommendationEngineSecrets, "tmapAppKey">;
};
