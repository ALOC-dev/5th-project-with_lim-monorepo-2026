import { describe, expect, it } from "vitest";

import type { SavedRecommendationPlace } from "../../apis/server/savedPlaces";
import type { CourseDraft } from "./course.types";
import { toCourseDraft, toCreateCourseV2Request, toSavedCoursePlace } from "./courseRepository";

describe("course repository adapters", () => {
  it("maps saved_places snapshots without inventing category or location data", () => {
    const saved = {
      id: "a8f6ea0e-09b0-4ea9-a64c-6eaa129a6378",
      placeData: {
        name: "도시정원 다이닝",
        phoneNumber: "02-0000-0001",
        mainCategory: "식당",
        subCategory: "이탈리안",
        referenceUrls: { kakaoMap: "https://place.map.kakao.com/123456" },
        location: {
          lat: 37.5658,
          lng: 126.9809,
          roadAddressKo: "서울 중구 세종대로 110",
        },
      },
    } as SavedRecommendationPlace;

    expect(toSavedCoursePlace(saved)).toEqual({
      id: saved.id,
      source: "SAVED_PLACE",
      savedPlaceId: saved.id,
      kakaoPlaceId: "123456",
      name: "도시정원 다이닝",
      phone: "02-0000-0001",
      address: "서울 중구 세종대로 110",
      category: "이탈리안",
      lat: 37.5658,
      lng: 126.9809,
      placeUrl: "https://place.map.kakao.com/123456",
    });
  });

  it("sends saved references and direct-search snapshots through the v2 request", () => {
    const draft: CourseDraft = {
      places: [
        {
          id: "a8f6ea0e-09b0-4ea9-a64c-6eaa129a6378",
          source: "SAVED_PLACE",
          savedPlaceId: "a8f6ea0e-09b0-4ea9-a64c-6eaa129a6378",
          name: "저장 장소",
          address: "서울 중구",
          category: "카페",
          lat: 37.56,
          lng: 126.98,
        },
        {
          id: "DIRECT_SEARCH:987",
          source: "DIRECT_SEARCH",
          kakaoPlaceId: "987",
          name: "검색 장소",
          address: "서울 종로구",
          category: "음식점 > 한식",
          lat: 37.57,
          lng: 126.99,
          phone: "02-111-2222",
          placeUrl: "https://place.map.kakao.com/987",
        },
      ],
      date: "2026-08-15",
      startTime: "18:30",
      durationHours: 4,
      numberOfPeople: 3,
      budgetPerPersonWon: 50_000,
      pacePreference: "NORMAL",
    };

    expect(toCreateCourseV2Request(draft)).toEqual({
      version: 2,
      candidates: [
        {
          source: "SAVED_PLACE",
          savedPlaceId: "a8f6ea0e-09b0-4ea9-a64c-6eaa129a6378",
        },
        {
          source: "DIRECT_SEARCH",
          kakaoPlaceId: "987",
          name: "검색 장소",
          address: "서울 종로구",
          category: "음식점 > 한식",
          lat: 37.57,
          lng: 126.99,
          phone: "02-111-2222",
          placeUrl: "https://place.map.kakao.com/987",
        },
      ],
      date: "2026-08-15",
      startTime: "18:30",
      durationHours: 4,
      numberOfPeople: 3,
      budgetPerPersonWon: 50_000,
      pacePreference: "NORMAL",
    });
  });

  it("does not reinterpret a legacy favorite_places id as a saved_places id", () => {
    const draft = toCourseDraft({
      places: [
        {
          source: "FAVORITE",
          favoritePlaceId: "1ce0d23c-a214-4d90-8f8f-89275ae842f3",
          kakaoPlaceId: "123",
          name: "이전 즐겨찾기",
          address: "서울 중구",
          category: "카페",
          lat: 37.56,
          lng: 126.98,
        },
      ],
      date: "2026-08-15",
      startTime: "18:30",
      durationHours: 3,
    });

    expect(draft.places[0]).toMatchObject({
      source: "DIRECT_SEARCH",
      kakaoPlaceId: "123",
      name: "이전 즐겨찾기",
    });
    expect(draft.places[0]).not.toHaveProperty("savedPlaceId");
  });
});
