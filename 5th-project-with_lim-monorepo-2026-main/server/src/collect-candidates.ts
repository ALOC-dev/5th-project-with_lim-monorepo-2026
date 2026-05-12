/**
 * collectCandidates 구현
 *
 * 1. Groq(Llama)로 유저 자연어 → 카카오 검색 키워드 2~3개 추출
 * 2. 키워드별로 카카오 로컬 API + 네이버 로컬 API 병렬 검색
 * 3. 카카오 결과 합치고 중복 제거 후 RecommendationCandidate[] 반환
 * 4. 네이버 검색 순위로 mentionCount 신호 주입 → trust 점수 차별화
 *
 * 한계 (나중에 보강할 부분):
 * - 카카오 기본 검색 API는 영업시간/가격 정보를 주지 않음
 *   → 영업시간은 "전일 09:00~23:00"으로 기본값 세팅
 *   → 가격은 카테고리 코드로 대략 추정
 */

import type { EngineConfig, EngineInput, RecommendationCandidate } from "@monorepo/common";
import { extractSearchKeywords } from "./groq-keywords.js";
import { searchKakaoPlaces, type KakaoDocument } from "./kakao-search.js";
import { fetchKakaoOperationInfo } from "./kakao-place-detail.js";
import { searchNaverLocal, cleanNaverTitle, fetchNaverBlogCount, type NaverLocalItem } from "./naver-search.js";

// EngineConfig에서 collectCandidates 두 번째 파라미터 타입 추출 (RequiredEngineConfig)
type CollectConfig = Parameters<NonNullable<EngineConfig["collectCandidates"]>>[1];

// ── 카테고리 변환 ────────────────────────────────────────────────────────────
// 카카오 category_name 예시: "음식점 > 한식 > 삼겹살"
const parseCategory = (
  categoryName: string,
  groupCode: string,
): { main: string; sub: string } => {
  const parts = categoryName.split(" > ").map((s) => s.trim());

  // FD6 = 음식점, CE7 = 카페
  const mainFallback = groupCode === "CE7" ? "카페" : "식당";
  const subFallback = parts[1] ?? parts[0] ?? "기타";

  return {
    main: groupCode === "CE7" ? "카페" : "식당",
    sub: subFallback === mainFallback ? (parts[2] ?? subFallback) : subFallback,
  };
};

// ── 가격 추정 ────────────────────────────────────────────────────────────────
// 카카오 API는 가격 정보 없음 → 카테고리 코드로 대략 추정
const estimatePrice = (groupCode: string): [number, number] => {
  if (groupCode === "CE7") return [5000, 15000];  // 카페
  if (groupCode === "FD6") return [10000, 35000]; // 음식점
  return [10000, 50000];                           // 기타
};

// ── 간식 전용 업종 판별 ───────────────────────────────────────────────────────
// FD6(음식점) 안에서 2번째 레벨이 "간식"인 경우만 제외
// 예: "음식점 > 간식 > 떡,한과" → 제외
// CE7(카페) 계열은 건드리지 않음 → "카페" 검색 시 정상 포함
const isSnackOnly = (categoryName: string, groupCode: string): boolean => {
  if (groupCode !== "FD6") return false;
  const sub1 = categoryName.split(" > ")[1]?.trim() ?? "";
  return sub1 === "간식";
};

// ── 이자카야/술집류 카테고리 판별 ──────────────────────────────────────────────
const BAR_KEYWORDS = ["이자카야", "술집", "주점", "요리주점", "포장마차", "선술집"];

const isBarCategory = (categoryName: string): boolean =>
  BAR_KEYWORDS.some((kw) => categoryName.includes(kw));

// ── 기본 영업시간 ────────────────────────────────────────────────────────────
// 카카오 기본 검색 API는 영업시간 미제공 → 카테고리 기반으로 추정
type DayOfWeek = "MONDAY" | "TUESDAY" | "WEDNESDAY" | "THURSDAY" | "FRIDAY" | "SATURDAY" | "SUNDAY";
const ALL_DAYS: DayOfWeek[] = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"];

// userWantsBar=true 이면 술집 카테고리에도 17:00 제한을 걸지 않음
// (유저가 명시적으로 술집을 요청한 경우 시간 필터가 전부 걸러내는 문제 방지)
const defaultOperationInfo = (categoryName = "", userWantsBar = false) => ({
  timezone: "Asia/Seoul" as const,
  schedules: [
    {
      daysOfWeek: ALL_DAYS,
      status: "OPEN" as const,
      open: (!userWantsBar && isBarCategory(categoryName)) ? "17:00" : "11:00",
      close: "23:00",
      breakTimes: [] as { start: string; end: string }[],
    },
  ],
});

