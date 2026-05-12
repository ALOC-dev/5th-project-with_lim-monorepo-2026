/**
 * 네이버 검색 API 클라이언트
 * 로컬 검색: https://developers.naver.com/docs/serviceapi/search/local/local.md
 * 블로그 검색: https://developers.naver.com/docs/serviceapi/search/blog/blog.md
 *
 * 목적:
 *   - 로컬 검색: 카카오 후보 장소의 네이버 등록 여부 확인 → mentionCount 이진 신호
 *   - 블로그 검색: 장소명 블로그 포스팅 총 수 → reviewCount (인기도 proxy)
 */

export type NaverLocalItem = {
  title: string;       // 장소명 (HTML 태그 포함, 예: "<b>맛집</b>")
  link: string;
  category: string;    // 카테고리 (예: "한식>삼겹살")
  description: string;
  telephone: string;
  address: string;     // 지번 주소
  roadAddress: string; // 도로명 주소
  mapx: string;        // 경도 (KATECH 좌표)
  mapy: string;        // 위도 (KATECH 좌표)
};

type NaverLocalResponse = {
  total: number;
  start: number;
  display: number;
  items: NaverLocalItem[];
};

/** title에서 HTML 태그 제거 */
export const cleanNaverTitle = (title: string): string =>
  title.replace(/<[^>]+>/g, "");

/**
 * 네이버 로컬 검색
 * @param keyword  검색 키워드
 * @param display  결과 개수 (최대 5)
 * @param sort     정렬 기준: "random"=정확도순(기본), "comment"=리뷰수순
 */
export const searchNaverLocal = async (
  keyword: string,
  display = 5,
  sort: "random" | "comment" = "random",
): Promise<NaverLocalItem[]> => {
  const clientId = process.env["NAVER_CLIENT_ID"];
  const clientSecret = process.env["NAVER_CLIENT_SECRET"];
  if (!clientId || !clientSecret) {
    throw new Error("NAVER_CLIENT_ID 또는 NAVER_CLIENT_SECRET 환경변수가 없음");
  }

  const params = new URLSearchParams({
    query: keyword,
    display: String(Math.min(display, 5)), // 네이버 로컬 최대 5
    sort,
  });

  const res = await fetch(
    `https://openapi.naver.com/v1/search/local.json?${params}`,
    {
      headers: {
        "X-Naver-Client-Id": clientId,
        "X-Naver-Client-Secret": clientSecret,
      },
    },
  );

  if (!res.ok) {
    throw new Error(`네이버 API 오류: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as NaverLocalResponse;
  return data.items;
};

// ── 네이버 블로그 검색 ────────────────────────────────────────────────────────
type NaverBlogResponse = {
  total: number;
  start: number;
  display: number;
  items: unknown[];
};

/**
 * 장소명으로 네이버 블로그 포스팅 수 조회
 * total 값을 reviewCount proxy로 활용 (인기 맛집일수록 블로그 언급 많음)
 *
 * 검색 쿼리: "{placeName} 맛집" → 단어가 짧거나 일반적인 이름의 노이즈 방지
 *   예) "와" → 7천만 건(노이즈) vs "와 맛집" → 실제 식당 리뷰 위주
 *
 * 실패 시 0 반환 (fallback)
 */
export const fetchNaverBlogCount = async (placeName: string): Promise<number> => {
  const clientId = process.env["NAVER_CLIENT_ID"];
  const clientSecret = process.env["NAVER_CLIENT_SECRET"];
  if (!clientId || !clientSecret) return 0;

  const params = new URLSearchParams({
    query: `${placeName} 맛집`,  // "맛집" 추가로 식당 관련 포스팅만 필터링
    display: "1",                 // total만 필요하므로 1개만
    sort: "sim",                  // 정확도순
  });

  try {
    const res = await fetch(
      `https://openapi.naver.com/v1/search/blog.json?${params}`,
      {
        headers: {
          "X-Naver-Client-Id": clientId,
          "X-Naver-Client-Secret": clientSecret,
        },
      },
    );
    if (!res.ok) return 0;
    const data = (await res.json()) as NaverBlogResponse;
    return data.total ?? 0;
  } catch {
    return 0;
  }
};
