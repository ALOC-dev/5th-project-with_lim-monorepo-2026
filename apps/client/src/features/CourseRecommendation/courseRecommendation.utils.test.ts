import { describe, expect, it } from "vitest";

import type { CourseHistoryItem, CourseRecommendationStatus } from "./course.types";
import type { CourseOption } from "./course.types";
import {
  canOpenHistory,
  formatCourseCost,
  getCourseCandidateCounts,
} from "./courseRecommendation.utils";

const historyItem = (status: CourseRecommendationStatus): CourseHistoryItem => ({
  id: "9d4c5ece-d69d-45e3-8860-7a0aef0ca2bb",
  recommendationId: "9d4c5ece-d69d-45e3-8860-7a0aef0ca2bb",
  requestedAt: "2026-08-10T10:00:00.000Z",
  status,
  title: "코스 추천",
});

describe("course option presentation helpers", () => {
  it("does not fabricate an amount for unknown costs", () => {
    expect(formatCourseCost({ min: null, max: null, quality: "UNKNOWN" })).toBe("비용 정보 미확인");
    expect(formatCourseCost({ min: 10_000, max: 20_000, quality: "ESTIMATED" })).toBe(
      "1인 약 10,000원~20,000원",
    );
  });

  it("counts included and omitted candidates from explicit decisions", () => {
    const option = {
      stops: [{}, {}],
      candidateDecisions: [{ code: "INCLUDED" }, { code: "INCLUDED" }, { code: "DURATION_LIMIT" }],
    } as unknown as CourseOption;
    expect(getCourseCandidateCounts(option)).toEqual({ included: 2, total: 3 });
  });
});

describe("canOpenHistory", () => {
  it.each(["PENDING", "RUNNING", "SUCCESS", "EMPTY", "FAILED"] as const)(
    "opens %s histories through the unified route",
    (status) => {
      expect(canOpenHistory(historyItem(status))).toBe(true);
    },
  );

  it("hides cancelled histories", () => {
    expect(canOpenHistory(historyItem("CANCELLED"))).toBe(false);
  });
});