// ── Kakao Document → RecommendationCandidate 변환 ───────────────────────────
const toCandidate = (doc: KakaoDocument, userWantsBar = false): RecommendationCandidate => {
  const { main, sub } = parseCategory(doc.category_name, doc.category_group_code);
  const [priceMin, priceMax] = estimatePrice(doc.category_group_code);

  return {
    id: doc.id,
    name: doc.place_name,
    tags: [main, sub].filter((t) => t !== "기타"),
    contentSummary: `${doc.category_name} | ${doc.road_address_name || doc.address_name}`,
    mainCategory: main,
    subCategory: sub,
    operationInfo: defaultOperationInfo(doc.category_name, userWantsBar),
    referenceUrls: {
      kakaoMap: doc.place_url,
      naverMap: `https://map.naver.com/v5/search/${encodeURIComponent(doc.place_name)}`,
    },
    location: {
      lat: Number(doc.y),   // 카카오는 y가 위도
      lng: Number(doc.x),   // 카카오는 x가 경도
      placeName: doc.place_name,
      roadAddressKo: doc.road_address_name || doc.address_name,
    },
    priceRangePerPerson: [priceMin, priceMax],
    status: "ACTIVE",
  };
};

// ── 네이버 mentionCount 매칭 ─────────────────────────────────────────────────
// 장소명 정규화: 공백·특수문자 제거 후 소문자 비교
const normalizeName = (name: string): string =>
  name.toLowerCase().replace(/[\s·（）()\-_]/g, "");

// 네이버 검색 결과에서 카카오 장소명과 일치하는 순위 반환 (0-based, 없으면 -1)
const findNaverRank = (
  naverItems: NaverLocalItem[],
  kakaoName: string,
): number => {
  const normalized = normalizeName(kakaoName);
  return naverItems.findIndex((item) => {
    const naverName = normalizeName(cleanNaverTitle(item.title));
    return (
      naverName === normalized ||
      naverName.includes(normalized) ||
      normalized.includes(naverName)
    );
  });
};

// 장소명 직접 검색 → 1위 매칭 여부로 mentionCount 결정
// 이름 검색은 항상 자기 자신이 1위 → 순위로 차별화 불가
// 대신 "네이버에 존재하는가"를 이진 신호로 사용:
//   찾음(rank=0) → mentionCount=50 (logarithmicScore≈84점)
//   못 찾음       → mentionCount=0  (logarithmicScore=40점 기본값)
const rankToMentionCount = (rank: number): number => {
  if (rank === 0) return 50; // 네이버에 정확히 등록된 장소
  return 0;                  // 네이버에 없거나 매칭 실패
};

// ── 카카오 Place Detail로 영업시간 보강 ──────────────────────────────────────
// 카카오 상세 API 병렬 호출 → 실제 영업시간 주입 (실패 시 기본값 유지)
const enrichWithOperationInfo = async (
  candidates: RecommendationCandidate[],
): Promise<RecommendationCandidate[]> => {
  return Promise.all(
    candidates.map(async (candidate) => {
      const operationInfo = await fetchKakaoOperationInfo(candidate.id);
      if (operationInfo) {
        const openSchedule = operationInfo.schedules.find((s) => s.status === "OPEN");
        if (openSchedule && openSchedule.status === "OPEN") {
          console.log(`[카카오 상세] "${candidate.name}" 영업: ${openSchedule.open}~${openSchedule.close}`);
        }
        return { ...candidate, operationInfo };
      }
      return candidate;
    }),
  );
};

// ── 네이버 신호 보강 ──────────────────────────────────────────────────────────
// 배치당 로컬 검색 + 블로그 검색을 병렬로 실행 (API 호출 시간 절약)
//
// 수집 신호:
//   mentionCount: 로컬 검색 1위 매칭 여부 (이진) → 네이버 등록 확인
//   reviewCount:  블로그 포스팅 총 수 (연속)    → 인기도 proxy
//
// scoring.ts 기준:
//   mentionScore = logarithmicScore(mentionCount, 100)  → Trust 15%
//   reviewScore  = logarithmicScore(reviewCount,  1000) → Trust 25%
const enrichWithNaverSignals = async (
  candidates: RecommendationCandidate[],
): Promise<RecommendationCandidate[]> => {
  const BATCH_SIZE = 5;
  const DELAY_MS = 1200; // 로컬+블로그 2개 API 병렬 실행 → Rate limit 여유있게
  const results: RecommendationCandidate[] = [];

  for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
    const batch = candidates.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(async (candidate) => {
        try {
          // 로컬 검색 + 블로그 검색 병렬 실행
          const [localItems, blogCount] = await Promise.all([
            searchNaverLocal(candidate.name, 3, "random"),
            fetchNaverBlogCount(candidate.name),
          ]);

          const rank = findNaverRank(localItems, candidate.name);
          const mentionCount = rankToMentionCount(rank);

          console.log(
            `[네이버 신호] "${candidate.name}" → ` +
            `로컬 ${rank === -1 ? "미등록" : `${rank + 1}위`}, ` +
            `블로그 ${blogCount}건 (mentionCount=${mentionCount}, reviewCount=${blogCount})`,
          );

          return {
            ...candidate,
            signals: { ...candidate.signals, mentionCount, reviewCount: blogCount },
          };
        } catch (err) {
          console.warn(`[네이버 신호 실패] "${candidate.name}": ${String(err)}`);
          return candidate;
        }
      }),
    );
    results.push(...batchResults);
    if (i + BATCH_SIZE < candidates.length) {
      await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
    }
  }
  return results;
};

