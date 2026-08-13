import { describe, expect, it } from "vitest";

import { buildPlaceRecommendationUserInput } from "./input";

describe("buildPlaceRecommendationUserInput", () => {
  const input = {
    activityType: null,
    budgetPerPerson: null,
    date: { year: 2026, month: 8, day: 13 },
    locations: [{ lat: 37.5665, lng: 126.978 }],
    numberOfPeople: null,
    partyType: null,
    stayDurationMinutes: null,
    userNaturalLanguageRequest: "저녁 식사 장소를 추천해 주세요.",
  } as const;

  it("accepts midnight as 24:00", () => {
    expect(buildPlaceRecommendationUserInput({ ...input, time24h: "24:00" })).not.toBeNull();
  });

  it("rejects invalid 24-hour values after 24:00", () => {
    expect(buildPlaceRecommendationUserInput({ ...input, time24h: "24:15" })).toBeNull();
  });
});
