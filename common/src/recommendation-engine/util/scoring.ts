import type { PlaceRecommendationItem, UserInput } from "../contracts/index.js";
import { countBy } from "./collection.js";
import { getNearestDistanceKm } from "./geo.js";
import { clampScore, logarithmicScore, roundScore } from "./math.js";
import { getTimeBufferScore } from "./schedule.js";
import type {
  RecommendationCandidate,
  RequiredEngineConfig,
  ScoredCandidate,
  ScoringWeights,
} from "./types.js";

export const DEFAULT_WEIGHTS: ScoringWeights = {
  inputMatch: 35,
  trust: 30,
  accessibility: 20,
  diversity: 15,
};

export const sumWeights = (weights: ScoringWeights): number =>
  weights.inputMatch +
  weights.trust +
  weights.accessibility +
  weights.diversity;

export const scoreCandidates = (
  candidates: RecommendationCandidate[],
  userInput: UserInput,
  config: RequiredEngineConfig,
): ScoredCandidate[] => {
  const categoryCounts = countBy(
    candidates,
    (candidate) => `${candidate.mainCategory}:${candidate.subCategory}`,
  );

  return candidates
    .map((candidate) => scoreCandidate(candidate, userInput, config, categoryCounts))
    .sort((a, b) => b.score - a.score)
    .slice(0, config.targetCount);
};

export const toRecommendationItem = ({
  candidate,
  score,
  reasons,
}: ScoredCandidate): PlaceRecommendationItem => {
  const { sourceRank, status, signals, ...recommendationItem } = candidate;
  void sourceRank;
  void status;
  void signals;

  return {
    ...recommendationItem,
    score,
    reasons,
  };
};

const scoreCandidate = (
  candidate: RecommendationCandidate,
  userInput: UserInput,
  config: RequiredEngineConfig,
  categoryCounts: Map<string, number>,
): ScoredCandidate => {
  const inputMatch = clampScore(
    candidate.signals?.inputMatchScore ??
      getInputMatchScore(candidate, userInput),
  );
  const trust = clampScore(
    candidate.signals?.trustScore ?? getTrustScore(candidate),
  );
  const accessibility = clampScore(
    candidate.signals?.accessibilityScore ??
      getAccessibilityScore(candidate, userInput, config),
  );
  const diversity = clampScore(
    candidate.signals?.diversityScore ??
      getDiversityScore(candidate, categoryCounts),
  );

  const scoreBreakdown = {
    inputMatch,
    trust,
    accessibility,
    diversity,
  };

  const weightedScore =
    (inputMatch * config.weights.inputMatch +
      trust * config.weights.trust +
      accessibility * config.weights.accessibility +
      diversity * config.weights.diversity) /
    100;

  return {
    candidate,
    score: roundScore(weightedScore),
    reasons: buildReasons(candidate, scoreBreakdown),
    scoreBreakdown,
  };
};

const getInputMatchScore = (
  candidate: RecommendationCandidate,
  userInput: UserInput,
): number => {
  const requestTokens = Array.from(
    tokenize(userInput.userNaturalLanguageRequest),
  );
  const candidateTokens = tokenize(
    [
      candidate.name,
      candidate.contentSummary,
      candidate.mainCategory,
      candidate.subCategory,
      ...candidate.tags,
    ].join(" "),
  );

  const keywordScore =
    requestTokens.length === 0
      ? 60
      : (requestTokens.filter((token) => candidateTokens.has(token)).length /
          requestTokens.length) *
        100;

  const budgetScore = getBudgetFitScore(
    candidate.priceRangePerPerson,
    userInput.budgetPerPerson,
  );
  const partyScore = getPartyTypeScore(candidate, userInput.partyType);

  return keywordScore * 0.55 + budgetScore * 0.3 + partyScore * 0.15;
};

const getTrustScore = (candidate: RecommendationCandidate): number => {
  // 1. 평점 데이터 취합 (실시간 수집 데이터 우선순위 적용)
  const ratings = [
    candidate.signals?.naverRating ?? candidate.rating, // 추가한 실시간 평점 사용
    candidate.signals?.kakaoRating,
  ].filter((rating): rating is number => typeof rating === "number");

  const ratingScore =
    ratings.length > 0
      ? (ratings.reduce((sum, rating) => sum + rating, 0) /
          ratings.length /
          5) *
        100
      : (candidate.score ?? 55);

  // 2. 리뷰 수 데이터 취합 (실시간 수집 데이터 우선순위 적용)
  const reviewCount = 
    candidate.signals?.reviewCount ?? 
    (candidate as any).visitorReviews ?? // 우리가 추가한 실시간 리뷰 수 사용
    0;

  const reviewScore = logarithmicScore(
    reviewCount,
    1000, // 1000개일 때 만점 근접
  );

  const mentionScore = logarithmicScore(
    candidate.signals?.mentionCount ?? 0,
    100,
  );
  
  const referenceScore = getReferenceScore(candidate);

  // 최종 신뢰도 점수 (평점 45% + 리뷰수 25% + 언급량 15% + 외부링크 15%)
  return (
    ratingScore * 0.45 +
    reviewScore * 0.25 +
    mentionScore * 0.15 +
    referenceScore * 0.15
  );
};

