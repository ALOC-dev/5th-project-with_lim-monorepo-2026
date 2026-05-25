import type { RecommendationEngineSecrets } from "../../credentials.js";
import type { PlaceRecommendationItem } from "../../interfaces/output.contracts.js";
import type { EvaluateSeedsRetryReason } from "../discoverSeeds/contracts.js";
import type { EvaluateSeedsOutput } from "./contracts.js";

export type { EvaluateSeedsEvaluation, EvaluateSeedsOutput, ScoreBreakdown } from "./contracts.js";

export type EvaluateSeedsNeedsMoreSeeds = {
  status: "NEEDS_MORE_SEEDS";
  reason: EvaluateSeedsRetryReason;
  excludeSeedKeys: string[];
};

export type EvaluateSeedsProcessResult =
  | { ok: true; data: EvaluateSeedsOutput }
  | { ok: true; needsMoreSeeds: EvaluateSeedsNeedsMoreSeeds }
  | {
      ok: false;
      failedStep: "evaluateSeeds";
      errorCode:
        | "EVALUATE_SEEDS_LLM_SCORING_ERROR"
        | "EVALUATE_SEEDS_INVALID_SCORING_RESPONSE"
        | "EVALUATE_SEEDS_NO_RECOMMENDABLE_CANDIDATES"
        | "EVALUATE_SEEDS_POSTPROCESSING_ERROR";
      message: string;
    };

export type EvaluateSeedsOptions = {
  secrets?: Pick<
    RecommendationEngineSecrets,
    "kakaoRestApiKey" | "naverSearchClientId" | "naverSearchClientSecret" | "openAiApiKey"
  >;
};

export type { PlaceRecommendationItem };
