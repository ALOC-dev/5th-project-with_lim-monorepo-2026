import { describe, expect, it } from "vitest";

import { advanceCourseProgressStep, isCourseProgressStep } from "./courseRecommendation.constants";

describe("course recommendation progress", () => {
  it("accepts only the public v2 progress steps", () => {
    expect(isCourseProgressStep("measuring_travel")).toBe(true);
    expect(isCourseProgressStep("generating_options")).toBe(false);
  });

  it("ignores duplicate and out-of-order SSE progress events", () => {
    expect(advanceCourseProgressStep("measuring_travel", "measuring_travel")).toBe(
      "measuring_travel",
    );
    expect(advanceCourseProgressStep("measuring_travel", "resolving_candidates")).toBe(
      "measuring_travel",
    );
    expect(advanceCourseProgressStep("measuring_travel", "curating_courses")).toBe(
      "curating_courses",
    );
  });
});
