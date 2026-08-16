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

/** 실행 진단용 깔때기 수치. 어느 게이트가 얼마나 걸렀는지 알기 위한 값이다. */
export type EvaluateSeedsFunnel = {
  tooFarCount: number;
  enrichedCount: number;
  operationVerifiedCount: number;
  operationUnverifiedUsedCount: number;
  referenceRejectedCount: number;
};

export type EvaluateSeedsProcessResult =
  | { ok: true; data: EvaluateSeedsOutput; funnel: EvaluateSeedsFunnel }
  | {
      ok: true;
      needsMoreSeeds: EvaluateSeedsNeedsMoreSeeds;
      /**
       * 목표 개수를 못 채웠지만 지금까지 만들어 둔 결과.
       *
       * 예전에는 이 경로에서 아무것도 돌려주지 않았고, 재시도를 다 쓰면 엔진이
       * 통째로 실패했다. 실측에서 "압구정 파인다이닝"이 쓸 만한 5곳을 찾아 놓고도
       * 10곳을 못 채웠다는 이유로 버려질 뻔했다. 적게라도 주는 편이 낫다.
       */
      partial?: { data: EvaluateSeedsOutput; funnel: EvaluateSeedsFunnel };
    }
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
  onProgress?: (step: 'enriching' | 'scoring') => void;
};

export type { PlaceRecommendationItem };
