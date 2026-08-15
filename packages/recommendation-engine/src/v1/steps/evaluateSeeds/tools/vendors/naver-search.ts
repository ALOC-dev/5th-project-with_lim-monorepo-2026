import ky from "ky";

import { parseOperationInfoWithLlmFallback } from "../../llm/operation-info.js";
import { unique } from "../../utils/enrichment-merge.js";
import type {
  BeerVenueClaim,
  CandidateEnrichment,
  DietaryClaim,
  DietaryConstraint,
  VerifiedPriceClaim,
} from "../../utils/enrichment-types.js";
import type { CandidateScoringEvidence } from "../../utils/evidence.js";
import { type OperationVerifier, stripSearchMarkup } from "../../utils/operation-hours.js";
import { inferPriceRangePerPersonFromText } from "../../utils/price.js";
import { isUsableEvidenceUrl } from "../../utils/source-url.js";
import { DEFAULT_EXTERNAL_API_TIMEOUT_MS, NAVER_SEARCH_API_BASE_URL } from "../shared/constants.js";
import { buildPlaceLookupQuery, scoreTextMatch } from "../shared/place-match.js";
import { normalizeComparableText } from "../shared/text.js";
import type { NaverSearchCredentials } from "../types.js";
import {
  type NaverSearchItem,
  type NaverSearchResponse,
  NaverSearchResponseSchema,
} from "./naver-search.contracts.js";

const MIN_NAVER_SEARCH_IDENTITY_SCORE = 0.75;
const MIN_BEER_VENUE_CLAIM_ADDRESS_SCORE = 0.8;
const MIN_VERIFIED_PRICE_CLAIM_ADDRESS_SCORE = 0.8;
const MIN_VERIFIED_MENU_PRICE = 1_000;
const MAX_VERIFIED_MENU_PRICE = 1_000_000;

type IdentityMatchedNaverSearchItem = {
  item: NaverSearchItem;
  identityMatchScore: number;
};

type DietaryClaimRule = {
  constraint: DietaryConstraint;
  positivePattern: RegExp;
  negatedPattern: RegExp;
};

// `rawTextSnippet`은 여러 검색 결과를 합친 운영시간 parser용 원문이다. 식이
// 검증에는 절대 사용하지 않고, 아래처럼 후보 상호가 같은 개별 result에서만 claim을
// 만든다. 예를 들어 "근처 비건 식당"이라는 다른 장소의 문구가 Ankara를 통과시키면
// 안 된다.
const DIETARY_CLAIM_RULES: readonly DietaryClaimRule[] = [
  {
    constraint: "VEGAN",
    positivePattern: /비건|vegan|plant\s*-?\s*based|플랜트\s*-?\s*베이스드/giu,
    negatedPattern:
      /(?:비건|vegan|plant\s*-?\s*based|플랜트\s*-?\s*베이스드)\s*(?:은|는|이|가)?\s*(?:아닌|아님|아닐|아닙(?:니다)?|아니(?:에요|다)?|불가|없(?:음|다)?|not|no)(?=\s|$|[.,!?。])|(?:not|non)\s*-?\s*(?:비건|vegan|plant\s*-?\s*based)/iu,
  },
  {
    constraint: "VEGETARIAN",
    positivePattern: /채식|vegetarian/giu,
    negatedPattern:
      /(?:채식|vegetarian)\s*(?:은|는|이|가)?\s*(?:아닌|아님|아닐|아닙(?:니다)?|아니(?:에요|다)?|불가|없(?:음|다)?|not|no)(?=\s|$|[.,!?。])|(?:not|non)\s*-?\s*(?:채식|vegetarian)/iu,
  },
  {
    constraint: "HALAL",
    positivePattern: /할랄|halal/giu,
    negatedPattern:
      /(?:할랄|halal)\s*(?:은|는|이|가)?\s*(?:아닌|아님|아닐|아닙(?:니다)?|아니(?:에요|다)?|불가|없(?:음|다)?|not|no)(?=\s|$|[.,!?。])|(?:not|non)\s*-?\s*(?:할랄|halal)/iu,
  },
];

const BEER_VENUE_POSITIVE_PATTERN =
  /맥주|호프|펍|브루잉|\b(?:beer|pub|brewery)\b/giu;
