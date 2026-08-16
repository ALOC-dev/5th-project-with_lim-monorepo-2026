import { describe, expect, it } from "vitest";

import type { CourseHistoryItem, CourseRecommendationStatus } from "./course.types";
import type { CourseOption } from "./course.types";
import {
  canOpenHistory,
  formatCourseCost,
  formatCourseLeg,
  formatCourseReason,
  formatCourseSummary,
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

  it("formats the compact course summary without losing unknown-cost semantics", () => {
    expect(
      formatCourseSummary({
        estimatedCostPerPerson: { min: 39_000, max: 39_000, quality: "VERIFIED" },
        stops: [{}, {}, {}, {}] as unknown as CourseOption["stops"],
        totalDurationMinutes: 190,
        totalTravelMinutes: 28,
      }),
    ).toBe("4곳 · 총 3시간 10분 · 이동 28분 · 1인 39,000원");

    expect(
      formatCourseSummary({
        estimatedCostPerPerson: { min: null, max: null, quality: "UNKNOWN" },
        stops: [{}, {}] as unknown as CourseOption["stops"],
        totalDurationMinutes: 120,
        totalTravelMinutes: 0,
      }),
    ).toBe("2곳 · 총 2시간 · 이동 0분 · 비용 정보 미확인");
  });

  it("joins course reasons into one paragraph", () => {
    expect(formatCourseReason([" 식사를 먼저 배치했어요. ", "이동 동선을 줄였어요."])).toBe(
      "식사를 먼저 배치했어요. 이동 동선을 줄였어요.",
    );
    expect(formatCourseReason([" "])).toBe("");
  });

  it("only shows available travel and wait information", () => {
    expect(formatCourseLeg({ travelMinutesFromPrevious: 12, waitMinutesFromPrevious: 5 })).toBe(
      "도보 12분 · 도착 후 5분 대기",
    );
    expect(formatCourseLeg({ travelMinutesFromPrevious: 12, waitMinutesFromPrevious: 0 })).toBe(
      "도보 12분",
    );
    expect(formatCourseLeg({ travelMinutesFromPrevious: 0, waitMinutesFromPrevious: 8 })).toBe(
      "도착 후 8분 대기",
    );
    expect(
      formatCourseLeg({ travelMinutesFromPrevious: 0, waitMinutesFromPrevious: 0 }),
    ).toBeNull();
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
