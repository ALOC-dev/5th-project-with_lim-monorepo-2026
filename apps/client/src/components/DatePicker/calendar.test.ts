import { describe, expect, it } from "vitest";

import {
  buildCalendarDayViewModels,
  canMoveCalendarMonth,
  formatDateLabel,
  fromDateISO,
  moveCalendarMonth,
  toDateISO,
} from "./calendar";

describe("calendar date conversion", () => {
  it("round-trips valid ISO dates and rejects impossible dates", () => {
    const date = { year: 2026, month: 8, day: 15 };

    expect(toDateISO(date)).toBe("2026-08-15");
    expect(fromDateISO("2026-08-15")).toEqual(date);
    expect(fromDateISO("2026-02-30")).toBeNull();
    expect(fromDateISO("2026-8-15")).toBeNull();
  });

  it("formats the committed value with its Korean weekday", () => {
    expect(formatDateLabel("2026-08-15")).toBe("2026-08-15 (토)");
  });
});

describe("calendar month navigation", () => {
  it("moves across year boundaries", () => {
    expect(moveCalendarMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(moveCalendarMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
  });

  it("does not enter a month outside the supplied date range", () => {
    const august = { year: 2026, month: 8 };

    expect(canMoveCalendarMonth(august, -1, "2026-08-15")).toBe(false);
    expect(canMoveCalendarMonth(august, 1, "2026-08-15")).toBe(true);
    expect(canMoveCalendarMonth(august, 1, "2026-01-01", "2026-08-31")).toBe(false);
  });
});

describe("buildCalendarDayViewModels", () => {
  it("marks today and the selected date while disabling range violations", () => {
    const days = buildCalendarDayViewModels(
      { year: 2026, month: 8 },
      {
        minDate: "2026-08-13",
        maxDate: "2026-08-20",
        selectedDate: "2026-08-15",
        today: "2026-08-14",
      },
    );
    const day = (number: number) => days.find((item) => item.kind === "day" && item.day === number);

    expect(day(12)).toMatchObject({ isDisabled: true });
    expect(day(14)).toMatchObject({ isToday: true, isDisabled: false });
    expect(day(15)).toMatchObject({ isSelected: true, isDisabled: false });
    expect(day(21)).toMatchObject({ isDisabled: true });
    expect(days).toHaveLength(42);
  });
});