const BEER_VENUE_NEGATED_PATTERN =
  /(?:맥주|호프|펍|브루잉|\b(?:beer|pub|brewery)\b)(?:은|는|이|가|을|를)?\s*(?:(?:판매|취급|제공)\s*(?:하지|안)|아닌|아님|아닐|아닙(?:니다)?|아니(?:에요|다)?|불가|없(?:음|다)?|not|no)(?=\s|$|[.,!?。])|(?:not|non)\s*-?\s*(?:맥주|호프|펍|브루잉|beer|pub|brewery)/iu;
const PRICE_WITH_WON_PATTERN =
  /(?<price>\d{1,3}(?:,\d{3})+|\d{4,6})\s*원/gu;
const PRICE_WITH_MANWON_PATTERN = /(?<price>\d+(?:\.\d+)?)\s*만\s*원/gu;
const PRICE_WITH_KRW_PATTERN =
  /(?:\bkrw|₩)\s*(?<price>\d{1,3}(?:,\d{3})+|\d{4,6})\b/giu;
const MENU_PRICE_CONTEXT_PATTERN = /메뉴|가격(?:대)?|price|\bkrw\b|₩/iu;
const BARE_MENU_PRICE_PATTERN = /\b(?<price>\d{1,3}(?:,\d{3})+)\b/gu;
const PRICE_TITLE_PROFILE_LABELS = new Set([
  "메뉴",
  "가격",
  "가격대",
  "예약",
  "정보",
  "프로필",
  "menu",
  "price",
  "booking",
  "book",
  "profile",
  "information",
]);
const PRICE_TITLE_ADMINISTRATIVE_TOKEN_PATTERN =
  /^(?:서울|부산|대구|인천|광주|대전|울산|세종|제주|[가-힣]+(?:특별시|광역시|특별자치시|특별자치도|시|군|구|동|읍|면))$/u;
const ROAD_ADDRESS_BUILDING_PATTERN =
  /([\p{Letter}\p{Number}-]+(?:대로|로|길|거리)(?:\s*\d+(?:-\d+)?(?:번)?길)?)\s*(\d+(?:-\d+)?)(?=\s|$|[,.()，]|번지|층|호|에서|에(?:\s|$|[,.()，])|의(?:\s|$|[,.()，]))/gu;

type RoadAddressBuilding = {
  road: string;
  buildingNumber: string;
};

// Naver snippets commonly abbreviate the first-level administrative area
// (e.g. `서울` for a seed's `서울특별시`). Canonicalize only those well-known
// administrative aliases before the strict full road-address comparison; the
// parsed road + building number below remains an exact match.
const ADMINISTRATIVE_ADDRESS_ALIASES: ReadonlyArray<readonly [string, string]> = [
  ["서울특별시", "서울"],
  ["부산광역시", "부산"],
  ["대구광역시", "대구"],
  ["인천광역시", "인천"],
  ["광주광역시", "광주"],
  ["대전광역시", "대전"],
  ["울산광역시", "울산"],
  ["세종특별자치시", "세종"],
  ["제주특별자치도", "제주"],
];

