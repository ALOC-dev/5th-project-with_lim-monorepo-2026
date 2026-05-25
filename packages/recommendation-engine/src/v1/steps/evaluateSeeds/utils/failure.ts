import type { EvaluateSeedsProcessResult } from "../types.js";

export const toEvaluateSeedsFailure = (
  error: unknown,
): EvaluateSeedsProcessResult => {
  const message = error instanceof Error ? error.message : String(error);

  if (isSchemaParseError(message)) {
    return {
      ok: false,
      failedStep: "evaluateSeeds",
      errorCode: "EVALUATE_SEEDS_INVALID_SCORING_RESPONSE",
      message,
    };
  }

  return {
    ok: false,
    failedStep: "evaluateSeeds",
    errorCode: "EVALUATE_SEEDS_POSTPROCESSING_ERROR",
    message,
  };
};

export const toEvaluateSeedsLlmScoringFailure = (
  error: unknown,
): EvaluateSeedsProcessResult => {
  const message = error instanceof Error ? error.message : String(error);

  if (isSchemaParseError(message)) {
    return {
      ok: false,
      failedStep: "evaluateSeeds",
      errorCode: "EVALUATE_SEEDS_INVALID_SCORING_RESPONSE",
      message,
    };
  }

  return {
    ok: false,
    failedStep: "evaluateSeeds",
    errorCode: "EVALUATE_SEEDS_LLM_SCORING_ERROR",
    message,
  };
};

const isSchemaParseError = (message: string): boolean =>
  message.includes("Invalid input") ||
  message.includes("zod") ||
  message.includes("parse");
