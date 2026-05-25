import type { CandidateScoringEvidence } from "./evidence.js";

type PriceRange = [number, number];

const MIN_MEANINGFUL_PRICE = 3_000;
const MAX_MEANINGFUL_PRICE = 100_000;

export const inferPriceRangePerPersonFromText = (
  text: string | undefined,
  category?: CandidateScoringEvidence["category"],
): PriceRange | undefined => {
  if (!text) return undefined;
  // 메뉴판 텍스트에는 주먹밥/음료 같은 부가 메뉴가 섞인다.
  // category별 최소 의미 가격을 두어 대표 식사 가격 범위를 더 보수적으로 추정한다.
  const minMeaningfulPrice = category
    ? getMinimumMeaningfulPrice(category)
    : MIN_MEANINGFUL_PRICE;

  const prices = [
    ...extractWonPrices(text),
    ...extractManwonPrices(text),
  ]
    .filter(
      (price) =>
        price >= minMeaningfulPrice && price <= MAX_MEANINGFUL_PRICE,
    )
    .sort((a, b) => a - b);

  const uniquePrices = Array.from(new Set(prices));
  if (uniquePrices.length === 0) return undefined;
  const minPrice = uniquePrices[0];
  if (minPrice === undefined) return undefined;
  if (uniquePrices.length === 1) {
    return [minPrice, minPrice];
  }
  const maxPrice = uniquePrices.at(-1);
  if (maxPrice === undefined) return undefined;

  return [minPrice, maxPrice];
};

// 실제 source에서 가격을 찾은 경우만 우선한다.
// 없으면 user budget을 echo하지 않고 category fallback을 사용한다.
export const getRecommendationPriceRange = (
  evidence: CandidateScoringEvidence,
): PriceRange =>
  evidence.placeInfo.priceRangePerPerson ??
  estimatePriceRangeFromCategory(evidence.category);

const estimatePriceRangeFromCategory = ({
  mainCategory,
  subCategory,
  tags,
}: CandidateScoringEvidence["category"]): PriceRange => {
  const text = [mainCategory, subCategory, ...tags].join(" ");
  if (/(곱창|막창|대창|고깃집|갈비|구이)/u.test(text)) return [18_000, 35_000];
  if (/(파스타|이탈리안|양식|스테이크)/u.test(text)) return [20_000, 50_000];
  if (/(카페|커피|디저트|베이커리)/u.test(text)) return [5_000, 15_000];
  if (/(주점|술집|포차|이자카야|바|호프)/u.test(text)) return [15_000, 35_000];
  if (/(분식|김밥|떡볶이|국수|냉면)/u.test(text)) return [7_000, 15_000];
  return [10_000, 30_000];
};

const getMinimumMeaningfulPrice = (
  category: CandidateScoringEvidence["category"],
): number => {
  const text = [category.mainCategory, category.subCategory, ...category.tags].join(
    " ",
  );
  if (/(곱창|막창|대창|고깃집|갈비|구이|파스타|이탈리안|양식|스테이크)/u.test(text)) {
    return 10_000;
  }
  if (/(카페|커피|디저트|베이커리)/u.test(text)) return 4_000;
  return MIN_MEANINGFUL_PRICE;
};

const extractWonPrices = (text: string): number[] =>
  [...text.matchAll(/(?<price>\d{1,3}(?:,\d{3})+|\d{4,6})\s*원/gu)]
    .map((match) => match.groups?.price)
    .filter((value): value is string => Boolean(value))
    .map((value) => Number(value.replace(/,/gu, "")));

const extractManwonPrices = (text: string): number[] =>
  [...text.matchAll(/(?<price>\d+(?:\.\d+)?)\s*만\s*원/gu)]
    .map((match) => match.groups?.price)
    .filter((value): value is string => Boolean(value))
    .map((value) => Math.round(Number(value) * 10_000));