export const enrichWithNaverSearch = async (
  evidence: CandidateScoringEvidence,
  operationVerifier: OperationVerifier,
  credentials: NaverSearchCredentials,
): Promise<CandidateEnrichment> => {
  const query = `${buildPlaceLookupQuery(evidence)} 영업시간`;
  const [blog, web] = await Promise.all([
    searchNaver("blog", query, credentials),
    searchNaver("webkr", query, credentials),
  ]);
  const allItems = [...blog.items, ...web.items];
  const matchedItems = allItems
    .map((item) => ({
      item,
      identityMatchScore: scoreNaverSearchItem(item, evidence),
    }))
    .filter((match) => match.identityMatchScore >= 0.35)
    .sort((a, b) => b.identityMatchScore - a.identityMatchScore);
  const itemsForEvidence = matchedItems
    .filter((match) => match.identityMatchScore >= MIN_NAVER_SEARCH_IDENTITY_SCORE);
  const sourceUrls = unique(
    itemsForEvidence
      .map(({ item }) => item.link)
      .filter((link): link is string => Boolean(link) && isUsableEvidenceUrl(link)),
  );
  const text = itemsForEvidence
    .map(({ item }) => [item.title, item.description].map(stripSearchMarkup).join("\n"))
    .join("\n");
  const operationParse = await parseOperationInfoWithLlmFallback({
    text,
    openAiApiKey: credentials.openAiApiKey,
    evidence,
    operationVerifier,
    sourceName: "naver-search",
    sourceTextKind: "snippet",
    logger: credentials.logger,
  });
  const operationInfo = operationParse.operationInfo;
  const operationVerification = operationInfo
    ? operationVerifier.verify(operationInfo, sourceUrls)
    : operationVerifier.unknown({
        reason: matchedItems.length
          ? operationParse.reason
          : "Naver Search returned no identity-matching snippets",
        sourceUrls,
        confidence: sourceUrls.length > 0 ? 0.2 : 0,
      });
  const bestIdentityScore = matchedItems[0]?.identityMatchScore ?? 0;
  const dietaryClaims = extractDietaryClaimsFromNaverSearchItems(itemsForEvidence, evidence);
  const beerVenueClaims = extractBeerVenueClaimsFromNaverSearchItems(itemsForEvidence, evidence);
  const verifiedPriceClaims = extractVerifiedPriceClaimsFromNaverSearchItems(
    itemsForEvidence,
    evidence,
  );

  return {
    candidateId: evidence.candidateId,
    source: "naver-search",
    sourceUrls,
    operationInfo,
    operationVerification,
    trustSignals: {
      naverBlogReviewCount: blog.total,
      webMentionCount: itemsForEvidence.length,
      sourceAgreementCount: sourceUrls.length > 0 ? 1 : 0,
      placeMatchScore: bestIdentityScore,
    },
    priceRangePerPerson: inferPriceRangePerPersonFromText(text, evidence.category),
    rawTextSnippet: text.slice(0, 2_000),
    ...(dietaryClaims.length > 0 ? { dietaryClaims } : {}),
    ...(beerVenueClaims.length > 0 ? { beerVenueClaims } : {}),
    ...(verifiedPriceClaims.length > 0 ? { verifiedPriceClaims } : {}),
    sourceDetails: [
      {
        source: "naver-search",
        status: operationVerification.status,
        reason: operationVerification.reason,
        sourceUrls,
        confidence: operationVerification.confidence,
        identityMatchScore: bestIdentityScore,
        operationParser: operationParse.parser,
        operationParseReason: operationParse.reason,
        sourceTextKind: "snippet",
        rawTextSnippet: text.slice(0, 700),
      },
    ],
  };
};

/**
 * Extract only identity-backed dietary claims from individual Naver results.
 *
 * A full aggregated `rawTextSnippet` can include neighbouring venues and review
 * copy. Requiring both the existing 0.75 identity threshold and a candidate-name
 * match within the same title/description keeps the claim attached to this
 * candidate rather than to a nearby restaurant mentioned in a snippet.
 */
export const extractDietaryClaimsFromNaverSearchItems = (
  items: readonly IdentityMatchedNaverSearchItem[],
  evidence: CandidateScoringEvidence,
): DietaryClaim[] => {
  const claims = items.flatMap(({ item, identityMatchScore }) => {
    if (identityMatchScore < MIN_NAVER_SEARCH_IDENTITY_SCORE) return [];
    if (!item.link || !isUsableEvidenceUrl(item.link)) return [];

    const title = stripSearchMarkup(item.title);
    const description = stripSearchMarkup(item.description);
    if (!hasCandidateNameMatch(title, description, evidence.name)) return [];

    const itemText = `${title}\n${description}`;
    return DIETARY_CLAIM_RULES.flatMap((rule) => {
      if (rule.negatedPattern.test(itemText)) return [];
      const matchedTerms = unique(
        Array.from(itemText.matchAll(rule.positivePattern)).map((match) => match[0]?.trim() ?? ""),
      );
      if (matchedTerms.length === 0) return [];

      return [
        {
          constraint: rule.constraint,
          source: "naver-search" as const,
          sourceUrl: item.link,
          identityMatchScore,
          matchedTerms,
        },
      ];
    });
  });

  return uniqueDietaryClaims(claims);
};

