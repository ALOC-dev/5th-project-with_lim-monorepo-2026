import { describe, expect, it } from "vitest";

import type { CoursePlace } from "./course.types";
import {
  getCourseFormValidationError,
  getCourseScheduleDateBounds,
  getDefaultCourseSchedule,
  toggleCoursePlace,
  validateCourseSchedule,
} from "./courseForm";

const place = (overrides: Partial<CoursePlace> = {}): CoursePlace => ({
  id: "DIRECT_SEARCH:1",
  source: "DIRECT_SEARCH",
  kakaoPlaceId: "1",
  name: "테스트 카페",
  address: "서울특별시 중구",
  category: "카페",
  lat: 37.5,
  lng: 127,
  ...overrides,
});

describe("getDefaultCourseSchedule", () => {
  it("uses the next future 30-minute slot in Asia/Seoul", () => {
    expect(getDefaultCourseSchedule(new Date("2026-08-14T09:01:00.000Z"))).toEqual({
      date: "2026-08-14",
      startTime: "18:30",
    });
    expect(getDefaultCourseSchedule(new Date("2026-08-14T14:50:00.000Z"))).toEqual({
      date: "2026-08-15",
      startTime: "00:00",
    });
  });

  it("moves to the following slot even when already aligned", () => {
    expect(getDefaultCourseSchedule(new Date("2026-08-14T09:30:00.000Z")).startTime).toBe("19:00");
  });
});

describe("getCourseScheduleDateBounds", () => {
  it("uses Seoul dates for today and the 365-day upper bound", () => {
    expect(getCourseScheduleDateBounds(new Date("2026-08-14T14:59:00.000Z"))).toEqual({
      minDate: "2026-08-14",
      maxDate: "2027-08-14",
    });
    expect(getCourseScheduleDateBounds(new Date("2026-08-14T15:01:00.000Z"))).toEqual({
      minDate: "2026-08-15",
      maxDate: "2027-08-15",
    });
  });
});

describe("validateCourseSchedule", () => {
  const now = new Date("2026-08-14T09:00:00.000Z");

  it("rejects malformed, past, and over-one-year schedules", () => {
    expect(validateCourseSchedule("2026-02-30", "18:30", now)).toBe("INVALID");
    expect(validateCourseSchedule("2026-08-14", "18:00", now)).toBe("PAST");
    expect(validateCourseSchedule("2027-08-15", "18:00", now)).toBe("TOO_FAR");
  });

  it("accepts a future schedule within 365 days", () => {
    expect(validateCourseSchedule("2026-08-14", "18:30", now)).toBe("VALID");
  });
});

describe("getCourseFormValidationError", () => {
  const validInput = {
    selectedPlaceCount: 2,
    numberOfPeople: 2,
    date: "2026-08-14",
    startTime: "18:30",
  } as const;
  const now = new Date("2026-08-14T09:00:00.000Z");

  it("returns the first invalid field in form order", () => {
    expect(
      getCourseFormValidationError(
        {
          ...validInput,
          selectedPlaceCount: 1,
          numberOfPeople: 0,
          budgetPerPersonWon: 1_000,
        },
        now,
      ),
    ).toMatchObject({ field: "places" });
    expect(getCourseFormValidationError({ ...validInput, numberOfPeople: 21 }, now)).toMatchObject({
      field: "numberOfPeople",
    });
    expect(
      getCourseFormValidationError({ ...validInput, budgetPerPersonWon: 1_000 }, now),
    ).toMatchObject({ field: "budgetPerPersonWon" });
  });

  it("points malformed or past schedule errors at the field to correct", () => {
    expect(getCourseFormValidationError({ ...validInput, startTime: "" }, now)).toMatchObject({
      field: "startTime",
    });
    expect(getCourseFormValidationError({ ...validInput, startTime: "17:30" }, now)).toMatchObject({
      field: "startTime",
    });
    expect(getCourseFormValidationError({ ...validInput, date: "2027-08-15" }, now)).toMatchObject({
      field: "date",
    });
  });

  it("returns null for a valid form", () => {
    expect(getCourseFormValidationError(validInput, now)).toBeNull();
  });

  it("allows the per-person budget to be omitted", () => {
    expect(
      getCourseFormValidationError({ ...validInput, budgetPerPersonWon: undefined }, now),
    ).toBeNull();
  });
});

describe("toggleCoursePlace", () => {
  it("deduplicates the same Kakao place across direct and saved sources", () => {
    const direct = place();
    const saved = place({
      id: "saved-1",
      source: "SAVED_PLACE",
      savedPlaceId: "saved-1",
    });

    expect(toggleCoursePlace([direct], saved)).toEqual([]);
  });

  it("matches a saved retry placeholder after its snapshot is resolved", () => {
    const placeholder = place({
      id: "saved-1",
      source: "SAVED_PLACE",
      savedPlaceId: "saved-1",
      kakaoPlaceId: undefined,
      name: "저장한 장소",
    });
    const resolved = place({
      id: "saved-1",
      source: "SAVED_PLACE",
      savedPlaceId: "saved-1",
    });

    expect(toggleCoursePlace([placeholder], resolved)).toEqual([]);
  });

  it("keeps at most 15 candidate places", () => {
    const selected = Array.from({ length: 15 }, (_, index) =>
      place({ id: `DIRECT_SEARCH:${index}`, kakaoPlaceId: String(index) }),
    );
    expect(toggleCoursePlace(selected, place({ id: "DIRECT_SEARCH:16", kakaoPlaceId: "16" }))).toBe(
      selected,
    );
  });
});
