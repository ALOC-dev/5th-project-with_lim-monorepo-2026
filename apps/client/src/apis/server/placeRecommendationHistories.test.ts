import { afterEach, describe, expect, it, vi } from "vitest";

const serverApiMock = vi.hoisted(() => ({
  delete: vi.fn(),
  get: vi.fn(),
  patch: vi.fn(),
}));

vi.mock("../base", () => ({
  serverApi: serverApiMock,
}));

import {
  deletePlaceRecommendationHistory,
  getPlaceRecommendationHistories,
  getPlaceRecommendationHistory,
  renamePlaceRecommendationHistory,
} from "./placeRecommendationHistories";

const historyId = "9d4c5ece-d69d-45e3-8860-7a0aef0ca2bb";

afterEach(() => {
  serverApiMock.delete.mockReset();
  serverApiMock.get.mockReset();
  serverApiMock.patch.mockReset();
});

describe("place recommendation histories server API", () => {
  it("parses the historical list response and requests the history collection endpoint", async () => {
    // Given
    serverApiMock.get.mockReturnValue({
      json: () =>
        Promise.resolve({
          success: true,
          data: {
            items: [
              {
                id: historyId,
                recommendationCount: 3,
                requestedAt: "2026-08-10T10:00:00.000Z",
                status: "COMPLETED",
                title: "저녁 식사 추천",
              },
            ],
            nextCursor: null,
          },
        }),
    });

    // When
    const result = await getPlaceRecommendationHistories();

    // Then
    expect(result).toEqual({
      success: true,
      data: {
        items: [
          {
            id: historyId,
            recommendationCount: 3,
            requestedAt: "2026-08-10T10:00:00.000Z",
            status: "COMPLETED",
            title: "저녁 식사 추천",
          },
        ],
        nextCursor: null,
      },
    });
    expect(serverApiMock.get).toHaveBeenCalledWith("api/place-recommendation-histories");
  });

  it.each([
    {
      formLocations: [
        {
          lat: 37.5665,
          lng: 126.978,
          placeName: "서울시청",
          roadNameAddress: "서울특별시 중구 세종대로 110",
        },
      ],
      id: historyId,
      input: {
        schedule: { dateISO: "2026-08-10", time24h: "18:30" },
        location: [{ lat: 37.5665, lng: 126.978 }],
        userNaturalLanguageRequest: "저녁 식사 장소를 추천해 주세요.",
      },
      requestedAt: "2026-08-10T10:00:00.000Z",
      status: "PENDING",
      title: "생성 중인 추천",
    },
    {
      completedAt: "2026-08-10T10:02:05.000Z",
      id: historyId,
      input: { request: "저녁 식사" },
      output: { recommendations: [] },
      requestedAt: "2026-08-10T10:00:00.000Z",
      status: "COMPLETED",
      title: "완료된 추천",
    },
    {
      completedAt: "2026-08-10T10:02:05.000Z",
      errorMessage: "추천을 생성하지 못했습니다.",
      formLocations: [
        {
          lat: 37.5665,
          lng: 126.978,
          placeName: "서울시청",
          roadNameAddress: "서울특별시 중구 세종대로 110",
        },
      ],
      id: historyId,
      input: {
        schedule: { dateISO: "2026-08-10", time24h: "18:30" },
        location: [{ lat: 37.5665, lng: 126.978 }],
        userNaturalLanguageRequest: "저녁 식사 장소를 추천해 주세요.",
      },
      requestedAt: "2026-08-10T10:00:00.000Z",
      status: "FAILED",
      title: "실패한 추천",
    },
  ] as const)("parses the %s detail state", async (data) => {
    // Given
    serverApiMock.get.mockReturnValue({
      json: () => Promise.resolve({ success: true, data }),
    });

    // When
    const result = await getPlaceRecommendationHistory(historyId);

    // Then
    expect(result).toEqual({ success: true, data });
    expect(serverApiMock.get).toHaveBeenCalledWith(
      "api/place-recommendation-histories/" + historyId,
    );
  });

  it("normalizes and sends the historical rename request body", async () => {
    // Given
    serverApiMock.patch.mockReturnValue({
      json: () =>
        Promise.resolve({
          success: true,
          data: {
            id: historyId,
            title: "새 추천 이름",
          },
        }),
    });

    // When
    const result = await renamePlaceRecommendationHistory(historyId, "  새 추천 이름  ");

    // Then
    expect(result).toEqual({
      success: true,
      data: {
        id: historyId,
        title: "새 추천 이름",
      },
    });
    expect(serverApiMock.patch).toHaveBeenCalledWith(
      "api/place-recommendation-histories/" + historyId + "/rename",
      { json: { title: "새 추천 이름" } },
    );
  });

  it("uses the historical delete endpoint and parses its deleted identifier", async () => {
    // Given
    serverApiMock.delete.mockReturnValue({
      json: () =>
        Promise.resolve({
          success: true,
          data: {
            deletedId: historyId,
          },
        }),
    });

    // When
    const result = await deletePlaceRecommendationHistory(historyId);

    // Then
    expect(result).toEqual({
      success: true,
      data: {
        deletedId: historyId,
      },
    });
    expect(serverApiMock.delete).toHaveBeenCalledWith(
      "api/place-recommendation-histories/" + historyId,
    );
  });

  it("converts an unknown history status into a client error at the Zod boundary", async () => {
    // Given
    serverApiMock.get.mockReturnValue({
      json: () =>
        Promise.resolve({
          success: true,
          data: {
            items: [
              {
                id: historyId,
                recommendationCount: null,
                requestedAt: "2026-08-10T10:00:00.000Z",
                status: "DONE",
                title: "잘못된 상태",
              },
            ],
            nextCursor: null,
          },
        }),
    });

    // When
    const result = await getPlaceRecommendationHistories();

    // Then
    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("Expected an unknown history status to fail at the client boundary");
    }
    expect(result.error).not.toBe("");
  });

  it("rejects historical list titles that are blank after trimming", async () => {
    // Given
    serverApiMock.get.mockReturnValue({
      json: () =>
        Promise.resolve({
          success: true,
          data: {
            items: [
              {
                id: historyId,
                recommendationCount: null,
                requestedAt: "2026-08-10T10:00:00.000Z",
                status: "COMPLETED",
                title: "   ",
              },
            ],
            nextCursor: null,
          },
        }),
    });

    // When
    const result = await getPlaceRecommendationHistories();

    // Then
    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("Expected a blank history title to fail at the client boundary");
    }
    expect(result.error).not.toBe("");
  });
});