/**
 * A beer/pub claim is deliberately stricter than a keyword in an enrichment
 * summary: it must originate in one usable Naver Search item whose own
 * title identifies the candidate and independently matches its address. This
 * prevents same-name branches, nearby venues, generic listicles, or a bare map
 * URL from making a wine/bar venue satisfy an explicit beer/pub request. Naver
 * Search items have no verified entity coordinates, so this path deliberately
 * does not infer a proximity fallback from unstructured snippet text.
 */
export const extractBeerVenueClaimsFromNaverSearchItems = (
  items: readonly IdentityMatchedNaverSearchItem[],
  evidence: CandidateScoringEvidence,
): BeerVenueClaim[] => {
  const claims = items.flatMap(({ item, identityMatchScore }) => {
    if (identityMatchScore < MIN_NAVER_SEARCH_IDENTITY_SCORE) return [];
    if (!item.link || !isUsableEvidenceUrl(item.link)) return [];

    const title = stripSearchMarkup(item.title);
    const description = stripSearchMarkup(item.description);
    if (!hasCandidateTitleMatch(title, evidence.name)) return [];
    const addressMatchScore = scoreBeerVenueClaimAddress(title, description, evidence);
    if (addressMatchScore < MIN_BEER_VENUE_CLAIM_ADDRESS_SCORE) return [];
    const exactRoadAddressMatch = hasExactRoadAddressMatch(
      evidence.placeInfo.roadAddress,
      `${title}\n${description}`,
    );
    // scoreTextMatch tokenizes away one-character building numbers. If both
    // sides expose a road building number, only an exact normalized road+number
    // match may promote the beer claim; `을지로 1` must not match `을지로 4`.
    if (exactRoadAddressMatch === false) return [];

    const itemText = `${title}\n${description}`;
    if (BEER_VENUE_NEGATED_PATTERN.test(itemText)) return [];
    const matchedTerms = getDirectCandidateTitleBeerTerms(title, evidence.name);
    if (matchedTerms.length === 0) return [];

    return [
      {
        source: "naver-search" as const,
        sourceUrl: item.link,
        identityMatchScore,
        addressMatchScore,
        matchedTerms,
      },
    ];
  });

  return uniqueBeerVenueClaims(claims);
};

/**
 * Preserve a price floor only when it is attached to one identity- and
 * address-qualified Naver Search result. `rawTextSnippet` deliberately joins
 * many results for operation-hour parsing, so reading a price from that merged
 * text could attach a neighbouring venue's menu to this candidate.
 *
 * This is provenance for an explicit budget hard gate, not a replacement for
 * the display price range. Unknown prices, category fallbacks, and unqualified
 * source text must remain unable to reject a candidate.
 */
export const extractVerifiedPriceClaimsFromNaverSearchItems = (
  items: readonly IdentityMatchedNaverSearchItem[],
  evidence: CandidateScoringEvidence,
): VerifiedPriceClaim[] => {
  const claims = items.flatMap(({ item, identityMatchScore }) => {
    if (identityMatchScore < MIN_NAVER_SEARCH_IDENTITY_SCORE) return [];
    if (!item.link || !isUsableEvidenceUrl(item.link)) return [];

    const title = stripSearchMarkup(item.title);
    const description = stripSearchMarkup(item.description);
    if (!hasCandidateBoundPriceTitle(title, evidence)) return [];

    const itemText = `${title}\n${description}`;
    const addressMatchScore = scoreVerifiedPriceClaimAddress(title, description, evidence);
    if (addressMatchScore < MIN_VERIFIED_PRICE_CLAIM_ADDRESS_SCORE) return [];
    // A partial seed address (for example just a road name) is still useful
    // when the individual source names that same road. But when both sides
    // expose a building number, a different number is a known branch conflict,
    // never price evidence for this candidate.
    if (hasConflictingRoadAddressBuilding(evidence.placeInfo.roadAddress, itemText)) return [];

    const minimumPrice = extractCandidateBoundMenuPrices(title, description, evidence)[0];
    if (minimumPrice === undefined) return [];

    return [
      {
        source: "naver-search" as const,
        sourceUrl: item.link,
        identityMatchScore,
        addressMatchScore,
        minimumPrice,
      },
    ];
  });

  return uniqueVerifiedPriceClaims(claims);
};

