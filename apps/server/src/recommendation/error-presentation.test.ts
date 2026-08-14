import assert from "node:assert/strict";
import test from "node:test";

import {
  presentRecommendationError,
  presentStoredRecommendationFailure,
  RECOMMENDATION_FAILURE_EVENT,
  toPublicRecommendationFailureEvent,
} from "./error-presentation.js";

void test("maps known engine codes to safe Korean failure reasons", () => {
  // When
  const event = toPublicRecommendationFailureEvent("DISCOVER_SEEDS_PROVIDER_ERROR");

  // Then
  assert.deepEqual(event, {
    type: "error",
    message: "장소 정보를 불러오는 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.",
  });
});

void test("does not expose unknown engine failures to the user", () => {
  // When
  const event = toPublicRecommendationFailureEvent("UNRECOGNIZED_PROVIDER_FAILURE");

  // Then
  assert.deepEqual(event, RECOMMENDATION_FAILURE_EVENT);
});

void test("recreates a safe reason for stored failed histories", () => {
  assert.deepEqual(
    presentStoredRecommendationFailure("EVALUATE_SEEDS_NO_RECOMMENDABLE_CANDIDATES"),
    {
      type: "error",
      message: "조건에 맞는 장소를 찾지 못했습니다. 출발지나 요청사항을 바꿔 다시 시도해 주세요.",
    },
  );
  assert.deepEqual(presentStoredRecommendationFailure(null), RECOMMENDATION_FAILURE_EVENT);
});

void test("keeps internal diagnostics redacted while persisting a safe public reason", () => {
  // Given
  const secret = "secret-api-key";

  // When
  const presentation = presentRecommendationError(
    {
      code: "EVALUATE_SEEDS_LLM_SCORING_ERROR",
      message: `LLM request failed with ${secret}`,
    },
    { openAiApiKey: secret },
  );

  // Then
  assert.equal(
    presentation.publicEvent.message,
    "추천 후보를 평가하는 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.",
  );
  assert.equal(presentation.internal.code, "EVALUATE_SEEDS_LLM_SCORING_ERROR");
  assert.equal(presentation.internal.message, "LLM request failed with [REDACTED]");
});
