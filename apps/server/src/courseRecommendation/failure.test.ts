import assert from "node:assert/strict";
import test from "node:test";

import {
  presentCourseEngineFailure,
  presentStoredCourseFailure,
  UNEXPECTED_COURSE_FAILURE,
} from "./failure.js";

void test("presents each typed course engine failure as a safe Korean message", () => {
  assert.deepEqual(presentCourseEngineFailure("COURSE_ENGINE_UNAVAILABLE"), {
    code: "COURSE_ENGINE_UNAVAILABLE",
    message: "코스 추천 서비스를 지금 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.",
  });
  assert.deepEqual(presentCourseEngineFailure("COURSE_ROUTE_UNAVAILABLE"), {
    code: "COURSE_ROUTE_UNAVAILABLE",
    message: "선택한 장소 사이의 이동 경로를 찾지 못했습니다. 장소를 바꿔 다시 시도해 주세요.",
  });
});

void test("uses the generic safe fallback for unknown persisted failure codes", () => {
  assert.deepEqual(
    presentStoredCourseFailure("database password: secret"),
    UNEXPECTED_COURSE_FAILURE,
  );
  assert.deepEqual(presentStoredCourseFailure(null), UNEXPECTED_COURSE_FAILURE);
});