const hasCandidateNameMatch = (title: string, description: string, candidateName: string): boolean =>
  Math.max(scoreTextMatch(title, candidateName), scoreTextMatch(description, candidateName)) >=
  MIN_NAVER_SEARCH_IDENTITY_SCORE;

const hasCandidateTitleMatch = (title: string, candidateName: string): boolean =>
  scoreTextMatch(title, candidateName) >= MIN_NAVER_SEARCH_IDENTITY_SCORE;

/**
 * Price claims need a stronger binding than a candidate-name substring in a
 * description. A Naver result can discuss several nearby venues, so the title
 * itself must start with the candidate's full name and then contain only a
 * known profile/menu/price/booking/category or administrative-location shape.
 * This deliberately rejects arbitrary suffixes such as `후보명 가까운 맛집`.
 */
const hasCandidateBoundPriceTitle = (
  title: string,
  evidence: CandidateScoringEvidence,
): boolean => {
  const candidatePattern = toFlexibleLiteralPattern(evidence.name);
  if (!candidatePattern) return false;
  const candidatePrefix = new RegExp(
    String.raw`^\s*${candidatePattern}(?=\s|$|[-|:·/,])`,
    "iu",
  ).exec(title);
  if (!candidatePrefix) return false;

  const suffixFragments = title
    .slice(candidatePrefix[0].length)
    .split(/[|:·/]/u)
    .map((fragment) => fragment.replace(/^\s*[-,;]\s*/u, "").trim())
    .filter(Boolean);
  if (suffixFragments.length === 0) return true;

  return suffixFragments.every((fragment) =>
    isCandidatePriceTitleProfileOrLocation(fragment, evidence),
  );
};

const isCandidatePriceTitleProfileOrLocation = (
  fragment: string,
  evidence: CandidateScoringEvidence,
): boolean => {
  const normalizedFragment = normalizeComparableText(fragment);
  if (PRICE_TITLE_PROFILE_LABELS.has(normalizedFragment)) return true;

  const categoryLabels = [
    evidence.category.mainCategory,
    evidence.category.subCategory,
    ...evidence.category.tags,
  ].map(normalizeComparableText);
  if (categoryLabels.includes(normalizedFragment)) return true;

  return fragment
    .split(/\s*,\s*/u)
    .filter(Boolean)
    .every((token) => PRICE_TITLE_ADMINISTRATIVE_TOKEN_PATTERN.test(token.trim()));
};

/**
 * Naver Search descriptions mix nearby venues, itinerary language, and review
 * copy. Do not try to infer a candidate-bound beer predicate from that free
 * text. A claim may come only from an anchored direct title in the shape
 * `candidate + beer-category`, while the independent identity/address checks
 * in the caller remain mandatory. This makes spatial, list, and all
 * description-only language fail closed without a brittle keyword blacklist.
 */
const getDirectCandidateTitleBeerTerms = (title: string, candidateName: string): string[] => {
  const candidatePattern = toFlexibleLiteralPattern(candidateName);
  if (!candidatePattern) return [];
  const directTitlePattern = new RegExp(
    String.raw`^${candidatePattern}\s*(?:[-|:·/]\s*)?(?:(?:수제|크래프트|생|craft|draft)\s*)?(?:${BEER_VENUE_POSITIVE_PATTERN.source})(?:\s*(?:${BEER_VENUE_POSITIVE_PATTERN.source}|펍|바|전문점|브루어리|컴퍼니|company))*\s*$`,
    "iu",
  );
  if (!directTitlePattern.test(title)) return [];
  return Array.from(title.matchAll(BEER_VENUE_POSITIVE_PATTERN)).map(
    (match) => match[0]?.trim() ?? "",
  );
};

const toFlexibleLiteralPattern = (value: string): string =>
  escapeRegExp(value.trim()).replace(/\s+/gu, String.raw`\s+`);

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);

