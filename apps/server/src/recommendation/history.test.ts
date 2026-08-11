import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveRecommendationHistoryStatus,
  deriveRecommendationHistoryTitle,
  resolveRecommendationTerminalDelivery,
} from "./history.js";

void test("deriveRecommendationHistoryTitle normalizes whitespace and limits the title to 60 characters", () => {
  // Given
  const request = `  ${"a".repeat(30)}\n\t${"b".repeat(40)}  `;

  // When
  const title = deriveRecommendationHistoryTitle(request);

  // Then
  assert.equal(title, `${"a".repeat(30)} ${"b".repeat(29)}`);
});

void test("deriveRecommendationHistoryStatus returns COMPLETED when output exists", () => {
  // Given
  const history = {
    output: { recommendations: [] },
    errorCode: "STALE_ERROR",
    errorMessage: "stale",
  };

  // When
  const status = deriveRecommendationHistoryStatus(history);

  // Then
  assert.equal(status, "COMPLETED");
});

void test("deriveRecommendationHistoryStatus returns FAILED when an error message exists without output", () => {
  // Given
  const history = { output: null, errorCode: null, errorMessage: "Engine failed" };

  // When
  const status = deriveRecommendationHistoryStatus(history);

  // Then
  assert.equal(status, "FAILED");
});

void test("deriveRecommendationHistoryStatus returns PENDING without output or error", () => {
  // Given
  const history = { output: null, errorCode: null, errorMessage: null };

  // When
  const status = deriveRecommendationHistoryStatus(history);

  // Then
  assert.equal(status, "PENDING");
});

void test("resolveRecommendationTerminalDelivery returns result only after result persistence succeeds", async () => {
  // Given
  const attempts: string[] = [];

  // When
  const delivery = await resolveRecommendationTerminalDelivery(
    "result",
    () => {
      attempts.push("result");
      return Promise.resolve(true);
    },
    () => {
      attempts.push("fallback");
      return Promise.resolve(true);
    },
  );

  // Then
  assert.equal(delivery, "result");
  assert.deepEqual(attempts, ["result"]);
});

void test("resolveRecommendationTerminalDelivery returns error after failed result persistence falls back successfully", async () => {
  // Given
  const attempts: string[] = [];

  // When
  const delivery = await resolveRecommendationTerminalDelivery(
    "result",
    () => {
      attempts.push("result");
      return Promise.resolve(false);
    },
    () => {
      attempts.push("fallback");
      return Promise.resolve(true);
    },
  );

  // Then
  assert.equal(delivery, "error");
  assert.deepEqual(attempts, ["result", "fallback"]);
});

void test("resolveRecommendationTerminalDelivery disconnects when result and fallback persistence fail", async () => {
  // Given
  const attempts: string[] = [];

  // When
  const delivery = await resolveRecommendationTerminalDelivery(
    "result",
    () => {
      attempts.push("result");
      return Promise.resolve(false);
    },
    () => {
      attempts.push("fallback");
      return Promise.resolve(false);
    },
  );

  // Then
  assert.equal(delivery, "disconnect");
  assert.deepEqual(attempts, ["result", "fallback"]);
});

void test("resolveRecommendationTerminalDelivery retries failed error persistence with the fallback", async () => {
  // Given
  const attempts: string[] = [];

  // When
  const delivery = await resolveRecommendationTerminalDelivery(
    "error",
    () => {
      attempts.push("error");
      return Promise.resolve(false);
    },
    () => {
      attempts.push("fallback");
      return Promise.resolve(true);
    },
  );

  // Then
  assert.equal(delivery, "error");
  assert.deepEqual(attempts, ["error", "fallback"]);
});
