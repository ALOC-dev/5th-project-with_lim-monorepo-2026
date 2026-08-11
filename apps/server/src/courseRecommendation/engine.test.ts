import assert from "node:assert/strict";
import test from "node:test";

import type { CreateCourseRequest } from "@monorepo/api-contracts";

import { createMockCourseRecommendationEngine } from "./engine.js";

const input: CreateCourseRequest = {
  date: "2026-08-11",
  startTime: "18:30",
  durationHours: 3,
  places: [
    {
      source: "KAKAO",
      kakaoPlaceId: "kakao-seoul-hall",
      name: "서울시청",
      address: "서울 중구 세종대로 110",
      category: "관공서",
      lat: 37.5663,
      lng: 126.9779,
    },
    {
      source: "KAKAO",
      kakaoPlaceId: "kakao-deoksugung",
      name: "덕수궁",
      address: "서울 중구 세종대로 99",
      category: "문화",
      lat: 37.5658,
      lng: 126.9751,
    },
  ],
};

void test("mock course engine emits ordered progress and persists four display-ready options", async () => {
  const progress: string[] = [];
  const engine = createMockCourseRecommendationEngine("SUCCESS");

  const result = await engine.generate(input, {
    signal: new AbortController().signal,
    onProgress: (step) => progress.push(step),
  });

  assert.deepEqual(progress, ["input_validated", "generating_options", "persisting_results"]);
  assert.equal(result.kind, "SUCCESS");
  if (result.kind !== "SUCCESS") return;
  assert.equal(result.options.length, 4);
  assert.deepEqual(
    result.options.map((option) => option.type),
    ["이동 최소", "느긋한 흐름", "장소 다양성", "식사 우선"],
  );
  assert.ok(result.options.every((option) => option.stops.length > 0));
  assert.ok(result.options.every((option) => option.routePath.length === option.stops.length));
});

void test("mock course engine produces the configured empty result", async () => {
  const engine = createMockCourseRecommendationEngine("EMPTY");

  const result = await engine.generate(input, {
    signal: new AbortController().signal,
    onProgress: () => undefined,
  });

  assert.deepEqual(result, { kind: "EMPTY" });
});

void test("mock course engine fails when explicitly configured to fail", async () => {
  const engine = createMockCourseRecommendationEngine("FAILED");

  await assert.rejects(
    engine.generate(input, {
      signal: new AbortController().signal,
      onProgress: () => undefined,
    }),
    /Mock course recommendation engine failed/u,
  );
});

void test("mock course engine stops after pending cancellation", async () => {
  const engine = createMockCourseRecommendationEngine("SUCCESS");
  const controller = new AbortController();
  controller.abort();

  await assert.rejects(
    engine.generate(input, { signal: controller.signal, onProgress: () => undefined }),
    (error: unknown) => error instanceof Error && error.name === "AbortError",
  );
});