const getAccessibilityScore = (
  candidate: RecommendationCandidate,
  userInput: UserInput,
  config: RequiredEngineConfig,
): number => {
  const nearestDistanceKm = getNearestDistanceKm(
    userInput.location,
    candidate.location,
  );
  const distanceScore =
    nearestDistanceKm === null
      ? 70
      : Math.max(0, 100 - (nearestDistanceKm / config.maxDistanceKm) * 100);

  const timeBufferScore = getTimeBufferScore(candidate, userInput);

  return distanceScore * 0.7 + timeBufferScore * 0.3;
};

const getDiversityScore = (
  candidate: RecommendationCandidate,
  categoryCounts: Map<string, number>,
): number => {
  const categoryKey = `${candidate.mainCategory}:${candidate.subCategory}`;
  const sameCategoryCount = categoryCounts.get(categoryKey) ?? 1;
  return Math.max(40, 100 - (sameCategoryCount - 1) * 15);
};

const buildReasons = (
  candidate: RecommendationCandidate,
  scoreBreakdown: ScoringWeights,
): string[] => {
  if (candidate.reasons && candidate.reasons.length > 0) {
    return candidate.reasons;
  }

  const reasons: string[] = [];
  if (scoreBreakdown.inputMatch >= 70) {
    reasons.push("사용자 입력 조건과의 일치도가 높음");
  }
  if (scoreBreakdown.trust >= 70) {
    reasons.push("평점, 리뷰, 언급량 기준의 신뢰도가 높음");
  }
  if (scoreBreakdown.accessibility >= 70) {
    reasons.push("요청 위치와 시간 조건에서 접근성이 좋음");
  }
  if (scoreBreakdown.diversity >= 80) {
    reasons.push("상위 후보군 내에서 카테고리 다양성 확보에 유리함");
  }

  return reasons.length > 0
    ? reasons
    : [`${candidate.name} 후보의 종합 점수가 높음`];
};

const tokenize = (value: string): Set<string> =>
  new Set(
    value
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu)
      ?.filter((token) => token.length >= 2) ?? [],
  );

const getBudgetFitScore = (
  priceRange: readonly [number, number],
  budgetRange: readonly [number, number],
): number => {
  const [priceMin, priceMax] = priceRange;
  const [budgetMin, budgetMax] = budgetRange;

  if (priceMin > budgetMax) return 0;
  if (priceMax <= budgetMax && priceMin >= budgetMin) return 100;
  if (priceMax <= budgetMax) return 90;

  const overlapMin = Math.max(priceMin, budgetMin);
  const overlapMax = Math.min(priceMax, budgetMax);
  const overlap = Math.max(0, overlapMax - overlapMin);
  const priceWidth = Math.max(1, priceMax - priceMin);

  return (overlap / priceWidth) * 100;
};

const getPartyTypeScore = (
  candidate: RecommendationCandidate,
  partyType: UserInput["partyType"],
): number => {
  const text = [
    candidate.name,
    candidate.contentSummary,
    candidate.mainCategory,
    candidate.subCategory,
    ...candidate.tags,
  ].join(" ");

  const partyKeywords: Record<UserInput["partyType"], string[]> = {
    FAMILY: ["가족", "아이", "넓은", "편안"],
    FRIENDS: ["친구", "모임", "대화", "단체"],
    LOVERS: ["데이트", "분위기", "조용", "와인"],
    COLLEAGUES: ["회식", "비즈니스", "단체", "예약"],
  };

  return partyKeywords[partyType].some((keyword) => text.includes(keyword))
    ? 100
    : 60;
};

const getReferenceScore = (candidate: RecommendationCandidate): number => {
  let score = 70;
  if (candidate.referenceUrls.instagram) score += 10;
  if (
    candidate.referenceUrls.others &&
    candidate.referenceUrls.others.length > 0
  ) {
    score += 10;
  }
  return Math.min(100, score);
};
