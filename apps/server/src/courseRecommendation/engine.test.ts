import assert from "node:assert/strict";
import test from "node:test";

import type { CreateCourseRequest } from "@monorepo/api-contracts";

import { createMockCourseRecommendationEngine } from "./engine.js";

process.env.DATABASE_URL ??= "postgres://course-test:course-test@127.0.0.1:5432/course-test";
process.env.JWT_SECRET ??= "course-engine-test-secret";

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

const mockContext = (onProgress: (step: string) => void = () => undefined) => ({
  userId: "00000000-0000-4000-8000-000000000000",
  signal: new AbortController().signal,
  onProgress,
});

void test("mock course engine emits ordered progress and persists four display-ready options", async () => {
  const progress: string[] = [];
  const engine = createMockCourseRecommendationEngine("SUCCESS");

  const result = await engine.generate(input, mockContext((step) => progress.push(step)));

  assert.deepEqual(progress, ["input_validated", "generating_options", "persisting_results"]);
  assert.equal(result.kind, "SUCCESS");
  if (result.kind !== "SUCCESS" || result.version !== 1) return;
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

  const result = await engine.generate(input, mockContext());

  assert.deepEqual(result, { kind: "EMPTY", version: 1 });
});

void test("mock course engine returns a typed failure when explicitly configured to fail", async () => {
  const engine = createMockCourseRecommendationEngine("FAILED");

  const result = await engine.generate(input, mockContext());

  assert.deepEqual(result, {
    kind: "FAILED",
    code: "COURSE_ENGINE_UNAVAILABLE",
    retryable: true,
  });
});

void test("mock course engine stops after pending cancellation", async () => {
  const engine = createMockCourseRecommendationEngine("SUCCESS");
  const controller = new AbortController();
  controller.abort();

  await assert.rejects(
    engine.generate(input, {
      userId: "00000000-0000-4000-8000-000000000000",
      signal: controller.signal,
      onProgress: () => undefined,
    }),
    (error: unknown) => error instanceof Error && error.name === "AbortError",
  );
});

void test("explicit mock mode still returns display-ready v2 engine snapshots", async () => {
  const engine = createMockCourseRecommendationEngine("SUCCESS");
  const v2Input: CreateCourseRequest = {
    version: 2,
    candidates: [
      {
        source: "DIRECT_SEARCH",
        kakaoPlaceId: "101",
        name: "테스트 카페",
        address: "서울 중구 테스트로 1",
        category: "음식점 > 카페",
        lat: 37.566,
        lng: 126.978,
      },
      {
        source: "DIRECT_SEARCH",
        kakaoPlaceId: "102",
        name: "테스트 식당",
        address: "서울 중구 테스트로 2",
        category: "음식점 > 한식",
        lat: 37.567,
        lng: 126.979,
      },
    ],
    date: "2026-08-20",
    startTime: "18:00",
    durationHours: 3,
    numberOfPeople: 2,
    pacePreference: "NORMAL",
  };

  const result = await engine.generate(v2Input, mockContext());

  assert.equal(result.kind, "SUCCESS");
  if (result.kind !== "SUCCESS" || result.version !== 2) return;
  assert.ok(result.options.length >= 1 && result.options.length <= 3);
  assert.ok(result.options.every((option) => option.course.timeline.length >= 2));
  assert.ok(result.options.every((option) => option.candidateDecisions.length === 2));
});
