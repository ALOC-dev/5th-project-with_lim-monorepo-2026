import { afterEach, describe, expect, it, vi } from "vitest";

const serverApiMock = vi.hoisted(() => ({
  post: vi.fn(),
}));

vi.mock("../base", () => ({
  serverApi: serverApiMock,
  serverApiBaseUrl: "http://localhost:3000",
}));

import { createPlaceRecommendationJob } from "./placeRecommendation";

afterEach(() => {
  serverApiMock.post.mockReset();
});

describe("place recommendation server API", () => {
  it("sends engine input together with the display locations needed for durable retry", async () => {
    const input = {
      schedule: { dateISO: "2026-08-14", time24h: "18:30" },
      location: [{ lat: 37.5665, lng: 126.978 }],
      userNaturalLanguageRequest: "저녁 식사 장소를 추천해 주세요.",
    };
    const formLocations = [
      {
        lat: 37.5665,
        lng: 126.978,
        placeName: "서울시청",
        roadNameAddress: "서울특별시 중구 세종대로 110",
      },
    ];
    serverApiMock.post.mockReturnValue({
      json: () => Promise.resolve({ jobId: "job-123" }),
    });

    await expect(createPlaceRecommendationJob({ input, formLocations })).resolves.toEqual({
      success: true,
      data: { jobId: "job-123" },
    });
    expect(serverApiMock.post).toHaveBeenCalledWith("api/recommend", {
      json: { input, formLocations },
    });
  });
});
