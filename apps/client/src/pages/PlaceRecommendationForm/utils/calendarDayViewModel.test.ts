import { describe, expect, it } from "vitest";

import { buildCalendarDayViewModels } from "./calendarDayViewModel";

describe("buildCalendarDayViewModels", () => {
  it("disables dates before the supplied minimum date", () => {
    const days = buildCalendarDayViewModels(
      { year: 2026, month: 8 },
      { minDate: { year: 2026, month: 8, day: 13 } },
    );
    const beforeToday = days.find(
      (day): day is Extract<typeof day, { readonly kind: "day" }> =>
        day.kind === "day" && day.day === 12,
    );
    const today = days.find(
      (day): day is Extract<typeof day, { readonly kind: "day" }> =>
        day.kind === "day" && day.day === 13,
    );

    expect(beforeToday?.isDisabled).toBe(true);
    expect(today?.isDisabled).toBe(false);
  });
});
