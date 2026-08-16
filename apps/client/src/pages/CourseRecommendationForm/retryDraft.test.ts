import { describe, expect, it } from "vitest";

import {
  createCourseRecommendationRetryRouteState,
  getCourseRecommendationRetryDraft,
} from "./retryDraft";

describe("getCourseRecommendationRetryDraft", () => {
  const input = {
    places: [
      {
        source: "KAKAO",
        kakaoPlaceId: "123",
        name: "테스트 카페",
        address: "서울특별시 중구 세종대로 110",
        category: "카페",
        lat: 37.5665,
        lng: 126.978,
      },
    ],
    date: "2026-08-14",
    startTime: "18:30",
    durationHours: 3,
  } as const;

  it("restores every course form value from a retry route state", () => {
    expect(
      getCourseRecommendationRetryDraft(createCourseRecommendationRetryRouteState(input)),
    ).toEqual({
      places: [
        {
          id: "DIRECT_SEARCH:123",
          source: "DIRECT_SEARCH",
          kakaoPlaceId: "123",
          name: "테스트 카페",
          address: "서울특별시 중구 세종대로 110",
          category: "카페",
          lat: 37.5665,
          lng: 126.978,
        },
      ],
      date: "2026-08-14",
      startTime: "18:30",
      durationHours: 3,
      numberOfPeople: 2,
      pacePreference: "NORMAL",
    });
  });

  it("restores v2 candidates and recommendation preferences", () => {
    const v2Input = {
      version: 2,
      candidates: [
        { source: "SAVED_PLACE", savedPlaceId: "9d4c5ece-d69d-45e3-8860-7a0aef0ca2bb" },
        {
          source: "DIRECT_SEARCH",
          kakaoPlaceId: "456",
          name: "테스트 식당",
          address: "서울특별시 종로구",
          category: "음식점 > 한식",
          lat: 37.57,
          lng: 126.98,
        },
      ],
      date: "2026-08-15",
      startTime: "12:00",
      durationHours: 4,
      numberOfPeople: 4,
      budgetPerPersonWon: 50_000,
      pacePreference: "RELAXED",
    } as const;

    expect(
      getCourseRecommendationRetryDraft(createCourseRecommendationRetryRouteState(v2Input)),
    ).toMatchObject({
      date: "2026-08-15",
      startTime: "12:00",
      durationHours: 4,
      numberOfPeople: 4,
      budgetPerPersonWon: 50_000,
      pacePreference: "RELAXED",
      places: [
        {
          source: "SAVED_PLACE",
          savedPlaceId: "9d4c5ece-d69d-45e3-8860-7a0aef0ca2bb",
        },
        { source: "DIRECT_SEARCH", kakaoPlaceId: "456", name: "테스트 식당" },
      ],
    });
  });

  it("ignores unrelated or malformed navigation state", () => {
    expect(getCourseRecommendationRetryDraft(null)).toBeNull();
    expect(
      getCourseRecommendationRetryDraft({ type: "course-recommendation-retry", input: {} }),
    ).toBeNull();
  });
});
