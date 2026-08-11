import type { DayOfWeek, PlaceRecommendationItem } from "@monorepo/recommendation-engine/v1/contracts";

import type { PlaceKind, PlaceStayEstimate, StayRange } from "./contracts.js";

/**
 * 카테고리별 체류 시간 기본 범위(분).
 *
 * 매칭 대상은 `mainCategory`/`subCategory`/`tags` 같은 구조화된 값만 쓴다.
 * `contentSummary`(자유 서술)를 넣으면 "바질 페스토 파스타" 한 줄 때문에 식당이
 * 술집으로 분류된다. 같은 이유로 `바`처럼 다른 단어에 흔히 들어가는 한 글자는
 * 패턴에서 빼고 `와인바`/`칵테일바`처럼 복합어만 인정한다.
 */
const STAY_PROFILES: { kind: PlaceKind; pattern: RegExp; range: StayRange }[] = [
  {
    kind: "ACTIVITY",
    pattern: /(전시|미술관|박물관|공연|영화|체험|클래스|팝업|방탈출|볼링|당구)/u,
    range: { min: 60, typical: 90, max: 140 },
  },
  {
    kind: "BAR",
    pattern: /(술집|주점|포차|이자카야|호프|펍|와인바|칵테일바|위스키바|맥주집)/u,
    range: { min: 80, typical: 120, max: 180 },
  },
  {
    kind: "MEAL",
    pattern: /(식당|음식점|맛집|한식|중식|일식|양식|분식|고기|파스타|브런치|레스토랑|국밥|면요리)/u,
    range: { min: 50, typical: 70, max: 110 },
  },
  {
    kind: "CAFE",
    pattern: /(카페|커피|디저트|베이커리|빙수)/u,
    range: { min: 35, typical: 60, max: 100 },
  },
  {
    kind: "OUTDOOR",
    pattern: /(공원|산책|둘레길|하천|전망대)/u,
    range: { min: 25, typical: 45, max: 80 },
  },
  {
    kind: "SHOPPING",
    pattern: /(쇼핑|소품|편집샵|서점|시장|플리마켓)/u,
    range: { min: 20, typical: 40, max: 70 },
  },
];

const DEFAULT_RANGE: StayRange = { min: 40, typical: 60, max: 90 };

/**
 * 가격대 배율. 식당과 술집에만 적용한다.
 *
 * 인당 8천원 국밥집과 8만원 오마카세의 체류 시간은 명백히 다르다. 반면 카페나
 * 전시는 가격과 체류 시간의 상관이 약해서 적용하면 오히려 노이즈가 된다.
 */
const PRICE_MULTIPLIERS: { upToWon: number; multiplier: number }[] = [
  { upToWon: 15_000, multiplier: 0.85 },
  { upToWon: 40_000, multiplier: 1 },
  { upToWon: 80_000, multiplier: 1.25 },
  { upToWon: Number.POSITIVE_INFINITY, multiplier: 1.5 },
];

export const PACE_MULTIPLIERS = {
  RELAXED: 1.25,
  NORMAL: 1,
  PACKED: 0.8,
} as const;
export type PacePreference = keyof typeof PACE_MULTIPLIERS;

const MINUTES_PER_DAY = 24 * 60;

const toMinute = (time24h: string): number => {
  const [hourText = "0", minuteText = "0"] = time24h.split(":");
  return Number(hourText) * 60 + Number(minuteText);
};

const matchProfile = (text: string): (typeof STAY_PROFILES)[number] | undefined =>
  STAY_PROFILES.find((profile) => profile.pattern.test(text));

const clamp = (value: number, range: StayRange): number =>
  Math.max(range.min, Math.min(range.max, Math.round(value)));

const toPriceMultiplier = (priceRangePerPerson: readonly [number, number]): number => {
  const median = (priceRangePerPerson[0] + priceRangePerPerson[1]) / 2;
  return PRICE_MULTIPLIERS.find((tier) => median <= tier.upToWon)?.multiplier ?? 1;
};