// ── 존재 확인 필터 ────────────────────────────────────────────────────────────
// 네이버 로컬에서 찾지 못하고(mentionCount=0) 블로그 언급도 거의 없으면
// 실제 존재하지 않는 장소(카카오 DB 노이즈)로 판단하여 제외
//
// 기준:
//   mentionCount=0 → 네이버 로컬 검색에서 이름 일치 실패
//   reviewCount < 5 → 블로그 포스팅이 사실상 없음
// 두 조건이 동시에 충족될 때만 제외 (각각은 합법적 사유가 될 수 있음)
const filterUnverified = (
  candidates: RecommendationCandidate[],
): RecommendationCandidate[] =>
  candidates.filter((c) => {
    const mentionCount = c.signals?.mentionCount ?? 0;
    const reviewCount = c.signals?.reviewCount ?? 0;
    if (mentionCount === 0 && reviewCount < 5) {
      console.log(`[존재 검사] 제외: "${c.name}" (네이버 미등록, 블로그 ${reviewCount}건)`);
      return false;
    }
    return true;
  });

// ── 메인 함수 ────────────────────────────────────────────────────────────────
export const collectCandidates = async (
  input: EngineInput,
  config: CollectConfig,
): Promise<RecommendationCandidate[]> => {
  const { location } = input.userInput;
  if (location.length === 0) return [];

  const center = location[0]!;
  const radiusM = config.maxDistanceKm * 1000;

  // 유저가 명시적으로 술집 계열을 요청한 경우 영업시간 17:00 제한 미적용
  const userWantsBar = /이자카야|술집|주점|포장마차|호프|맥주|와인바/.test(
    input.userInput.userNaturalLanguageRequest,
  );

  // 1. Groq로 검색 키워드 추출
  const keywords = await extractSearchKeywords(input.userInput);

  // 2. 카카오 키워드 검색 (병렬)
  const kakaoResults = await Promise.all(
    keywords.map((keyword) => {
      console.log(`[카카오 검색] 키워드: "${keyword}" / 반경: ${radiusM}m`);
      return searchKakaoPlaces(keyword, center.lng, center.lat, radiusM, 15);
    }),
  );

  // 3. 카카오 결과 합치고 id 기준 중복 제거 + 간식 전용 업종 제외
  const seen = new Set<string>();
  const documents = kakaoResults.flat().filter((doc) => {
    if (seen.has(doc.id)) return false;
    seen.add(doc.id);
    if (isSnackOnly(doc.category_name, doc.category_group_code)) {
      console.log(`[간식 필터] 제외: "${doc.place_name}" (${doc.category_name})`);
      return false;
    }
    return true;
  });

  console.log(`[카카오 검색] 총 ${documents.length}개 장소 수신 (중복 제거 후)`);

  // 4. KakaoDocument → RecommendationCandidate 변환
  const candidates = documents.map((doc) => toCandidate(doc, userWantsBar));

  // 5. 카카오 Place Detail API로 영업시간 실제 데이터 주입 (병렬)
  console.log(`[카카오 상세] ${candidates.length}개 장소 영업시간 조회 시작`);
  const withHours = await enrichWithOperationInfo(candidates);

  // 6. 후보 장소명으로 네이버 로컬 + 블로그 검색 → mentionCount + reviewCount 주입
  console.log(`[네이버 신호] ${withHours.length}개 장소 신호 수집 시작`);
  const withSignals = await enrichWithNaverSignals(withHours);

  // 7. 존재 확인 필터 → 네이버 미등록 + 블로그 언급 없는 의심 장소 제거
  const verified = filterUnverified(withSignals);
  console.log(`[존재 검사] ${withSignals.length}개 → ${verified.length}개 (${withSignals.length - verified.length}개 제거)`);
  return verified;
};
