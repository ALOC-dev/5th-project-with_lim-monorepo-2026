/**
 * 카카오 로컬 API 클라이언트
 * 문서: https://developers.kakao.com/docs/latest/ko/local/dev-guide#search-by-keyword
 */

// 카카오 API가 반환하는 장소 한 개의 형태
export type KakaoDocument = {
  id: string;
  place_name: string;        // 장소명
  category_name: string;     // 카테고리 (예: "음식점 > 한식 > 삼겹살")
  category_group_code: string; // 카테고리 코드 (FD6=음식점, CE7=카페)
  address_name: string;      // 지번 주소
  road_address_name: string; // 도로명 주소
  x: string;                 // 경도 (longitude) - 문자열임 주의
  y: string;                 // 위도 (latitude)  - 문자열임 주의
  place_url: string;         // 카카오맵 URL
  phone: string;
  distance: string;          // 중심점으로부터 거리 (미터)
};

type KakaoLocalResponse = {
  documents: KakaoDocument[];
  meta: {
    total_count: number;
    pageable_count: number;
    is_end: boolean;
  };
};

/**
 * 키워드로 장소 검색
 * @param keyword  검색 키워드 (예: "대화하기 좋은 저녁 식사")
 * @param lng      중심 경도
 * @param lat      중심 위도
 * @param radiusM  검색 반경 (미터, 최대 20000)
 * @param size     결과 개수 (최대 15)
 */
export const searchKakaoPlaces = async (
  keyword: string,
  lng: number,
  lat: number,
  radiusM: number,
  size: number,
): Promise<KakaoDocument[]> => {
  const apiKey = process.env["KAKAO_REST_API_KEY"];
  if (!apiKey) throw new Error("KAKAO_REST_API_KEY 환경변수가 없음");

  const params = new URLSearchParams({
    query: keyword,
    x: String(lng),
    y: String(lat),
    radius: String(Math.min(radiusM, 20000)), // 카카오 최대값 20000m
    size: String(Math.min(size, 15)),          // 카카오 최대값 15
  });

  const res = await fetch(
    `https://dapi.kakao.com/v2/local/search/keyword.json?${params}`,
    { headers: { Authorization: `KakaoAK ${apiKey}` } },
  );

  if (!res.ok) {
    throw new Error(`카카오 API 오류: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as KakaoLocalResponse;
  return data.documents;
};