/**
 * 라스트 오더와 마감 사이의 간격은 업장이 스스로 "주문 후 이만큼 걸린다"고 말하는
 * 값이다. 카테고리 평균보다 그 가게에 대해 훨씬 정확하다.
 */
const toLastOrderSignal = (
  place: PlaceRecommendationItem,
  dayOfWeek: DayOfWeek,
): number | undefined => {
  const daily = place.operationInfo.schedules[dayOfWeek];
  if (daily.status !== "OPEN" || daily.lastOrderTime === undefined) return undefined;

  const openMinute = toMinute(daily.open);
  const normalize = (value: number): number => (value <= openMinute ? value + MINUTES_PER_DAY : value);
  const gap = normalize(toMinute(daily.close)) - normalize(toMinute(daily.lastOrderTime));

  return gap > 0 ? gap : undefined;
};

export type DeterministicStayOptions = {
  dayOfWeek: DayOfWeek;
  numberOfPeople: number;
  largeGroupThreshold: number;
  largeGroupExtraStayMinutes: number;
  pace: PacePreference;
};

/**
 * LLM 없이 계산하는 체류 시간 추정.
 *
 * 신뢰도 순서대로 덮어쓴다: 카테고리 기본값 -> 가격대 배율 -> 라스트오더 신호.
 * 마지막에 인원수 가산과 페이스 배율을 적용하고 범위 안으로 clamp한다.
 */
export const estimateStayDeterministically = (
  place: PlaceRecommendationItem,
  options: DeterministicStayOptions,
): PlaceStayEstimate => {
  const profile =
    matchProfile(`${place.mainCategory} ${place.subCategory}`) ?? matchProfile(place.tags.join(" "));
  const kind = profile?.kind ?? "OTHER";
  const baseRange = profile?.range ?? DEFAULT_RANGE;

  let typical = baseRange.typical;
  let source: PlaceStayEstimate["source"] = "CATEGORY";

  // 가격은 앉아서 주문하는 곳에서만 체류 시간과 상관이 있다.
  const isSeatedOrder = kind === "MEAL" || kind === "BAR";
  if (isSeatedOrder) {
    const multiplier = toPriceMultiplier(place.priceRangePerPerson);
    if (multiplier !== 1) {
      typical = typical * multiplier;
      source = "PRICE";
    }
  }

  // 업장 자체 신호가 있으면 가격 추정보다 우선한다.
  const lastOrderGap = toLastOrderSignal(place, options.dayOfWeek);
  if (lastOrderGap !== undefined) {
    typical = lastOrderGap;
    source = "LAST_ORDER";
  }

  const groupExtra =
    isSeatedOrder && options.numberOfPeople >= options.largeGroupThreshold
      ? options.largeGroupExtraStayMinutes
      : 0;
  const paceMultiplier = PACE_MULTIPLIERS[options.pace];

  // 페이스는 범위 전체를 함께 움직인다. 여유롭게 요청하면 상한도 같이 올라가야
  // 코스 확정 후 재분배에서 실제로 더 머물 수 있다.
  const scaledRange: StayRange = {
    min: Math.max(10, Math.round(baseRange.min * paceMultiplier)),
    typical: baseRange.typical,
    max: Math.round(baseRange.max * paceMultiplier) + groupExtra,
  };

  return {
    kind,
    range: {
      ...scaledRange,
      typical: clamp(typical * paceMultiplier + groupExtra, scaledRange),
    },
    source,
  };
};

/** LLM이 돌려준 값을 카테고리 범위 안으로 강제한다. 범위 밖 응답은 잘라낸다. */
export const withLlmTypical = (
  estimate: PlaceStayEstimate,
  typicalStayMinutes: number,
): PlaceStayEstimate => ({
  ...estimate,
  range: { ...estimate.range, typical: clamp(typicalStayMinutes, estimate.range) },
  source: "LLM",
});
