// @vitest-environment node

import type { PlaceRecommendationItem } from "@monorepo/recommendation-engine/v1/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";

import { deleteSavedPlace, getSavedPlaces, saveSavedPlace } from "./savedPlaces";

const testHistoryId = "1ce0d23c-a214-4d90-8f8f-89275ae842f3";

const testRecommendation: PlaceRecommendationItem = {
  id: "place-001",
  name: "도시정원 다이닝",
  phoneNumber: "02-0000-0001",
  tags: ["분위기", "친구모임"],
  contentSummary: "조용한 좌석 구성이 좋아 대화하기에 적합한 다이닝입니다.",
  mainCategory: "식당",
  subCategory: "이탈리안",
  operationInfo: {
    timezone: "Asia/Seoul",
    schedules: {
      MONDAY: { status: "CLOSED" },
      TUESDAY: { status: "CLOSED" },
      WEDNESDAY: { status: "CLOSED" },
      THURSDAY: { status: "CLOSED" },
      FRIDAY: { status: "CLOSED" },
      SATURDAY: { status: "CLOSED" },
      SUNDAY: { status: "CLOSED" },
    },
  },
  availabilityAtRequestedTime: {
    status: "CLOSED",
    requestedDateISO: "2026-08-10",
    requestedTime24h: "19:00",
    stayDurationMinutes: 120,
    reason: "요청 시간에는 영업하지 않습니다.",
  },
  referenceUrls: {
    kakaoMap: "https://map.kakao.com/place-001",
  },
  accessibility: {
    score: 91,
    distanceMeters: 320,
    perOrigin: [
      {
        originId: "host",
        distanceMeters: 320,
      },
    ],
  },
  location: {
    lat: 37.5658,
    lng: 126.9809,
    placeName: "도시정원 다이닝",
    roadAddressKo: "서울 중구 세종대로 110",
  },
  priceRangePerPerson: [28_000, 42_000],
  score: 92,
  scoreBreakdown: {
    inputMatch: 94,
    trust: 90,
    accessibility: 91,
    diversity: 88,
    total: 92,
  },
  reasons: ["대화하기 좋은 좌석 간격"],
};

const testSavedPlace = {
  id: "a8f6ea0e-09b0-4ea9-a64c-6eaa129a6378",
  historyId: testHistoryId,
  placeData: testRecommendation,
  createdAt: "2026-08-10T12:00:00.000+09:00",
};

type FetchInput = RequestInfo | URL;

let receivedRequest: Request | null = null;
let receivedRequestBody: string | null = null;

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });

const stubJsonFetch = (body: unknown, status = 200): void => {
  vi.stubGlobal("fetch", async (input: FetchInput, init?: RequestInit): Promise<Response> => {
    const request =
      typeof input === "string" || input instanceof URL ? new Request(input, init) : input;
    receivedRequest = request;
    receivedRequestBody = await request.clone().text();
    return jsonResponse(body, status);
  });
};

const requireReceivedRequest = (): Request => {
  if (receivedRequest === null) {
    throw new Error("Expected the API adapter to issue an HTTP request");
  }

  return receivedRequest;
};

afterEach(() => {
  receivedRequest = null;
  receivedRequestBody = null;
  vi.unstubAllGlobals();
});

describe("saved places server API", () => {
  it("returns saved-place rows with recommendation placeData parsed at the client boundary", async () => {
    // Given
    stubJsonFetch({
      success: true,
      data: {
        savedPlaces: [testSavedPlace],
      },
    });

    // When
    const result = await getSavedPlaces();

    // Then
    expect(result).toEqual({
      success: true,
      data: {
        savedPlaces: [testSavedPlace],
      },
    });
    expect(requireReceivedRequest().url).toBe("http://localhost:3000/api/saved-places");
    expect(requireReceivedRequest().method).toBe("GET");
  });

  it("returns an API error when a saved-place row has malformed recommendation data", async () => {
    // Given
    stubJsonFetch({
      success: true,
      data: {
        savedPlaces: [
          {
            ...testSavedPlace,
            placeData: {
              id: "incomplete-place",
            },
          },
        ],
      },
    });

    // When
    const result = await getSavedPlaces();

    // Then
    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("Expected malformed recommendation data to produce an API error");
    }
    expect(result.error).not.toBe("");
  });

  it("sends a typed recommendation in the saved-place contract payload", async () => {
    // Given
    stubJsonFetch({
      success: true,
      data: {
        savedPlace: testSavedPlace,
      },
    });

    // When
    const result = await saveSavedPlace({
      historyId: testHistoryId,
      placeData: testRecommendation,
    });

    // Then
    expect(result).toEqual({
      success: true,
      data: {
        savedPlace: testSavedPlace,
      },
    });
    expect(requireReceivedRequest().url).toBe("http://localhost:3000/api/saved-places");
    expect(requireReceivedRequest().method).toBe("POST");
    if (receivedRequestBody === null) {
      throw new Error("Expected the API adapter to send a request body");
    }
    const requestBody: unknown = JSON.parse(receivedRequestBody);
    expect(requestBody).toEqual({
      historyId: testHistoryId,
      placeData: testRecommendation,
    });
  });

  it("uses a saved-place contract UUID when deleting a row", async () => {
    // Given
    stubJsonFetch({
      success: true,
      data: {
        removed: true,
      },
    });

    // When
    const result = await deleteSavedPlace(testSavedPlace.id);

    // Then
    expect(result).toEqual({
      success: true,
      data: {
        removed: true,
      },
    });
    expect(requireReceivedRequest().url).toBe(
      `http://localhost:3000/api/saved-places/${testSavedPlace.id}`,
    );
    expect(requireReceivedRequest().method).toBe("DELETE");
  });

  it("rejects a non-UUID saved-place identifier before issuing a delete request", async () => {
    // Given
    stubJsonFetch({
      success: true,
      data: {
        removed: true,
      },
    });

    // When
    const result = await deleteSavedPlace("saved/place id");

    // Then
    expect(result.success).toBe(false);
    expect(receivedRequest).toBeNull();
  });

  it("converts an HTTP failure into the shared client error response", async () => {
    // Given
    stubJsonFetch(
      {
        success: false,
        error: "Authentication required",
      },
      401,
    );

    // When
    const result = await getSavedPlaces();

    // Then
    expect(result).toEqual({
      success: false,
      error: "HTTP 401",
    });
  });
});
