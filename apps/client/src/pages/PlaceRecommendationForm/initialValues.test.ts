import { describe, expect, it } from "vitest";

import {
  createPlaceRecommendationRetryRouteState,
  getPlaceRecommendationFormInitialValues,
  getPlaceRecommendationRetryInitialValues,
} from "./initialValues";

describe("getPlaceRecommendationFormInitialValues", () => {
  it.each([true, false])(
    "starts without a preselected origin (predefined: %s)",
    (usePredefined) => {
      expect(getPlaceRecommendationFormInitialValues(usePredefined).locations).toEqual([]);
    },
  );

  it("keeps optional defaults disabled for a new recommendation", () => {
    expect(getPlaceRecommendationFormInitialValues()).toMatchObject({
      budgetPerPerson: [20000, 50000],
      isBudgetEnabled: false,
    });
  });

  it("restores every submitted field and display location from a retry state", () => {
    const retryState = createPlaceRecommendationRetryRouteState(
      {
        schedule: {
          dateISO: "2026-08-14",
          time24h: "18:30",
          stayDurationMinutes: 120,
        },
        location: [{ lat: 37.5665, lng: 126.978 }],
        numberOfPeople: 2,
        partyType: "FRIENDS",
        activityType: "MEAL",
        budgetPerPerson: [20000, 40000],
        userNaturalLanguageRequest: "조용한 저녁 식사 장소를 추천해 주세요.",
      },
      [
        {
          lat: 37.5665,
          lng: 126.978,
          placeName: "서울시청",
          roadNameAddress: "서울특별시 중구 세종대로 110",
        },
      ],
    );

    expect(getPlaceRecommendationRetryInitialValues(retryState)).toEqual({
      locations: [
        {
          lat: 37.5665,
          lng: 126.978,
          placeName: "서울시청",
          roadNameAddress: "서울특별시 중구 세종대로 110",
        },
      ],
      date: { year: 2026, month: 8, day: 14 },
      time24h: "18:30",
      stayDurationMinutes: 120,
      numberOfPeople: 2,
      partyType: "FRIENDS",
      activityType: "MEAL",
      budgetPerPerson: [20000, 40000],
      userNaturalLanguageRequest: "조용한 저녁 식사 장소를 추천해 주세요.",
      isStayDurationEnabled: true,
      isActivityTypeEnabled: true,
      isNumberOfPeopleEnabled: true,
      isPartyTypeEnabled: true,
      isBudgetEnabled: true,
    });
  });

  it("rejects a retry state whose display locations do not match the engine input", () => {
    expect(
      getPlaceRecommendationRetryInitialValues(
        createPlaceRecommendationRetryRouteState(
          {
            schedule: { dateISO: "2026-08-14", time24h: "18:30" },
            location: [{ lat: 37.5665, lng: 126.978 }],
            userNaturalLanguageRequest: "저녁 식사 장소를 추천해 주세요.",
          },
          [],
        ),
      ),
    ).toBeNull();
  });
});
