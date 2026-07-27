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
    publicEvent: RECOMMENDATION_FAILURE_EVENT,
    internal: {
      code: redactSecrets(record.code, secrets),
      name: redactSecrets(record.name, secrets),
      message: redactSecrets(record.message, secrets),
    },
  };
};
