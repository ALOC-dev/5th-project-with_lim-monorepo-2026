export type PlaceRecommendationReferenceUrls = {
  readonly instagram?: string;
  readonly kakaoMap?: string;
  readonly naverMap?: string;
  readonly others?: readonly string[];
};

export type PlaceRecommendationReferenceLink = {
  readonly domain: string;
  readonly faviconUrl: string;
  readonly fallbackTitle: string;
  readonly siteName: string;
  readonly url: string;
};

const getFaviconUrl = (url: string): string => {
  const hostname = new URL(url).hostname;
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=32`;
};

const getDisplayDomain = (url: string): string => new URL(url).hostname.replace(/^www\./u, "");

const withPlaceName = (siteName: string, placeName?: string): string => {
  const normalizedPlaceName = placeName?.trim();
  return normalizedPlaceName ? `${normalizedPlaceName} | ${siteName}` : siteName;
};

const getSiteName = (url: string): string => {
  const hostname = new URL(url).hostname.toLocaleLowerCase("ko-KR");

  if (hostname === "place.map.kakao.com" || hostname.endsWith(".kakao.com")) {
    return "카카오맵";
  }
  if (hostname === "map.naver.com" || hostname.endsWith(".naver.com")) {
    return "네이버지도";
  }
  if (hostname === "instagram.com" || hostname.endsWith(".instagram.com")) {
    return "인스타그램";
  }

  return "참고 사이트";
};

const toLink = (url: string, placeName?: string): PlaceRecommendationReferenceLink => {
  const siteName = getSiteName(url);

  return {
    domain: getDisplayDomain(url),
    faviconUrl: getFaviconUrl(url),
    fallbackTitle: withPlaceName(siteName, placeName),
    siteName,
    url,
  };
};

export const getPlaceRecommendationReferenceDisplayTitle = (
  metadataTitle: string | null | undefined,
  referenceLink: PlaceRecommendationReferenceLink,
): string => {
  const normalizedMetadataTitle = metadataTitle?.trim();

  return normalizedMetadataTitle && normalizedMetadataTitle !== referenceLink.siteName
    ? normalizedMetadataTitle
    : referenceLink.fallbackTitle;
};

export const toPlaceRecommendationReferenceLinks = (
  referenceUrls: PlaceRecommendationReferenceUrls,
  placeName?: string,
): readonly PlaceRecommendationReferenceLink[] => [
  ...(referenceUrls.naverMap ? [toLink(referenceUrls.naverMap, placeName)] : []),
  ...(referenceUrls.kakaoMap ? [toLink(referenceUrls.kakaoMap, placeName)] : []),
  ...(referenceUrls.instagram ? [toLink(referenceUrls.instagram, placeName)] : []),
  ...(referenceUrls.others?.map((url) => toLink(url)) ?? []),
];
