import assert from "node:assert/strict";
import test from "node:test";

import { CourseRecommendationSseEventSchema } from "../sse/course-recommendation.js";
import {
  CourseEstimatedCostPerPersonSchema,
  CreateCourseRequestSchema,
  CreateCourseV2RequestSchema,
  LegacyCreateCourseRequestSchema,
} from "./courses.js";

const savedCandidate = (savedPlaceId: string) => ({
  source: "SAVED_PLACE" as const,
  savedPlaceId,
});

test("accepts v2 mixed candidate pools and keeps legacy requests readable", () => {
  const v2 = {
    version: 2 as const,
    candidates: [
      savedCandidate("11111111-1111-4111-8111-111111111111"),
      {
        source: "DIRECT_SEARCH" as const,
        kakaoPlaceId: "123",
        name: "테스트 카페",
        address: "서울시 테스트로 1",
        category: "음식점 > 카페",
        lat: 37.5,
        lng: 127,
      },
    ],
    date: "2026-08-15",
    startTime: "12:30",
    durationHours: 3,
    numberOfPeople: 2,
    pacePreference: "NORMAL" as const,
  };

  assert.deepEqual(CreateCourseV2RequestSchema.parse(v2), v2);
  assert.equal(CreateCourseRequestSchema.safeParse(v2).success, true);

  const legacy = {
    places: [
      {
        source: "KAKAO" as const,
        kakaoPlaceId: "123",
        name: "테스트 카페",
        lat: 37.5,
        lng: 127,
      },
    ],
    date: "2026-08-15",
    startTime: "12:30",
    durationHours: 3,
  };
  assert.equal(LegacyCreateCourseRequestSchema.safeParse(legacy).success, true);
  assert.equal(CreateCourseRequestSchema.safeParse(legacy).success, true);
});

test("rejects v2 jobs with fewer than two candidates", () => {
  const result = CreateCourseV2RequestSchema.safeParse({
    version: 2,
    candidates: [savedCandidate("11111111-1111-4111-8111-111111111111")],
    date: "2026-08-15",
    startTime: "12:30",
    durationHours: 3,
    numberOfPeople: 2,
    pacePreference: "NORMAL",
  });

  assert.equal(result.success, false);
});

test("keeps unknown costs honest and validates sequenced v2 SSE failures", () => {
  assert.equal(
    CourseEstimatedCostPerPersonSchema.safeParse({
      min: 10_000,
      max: 20_000,
      quality: "UNKNOWN",
    }).success,
    false,
  );
  assert.equal(
    CourseEstimatedCostPerPersonSchema.safeParse({
      min: null,
      max: null,
      quality: "UNKNOWN",
    }).success,
    true,
  );

  const event = {
    version: 2 as const,
    sequence: 4,
    occurredAt: "2026-08-14T10:00:00+09:00",
    courseId: "11111111-1111-4111-8111-111111111111",
    type: "error" as const,
    code: "COURSE_CANDIDATE_LOOKUP_UNAVAILABLE" as const,
    retryable: true,
    message: "장소 정보를 불러오지 못했습니다.",
  };

  assert.deepEqual(CourseRecommendationSseEventSchema.parse(event), event);
});
