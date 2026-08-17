// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";

import { removeSavedCourseBookmark, searchCourseCandidates } from "./courses";

afterEach(() => vi.unstubAllGlobals());

describe("course candidate search API", () => {
  it("returns an immediate empty result without a network request for an empty query", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(searchCourseCandidates({ query: "   " })).resolves.toEqual({
      success: true,
      data: { items: [] },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("preserves category and exact Kakao place fields from the server", async () => {
    const fetchMock = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              items: [
                {
                  source: "DIRECT_SEARCH",
                  kakaoPlaceId: "123",
                  name: "테스트 식당",
                  address: "서울특별시 중구",
                  roadAddress: "서울특별시 중구 세종대로 1",
                  category: "음식점 > 한식",
                  lat: 37.56,
                  lng: 126.98,
                  phone: "02-123-4567",
                  placeUrl: "https://place.map.kakao.com/123",
                },
              ],
            },
          }),
          { headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await searchCourseCandidates({ query: "  테스트 식당  " });

    expect(result).toMatchObject({
      success: true,
      data: {
        items: [
          {
            kakaoPlaceId: "123",
            category: "음식점 > 한식",
            placeUrl: "https://place.map.kakao.com/123",
          },
        ],
      },
    });
    const request = fetchMock.mock.calls[0]?.[0];
    if (!request) throw new Error("Expected course search to issue a request");
    expect(request instanceof Request ? request.url : String(request)).toBe(
      "http://localhost:3000/api/course-candidates/search?q=%ED%85%8C%EC%8A%A4%ED%8A%B8+%EC%8B%9D%EB%8B%B9",
    );
  });
});

describe("saved course option API", () => {
  it("removes an orphaned snapshot by its saved row id", async () => {
    const savedOptionId = "a8f6ea0e-09b0-4ea9-a64c-6eaa129a6378";
    const fetchMock = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) =>
      Promise.resolve(
        new Response(JSON.stringify({ success: true, data: { removedId: savedOptionId } }), {
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(removeSavedCourseBookmark(savedOptionId)).resolves.toEqual({
      success: true,
      data: { removedId: savedOptionId },
    });
    const requestCall = fetchMock.mock.calls[0];
    const request = requestCall?.[0];
    if (!request) throw new Error("Expected saved option removal to issue a request");
    const normalized =
      typeof request === "string" || request instanceof URL
        ? new Request(request, requestCall?.[1])
        : request;
    expect(normalized.method).toBe("DELETE");
    expect(normalized.url).toBe(
      `http://localhost:3000/api/courses/options/favorites/${savedOptionId}`,
    );
  });
});
