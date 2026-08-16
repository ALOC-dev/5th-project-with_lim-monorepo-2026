import type { PlaceRecommendationSseEvent } from "@monorepo/api-contracts";
import type {
  EngineOutput,
  RecommendationEngineSecrets,
} from "@monorepo/recommendation-engine";

type EngineOutputError = Extract<EngineOutput, { readonly status: "ERROR" }>["error"];
type PublicFailureEvent = Extract<PlaceRecommendationSseEvent, { readonly type: "error" }>;

export type RecommendationErrorRecord = {
  readonly code: string;
  readonly name: string;
  readonly message: string;
};

export type RecommendationErrorPresentation = {
  readonly publicEvent: PublicFailureEvent;
  readonly internal: RecommendationErrorRecord;
};

export const RECOMMENDATION_FAILURE_EVENT = Object.freeze({
  type: "error",
  message: "추천을 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.",
} satisfies PublicFailureEvent);

const RECOMMENDATION_FAILURE_MESSAGES: Readonly<Record<string, string>> = Object.freeze({
  INVALID_INPUT: "입력 정보를 확인하지 못했습니다. 출발지와 요청사항을 확인한 뒤 다시 시도해 주세요.",
  EXTERNAL_API_FAILURE: "장소 정보를 불러오는 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.",
  DISCOVER_SEEDS_PLAN_ERROR: "추천 조건을 해석하는 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.",
  DISCOVER_SEEDS_PROVIDER_ERROR: "장소 정보를 불러오는 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.",
  DISCOVER_SEEDS_POSTPROCESSING_ERROR:
    "장소 후보를 정리하는 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.",
  DISCOVER_SEEDS_EXHAUSTED:
    "조건에 맞는 장소를 찾지 못했습니다. 출발지나 요청사항을 바꿔 다시 시도해 주세요.",
  EVALUATE_SEEDS_LLM_SCORING_ERROR:
    "추천 후보를 평가하는 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.",
  EVALUATE_SEEDS_INVALID_SCORING_RESPONSE:
    "추천 후보 평가 결과를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  EVALUATE_SEEDS_NO_RECOMMENDABLE_CANDIDATES:
    "조건에 맞는 장소를 찾지 못했습니다. 출발지나 요청사항을 바꿔 다시 시도해 주세요.",
  EVALUATE_SEEDS_POSTPROCESSING_ERROR:
    "추천 결과를 정리하는 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.",
});

export const toPublicRecommendationFailureEvent = (code: string): PublicFailureEvent => ({
  type: "error",
  message: RECOMMENDATION_FAILURE_MESSAGES[code] ?? RECOMMENDATION_FAILURE_EVENT.message,
});

export const presentStoredRecommendationFailure = (
  code: string | null,
): PublicFailureEvent =>
  code === null ? RECOMMENDATION_FAILURE_EVENT : toPublicRecommendationFailureEvent(code);

const isEngineOutputError = (failure: unknown): failure is EngineOutputError =>
  typeof failure === "object" &&
  failure !== null &&
  "code" in failure &&
  typeof failure.code === "string" &&
  failure.code.trim().length > 0 &&
  "message" in failure &&
  typeof failure.message === "string" &&
  failure.message.trim().length > 0;

const redactSecrets = (
  value: string,
  secrets: RecommendationEngineSecrets,
): string => {
  const configuredSecrets = Object.values(secrets)
    .filter((secret): secret is string =>
      typeof secret === "string" && secret.length > 0,
    )
    .sort((left, right) => right.length - left.length);

  return configuredSecrets.reduce(
    (sanitized, secret) => sanitized.split(secret).join("[REDACTED]"),
    value,
  );
};

export const presentRecommendationError = (
  failure: unknown,
  secrets: RecommendationEngineSecrets,
): RecommendationErrorPresentation => {
  const record = failure instanceof Error
    ? {
        code:
          "code" in failure &&
          typeof failure.code === "string" &&
          failure.code.trim().length > 0
            ? failure.code
            : "UNEXPECTED_ERROR",
        name: failure.name.trim().length > 0 ? failure.name : "Error",
        message:
          failure.message.trim().length > 0
            ? failure.message
            : "Unknown recommendation error",
      }
    : isEngineOutputError(failure)
      ? {
          code: failure.code,
          name: "EngineOutputError",
          message: failure.message,
        }
      : {
          code: "UNEXPECTED_ERROR",
          name: "UnknownError",
          message: "Unknown recommendation error",
        };

  return {
    publicEvent: toPublicRecommendationFailureEvent(record.code),
    internal: {
      code: redactSecrets(record.code, secrets),
      name: redactSecrets(record.name, secrets),
      message: redactSecrets(record.message, secrets),
    },
  };
};
