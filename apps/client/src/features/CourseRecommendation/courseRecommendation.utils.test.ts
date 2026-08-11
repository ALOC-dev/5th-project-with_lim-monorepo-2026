import { describe, expect, it } from "vitest";

import type { CourseHistoryItem, CourseRecommendationStatus } from "./course.types";
import { canOpenHistory } from "./courseRecommendation.utils";

const historyItem = (status: CourseRecommendationStatus): CourseHistoryItem => ({
  id: "9d4c5ece-d69d-45e3-8860-7a0aef0ca2bb",
  recommendationId: "9d4c5ece-d69d-45e3-8860-7a0aef0ca2bb",
  requestedAt: "2026-08-10T10:00:00.000Z",
  status,
  title: "코스 추천",
});

describe("canOpenHistory", () => {
  it.each(["PENDING", "SUCCESS", "EMPTY", "FAILED"] as const)(
    "opens %s histories through the unified route",
    (status) => {
      expect(canOpenHistory(historyItem(status))).toBe(true);
    },
  );

  it("hides cancelled histories", () => {
    expect(canOpenHistory(historyItem("CANCELLED"))).toBe(false);
  });
});