const hasExactRoadAddressMatch = (
  candidateRoadAddress: string,
  itemText: string,
): boolean | undefined => {
  const candidateBuildings = extractRoadAddressBuildings(candidateRoadAddress);
  const itemBuildings = extractRoadAddressBuildings(itemText);
  // A Naver snippet with a concrete building number cannot prove a partial
  // TMap seed such as just `을지로`: generic text matching would otherwise
  // turn any branch on that road into a beer venue claim. There is no verified
  // alternate entity address in this source, so leave such candidates to the
  // structured category/name path instead.
  if (itemBuildings.length > 0 && candidateBuildings.length === 0) return false;
  if (candidateBuildings.length === 0 || itemBuildings.length === 0) return undefined;

  // The item may append a unit/floor or branch label, so require the normalized
  // candidate road address to be contained in the item text, then compare the
  // parsed road and building tokens exactly. This keeps `1층`/`1호` valid but
  // rejects `1-1` and `10` for a candidate at building `1`.
  const normalizedCandidate = normalizeRoadAddressForContainment(candidateRoadAddress);
  const normalizedItem = normalizeRoadAddressForContainment(itemText);
  if (!normalizedCandidate || !normalizedItem.includes(normalizedCandidate)) return false;

  return candidateBuildings.some((candidate) =>
    itemBuildings.some(
      (item) =>
        item.road === candidate.road && item.buildingNumber === candidate.buildingNumber,
    ),
  );
};

const hasConflictingRoadAddressBuilding = (
  candidateRoadAddress: string,
  itemText: string,
): boolean => {
  const candidateBuildings = extractRoadAddressBuildings(candidateRoadAddress);
  const itemBuildings = extractRoadAddressBuildings(itemText);
  if (candidateBuildings.length === 0 || itemBuildings.length === 0) return false;

  // One exact address must not hide another branch in the same item. A mixed
  // listing is ambiguous for a hard budget rejection, so any road+building
  // pair that is not the seed's exact pair fails closed.
  return itemBuildings.some(
    (item) =>
      !candidateBuildings.some(
        (candidate) =>
          item.road === candidate.road && item.buildingNumber === candidate.buildingNumber,
      ),
  );
};

const extractRoadAddressBuildings = (value: string): RoadAddressBuilding[] =>
  Array.from(
    value.matchAll(
      new RegExp(ROAD_ADDRESS_BUILDING_PATTERN.source, ROAD_ADDRESS_BUILDING_PATTERN.flags),
    ),
  ).flatMap((match) => {
    const road = match[1] ? normalizeComparableText(match[1]) : "";
    const buildingNumber = match[2] ? normalizeBuildingNumber(match[2]) : "";
    return road && buildingNumber ? [{ road, buildingNumber }] : [];
  });

const normalizeBuildingNumber = (value: string): string =>
  value
    .split("-")
    .map((part) => String(Number.parseInt(part, 10)))
    .join("-");

const normalizeRoadAddressForContainment = (value: string): string =>
  normalizeAdministrativeAddress(value)
    .replace(/[^\p{Letter}\p{Number}-]+/gu, "");

const normalizeAdministrativeAddress = (value: string): string =>
  ADMINISTRATIVE_ADDRESS_ALIASES.reduce(
    (normalized, [alias, canonical]) => normalized.replaceAll(alias, canonical),
    stripSearchMarkup(value).toLowerCase(),
  );

