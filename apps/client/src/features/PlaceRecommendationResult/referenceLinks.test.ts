import { describe, expect, it } from "vitest";

import {
  getPlaceRecommendationReferenceDisplayTitle,
  toPlaceRecommendationReferenceLinks,
} from "./referenceLinks";

describe("toPlaceRecommendationReferenceLinks", () => {
  it("creates named links with favicons for known reference sites", () => {
    expect(
      toPlaceRecommendationReferenceLinks({
        naverMap: "https://map.naver.com/p/search/place",
        kakaoMap: "https://place.map.kakao.com/123",
        instagram: "https://www.instagram.com/example",
      }),
    ).toEqual([
      {
        domain: "map.naver.com",
        faviconUrl: "https://www.google.com/s2/favicons?domain=map.naver.com&sz=32",
        fallbackTitle: "네이버지도",
        siteName: "네이버지도",
        url: "https://map.naver.com/p/search/place",
      },
      {
        domain: "place.map.kakao.com",
        faviconUrl: "https://www.google.com/s2/favicons?domain=place.map.kakao.com&sz=32",
        fallbackTitle: "카카오맵",
        siteName: "카카오맵",
        url: "https://place.map.kakao.com/123",
      },
      {
        domain: "instagram.com",
        faviconUrl: "https://www.google.com/s2/favicons?domain=www.instagram.com&sz=32",
        fallbackTitle: "인스타그램",
        siteName: "인스타그램",
        url: "https://www.instagram.com/example",
      },
    ]);
  });

  it("uses a non-URL fallback title for other references", () => {
    expect(
      toPlaceRecommendationReferenceLinks({
        others: ["https://example.com/place"],
      }),
    ).toEqual([
      {
        domain: "example.com",
        faviconUrl: "https://www.google.com/s2/favicons?domain=example.com&sz=32",
        fallbackTitle: "참고 사이트",
        siteName: "참고 사이트",
        url: "https://example.com/place",
      },
    ]);
  });

  it("includes the place name in the fallback title while metadata is loading", () => {
    expect(
      toPlaceRecommendationReferenceLinks(
        { kakaoMap: "https://place.map.kakao.com/123" },
        "선이네수제순대국",
      ),
    ).toEqual([
      {
        domain: "place.map.kakao.com",
        faviconUrl: "https://www.google.com/s2/favicons?domain=place.map.kakao.com&sz=32",
        fallbackTitle: "선이네수제순대국 | 카카오맵",
        siteName: "카카오맵",
        url: "https://place.map.kakao.com/123",
      },
    ]);
  });

  it("falls back to the place metadata when the page only reports its site name", () => {
    const referenceLink = toPlaceRecommendationReferenceLinks(
      { kakaoMap: "https://place.map.kakao.com/123" },
      "선이네수제순대국",
    )[0];

    expect(referenceLink).toBeDefined();
    expect(getPlaceRecommendationReferenceDisplayTitle("카카오맵", referenceLink!)).toBe(
      "선이네수제순대국 | 카카오맵",
    );
    expect(
      getPlaceRecommendationReferenceDisplayTitle("선이네수제순대국 | 카카오맵", referenceLink!),
    ).toBe("선이네수제순대국 | 카카오맵");
  });
});