const uniqueDietaryClaims = (claims: DietaryClaim[]): DietaryClaim[] => {
  const seen = new Set<string>();
  return claims.filter((claim) => {
    const key = [
      claim.constraint,
      claim.source,
      claim.sourceUrl,
      claim.identityMatchScore,
      ...claim.matchedTerms,
    ].join("\u0000");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const uniqueBeerVenueClaims = (claims: BeerVenueClaim[]): BeerVenueClaim[] => {
  const seen = new Set<string>();
  return claims.filter((claim) => {
    const key = [
      claim.source,
      claim.sourceUrl,
      claim.identityMatchScore,
      claim.addressMatchScore,
      ...claim.matchedTerms,
    ].join("\u0000");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const uniqueVerifiedPriceClaims = (claims: VerifiedPriceClaim[]): VerifiedPriceClaim[] => {
  const seen = new Set<string>();
  return claims.filter((claim) => {
    const key = [
      claim.source,
      claim.sourceUrl,
      claim.identityMatchScore,
      claim.addressMatchScore,
      claim.minimumPrice,
    ].join("\u0000");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const extractCandidateBoundMenuPrices = (
  title: string,
  description: string,
  evidence: CandidateScoringEvidence,
): number[] => {
  const titlePrices = extractMenuPriceAmounts(title);
  // A title can identify the profile, but it cannot make an arbitrary
  // description price belong to that profile. Require the individual
  // structured field to begin at a neutral description boundary, repeat the
  // candidate name, and put the first price directly after its menu/price
  // label. This intentionally declines prose such as `근처 후보명 메뉴: ...`,
  // `메뉴: 타 식당 20,000원`, or `메뉴: 새 식당 20,000원`.
  const descriptionPrices = extractDirectCandidateStructuredPriceFields(
    description,
    evidence.name,
  ).flatMap(extractMenuPriceAmounts);

  return Array.from(new Set([...titlePrices, ...descriptionPrices]))
    .filter(
      (price) =>
        Number.isFinite(price) &&
        price >= MIN_VERIFIED_MENU_PRICE &&
        price <= MAX_VERIFIED_MENU_PRICE,
    )
    .sort((left, right) => left - right);
};

const extractDirectCandidateStructuredPriceFields = (
  description: string,
  candidateName: string,
): string[] => {
  const candidatePattern = toFlexibleLiteralPattern(candidateName);
  if (!candidatePattern) return [];

  const priceToken = String.raw`(?:\d{1,3}(?:,\d{3})+|\d{4,6})\s*원?|\d+(?:\.\d+)?\s*만\s*원`;
  const directFieldPattern = new RegExp(
    String.raw`(?:^|[\n.。])\s*${candidatePattern}\s*(?:의\s*)?(?:메뉴|가격(?:대)?|price)\s*[:：;=]\s*(?:(?:\bkrw|₩)\s*)?${priceToken}(?=$|[\n.。])`,
    "giu",
  );
  return Array.from(description.matchAll(directFieldPattern)).map((match) => match[0] ?? "");
};

const extractMenuPriceAmounts = (text: string): number[] => {
  const directPrices = [
    ...extractPrices(text, PRICE_WITH_WON_PATTERN),
    ...extractManwonPrices(text),
    ...extractPrices(text, PRICE_WITH_KRW_PATTERN),
  ];
  // Some current-menu snippets omit `원` after each comma-separated price
  // (`메뉴; 국수: 7,000, 덮밥: 15,000`). Only parse that shorthand inside a
  // line that explicitly identifies itself as menu/price context; bare dates
  // and street/phone numbers never enter here. The caller has already bound
  // this text to a direct candidate title/context.
  const menuContextPrices = text
    .split(/\r?\n/gu)
    .filter((line) => MENU_PRICE_CONTEXT_PATTERN.test(line))
    .flatMap((line) => extractPrices(line, BARE_MENU_PRICE_PATTERN));

  return Array.from(new Set([...directPrices, ...menuContextPrices]));
};

const extractPrices = (text: string, pattern: RegExp): number[] =>
  Array.from(text.matchAll(new RegExp(pattern.source, pattern.flags))).flatMap((match) => {
    const rawPrice = match.groups?.price;
    if (!rawPrice) return [];
    const price = Number(rawPrice.replace(/,/gu, ""));
    return Number.isFinite(price) ? [price] : [];
  });

const extractManwonPrices = (text: string): number[] =>
  Array.from(
    text.matchAll(new RegExp(PRICE_WITH_MANWON_PATTERN.source, PRICE_WITH_MANWON_PATTERN.flags)),
  ).flatMap((match) => {
    const rawPrice = match.groups?.price;
    if (!rawPrice) return [];
    const price = Math.round(Number(rawPrice) * 10_000);
    return Number.isFinite(price) ? [price] : [];
  });

const scoreNaverSearchItem = (
  item: NaverSearchItem,
  evidence: CandidateScoringEvidence,
): number => {
  const text = [item.title, item.description].map(stripSearchMarkup).join(" ");
  const nameScore = scoreTextMatch(text, evidence.name);
  const addressScore = scoreNaverSearchItemAddress(item.title, item.description, evidence);
  return Math.max(nameScore, nameScore * 0.75 + addressScore * 0.25);
};

const scoreNaverSearchItemAddress = (
  title: string,
  description: string,
  evidence: CandidateScoringEvidence,
): number => {
  const text = [title, description].map(stripSearchMarkup).join(" ");
  return Math.max(
    scoreTextMatch(text, evidence.placeInfo.roadAddress),
    scoreTextMatch(text, evidence.placeInfo.address),
  );
};

const scoreBeerVenueClaimAddress = (
  title: string,
  description: string,
  evidence: CandidateScoringEvidence,
): number => {
  const text = normalizeAdministrativeAddress([title, description].join(" "));
  return Math.max(
    scoreTextMatch(text, normalizeAdministrativeAddress(evidence.placeInfo.roadAddress)),
    scoreTextMatch(text, normalizeAdministrativeAddress(evidence.placeInfo.address)),
  );
};

/**
 * TMap sometimes supplies only a road name and a dong-level address. A Naver
 * result whose own title exactly names that candidate and independently names
 * the same city/district is still address-qualified, even if it omits the
 * road building number. This deliberately narrower relaxation is only for
 * menu-price provenance; beer claims keep their stricter detailed-address
 * policy because a same-name branch would otherwise satisfy an explicit pub
 * constraint.
 */
const scoreVerifiedPriceClaimAddress = (
  title: string,
  description: string,
  evidence: CandidateScoringEvidence,
): number => {
  const strictScore = scoreBeerVenueClaimAddress(title, description, evidence);
  if (strictScore >= MIN_VERIFIED_PRICE_CLAIM_ADDRESS_SCORE) return strictScore;
  // Do not weaken a seed that already carries a complete road+building
  // address. The city/district fallback below exists solely for incomplete
  // provider seeds such as `이화여대8길`.
  if (extractRoadAddressBuildings(evidence.placeInfo.roadAddress).length > 0) {
    return strictScore;
  }
  if (!hasCandidateBoundPriceTitle(title, evidence)) return strictScore;

  const itemText = `${title}\n${description}`;
  return hasSharedAdministrativeAddress(evidence, itemText)
    ? MIN_VERIFIED_PRICE_CLAIM_ADDRESS_SCORE
    : strictScore;
};

const hasSharedAdministrativeAddress = (
  evidence: CandidateScoringEvidence,
  itemText: string,
): boolean => {
  const candidateTokens = new Set(
    extractAdministrativeAddressTokens(
      [evidence.placeInfo.address, evidence.placeInfo.roadAddress].join(" "),
    ),
  );
  if (candidateTokens.size === 0) return false;
  const itemTokens = new Set(extractAdministrativeAddressTokens(itemText));
  const sharedCount = [...candidateTokens].filter((token) => itemTokens.has(token)).length;
  return sharedCount >= 2;
};

const extractAdministrativeAddressTokens = (value: string): string[] =>
  Array.from(
    normalizeAdministrativeAddress(value).matchAll(
      /서울|부산|대구|인천|광주|대전|울산|세종|제주|[가-힣]+(?:특별시|광역시|특별자치시|특별자치도|시|군|구)/gu,
    ),
  )
    .map((match) => match[0])
    .filter((token): token is string => Boolean(token));

export const searchNaver = async (
  type: "blog" | "webkr",
  query: string,
  { clientId, clientSecret, abortSignal }: NaverSearchCredentials,
): Promise<NaverSearchResponse> => {
  const searchParams: Record<string, string | number> = {
    query,
    display: 5,
    start: 1,
  };
  if (type === "blog") searchParams.sort = "sim";

  const response = await ky
    .get(`${NAVER_SEARCH_API_BASE_URL}/${type}.json`, {
      timeout: DEFAULT_EXTERNAL_API_TIMEOUT_MS,
      signal: abortSignal,
      searchParams,
      headers: {
        "X-Naver-Client-Id": clientId,
        "X-Naver-Client-Secret": clientSecret,
      },
    })
    .json<unknown>();
  return NaverSearchResponseSchema.parse(response);
};
