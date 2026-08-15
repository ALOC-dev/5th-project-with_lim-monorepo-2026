import type { DietaryConstraint, VerifiedPriceClaim } from "./enrichment-types.js";
import type { CandidateScoringEvidence } from "./evidence.js";

type SemanticFitStatus = "PASS" | "PENALIZE" | "REJECT";
type SemanticFitSeverity = "NONE" | "SOFT" | "STRONG";

export type SemanticFitAssessment = {
  status: SemanticFitStatus;
  score: number;
  severity: SemanticFitSeverity;
  requestedIntent: SemanticIntent;
  reason: string;
  positiveSignals: string[];
  negativeSignals: string[];
};

type SemanticScoreAdjustment = {
  appliedPenalty: number;
  scoreCap?: number;
};

type SemanticIntent = "CAFE" | "FOOD" | "PLACE";

type SemanticRule = {
  intent: SemanticIntent;
  requestKeywords: RegExp;
  allowedWhenRequestMentions: RegExp;
  hardRejectSignals: Array<{
    label: string;
    pattern: RegExp;
  }>;
  softPenaltySignals: Array<{
    label: string;
    pattern: RegExp;
  }>;
};

type CuisineFamily = "KOREAN" | "JAPANESE" | "CHINESE" | "WESTERN" | "CHICKEN";

type CuisineRule = {
  family: CuisineFamily;
  requestPattern: RegExp;
  candidateCategoryPattern: RegExp;
  label: string;
};

type SeoulLocalityRule = {
  label: string;
  requestPattern: RegExp;
  candidatePattern: RegExp;
  allowedDistricts: readonly string[];
};

type ExplicitConstraintMismatch = {
  label: string;
  reason: string;
};

type SpecificDishRule = {
  label: string;
  requestPattern: RegExp;
  /** Explicit exclusion wording means this dish is not the requested constraint. */
  negatedRequestPattern?: RegExp;
  /** A user who explicitly names another dish has not made this a single-dish request. */
  alternativeRequestPattern: RegExp;
  compatibleCandidatePattern: RegExp;
  conflictingCandidatePattern: RegExp;
};

type DietaryRequirement = {
  constraints: DietaryConstraint[];
  mode: "ALL" | "ANY";
};

const SEMANTIC_RULES: SemanticRule[] = [
  {
    intent: "CAFE",
    // `차\b`를 쓰면 안 된다. JS의 `\b`는 ASCII 단어경계라 한글 뒤에서는 성립하지 않아
    // 한국어 입력에서 절대 매칭되지 않는 죽은 패턴이 된다. 실제 어휘로 대체한다.
    requestKeywords: /카페|커피|디저트|브런치|베이커리|티룸|찻집|tea|coffee|cafe/iu,
    allowedWhenRequestMentions: /타로|사주|운세|점술|신점|철학관|궁합|운명|작명|상담/iu,
    hardRejectSignals: [
      {
        label: "타로/운세 서비스업 신호",
        pattern: /타로|사주|운세|점술|신점|철학관|궁합|운명|작명/iu,
      },
      {
        label: "비식음료 상담 서비스 신호",
        pattern: /심리상담|상담센터|테라피|마사지|왁싱|네일|피부관리|공방|스튜디오/iu,
      },
    ],
    softPenaltySignals: [
      {
        label: "특수 목적 카페 신호",
        pattern: /보드게임카페|만화카페|룸카페|키즈카페|애견카페|고양이카페/iu,
      },
    ],
  },
  {
    intent: "FOOD",
    requestKeywords: /맛집|식당|음식|곱창|고기|파스타|한식|중식|일식|양식|브런치|비건|점심|저녁/iu,
    // `바\b`도 같은 이유로 죽은 패턴이었다. 복합어로 명시한다.
    allowedWhenRequestMentions:
      /술집|맥주|펍|호프|와인바|칵테일바|위스키바|바텐더|bar\b|포차|와인|칵테일|이자카야|한잔/iu,
    hardRejectSignals: [
      {
        label: "주류 중심 업장 신호",
        pattern: /술집|호프|펍|포차|이자카야|칵테일바|와인바|맥주집/iu,
      },
    ],
    softPenaltySignals: [
      {
        label: "요청 음식과 약한 업종 신호",
        pattern: /카페|디저트|베이커리|주스전문점|테이크아웃/iu,
      },
    ],
  },
];

/**
 * 음식 일반 요청에는 적용하지 않는다. 사용자가 한식/일식처럼 명시적으로 한 종류를
 * 지목했고 공급자 카테고리도 다른 종류를 명시한 경우만 막는다. 따라서 비건·할랄처럼
 * 희소하거나 복합적인 제약에서 카테고리가 비어 있다는 이유로 후보를 탈락시키지 않는다.
 */
const CUISINE_RULES: CuisineRule[] = [
  {
    family: "KOREAN",
    requestPattern: /한식/iu,
    candidateCategoryPattern: /한식|한정식|국밥|곰탕|설렁탕|갈비탕|순대국|김치찌개|비빔밥|불고기|곱창|족발|보쌈/iu,
    label: "한식",
  },
  {
    family: "JAPANESE",
    requestPattern: /일식|일본식|스시|초밥|사시미|라멘|우동|소바|돈카츠/iu,
    candidateCategoryPattern: /일식|일본식|스시|초밥|사시미|라멘|우동|소바|돈카츠|이자카야/iu,
    label: "일식",
  },
  {
    family: "CHINESE",
    requestPattern: /중식|중국식|짜장|짬뽕|마라|훠궈/iu,
    candidateCategoryPattern: /중식|중국식|짜장|짬뽕|마라|훠궈/iu,
    label: "중식",
  },
  {
    family: "WESTERN",
    requestPattern: /양식|이탈리안|이탈리아|파스타|피자|스테이크|프렌치/iu,
    candidateCategoryPattern: /양식|이탈리안|이태리|파스타|피자|스테이크|프렌치|버거/iu,
    label: "양식",
  },
  {
    family: "CHICKEN",
    requestPattern: /치킨/iu,
    candidateCategoryPattern: /치킨/iu,
    label: "치킨",
  },
];

/**
 * `양식`처럼 넓은 식문화와 `파스타`처럼 구체적인 메뉴는 다르게 다룬다.
 * 예를 들어 피자도 양식이지만, 파스타를 명시한 요청의 대체재로 보기는 어렵다.
 * 후보가 이태리/파스타 계열이라는 양성 신호가 함께 있으면 오거절하지 않는다.
 */
const SPECIFIC_DISH_RULES: SpecificDishRule[] = [
  {
    label: "파스타",
    requestPattern: /파스타|스파게티/iu,
    alternativeRequestPattern: /피자|버거|치킨|베이커리|카페/iu,
    compatibleCandidatePattern: /파스타|스파게티|이태리|이탈리/iu,
    conflictingCandidatePattern: /피자|패스트푸드|햄버거|버거|치킨|제과점|베이커리|카페|커피/iu,
  },
  {
    // 해산물은 한식·일식 등 여러 식문화에 걸칠 수 있으므로 일반 cuisine gate로
    // 축소하지 않는다. 다만 해산물 양성 신호가 전혀 없는 일반 중식/중화 후보는
    // 명시 해산물 요청의 대체재가 아니다. `해산물이나 중식`처럼 대안을 명시한
    // 요청은 alternative pattern에서 보존한다.
    label: "해산물",
    requestPattern: /해산물|해물|seafood/iu,
    negatedRequestPattern:
      /(?:해산물|해물|seafood)\s*(?:은|는|이|가|을|를)?\s*(?:말고|제외|빼고|없이|아닌|아니|불가|no|not)|(?:not|no)\s+(?:seafood)|non\s*-?\s*seafood/iu,
    alternativeRequestPattern:
      /패스트푸드|햄버거|버거|(?:해산물|해물|seafood)\s*(?:이나|나|또는|혹은|or)\s*(?:중식|중화(?:요리)?|중국(?:식|요리)?|짜장|짬뽕|마라|훠궈|\bchinese(?:\s+(?:food|cuisine))?\b)|(?:중식|중화(?:요리)?|중국(?:식|요리)?|짜장|짬뽕|마라|훠궈|\bchinese(?:\s+(?:food|cuisine))?\b)\s*(?:이나|나|또는|혹은|or)\s*(?:해산물|해물|seafood)/iu,
    compatibleCandidatePattern:
      /해산물|해물|seafood|생선|수산|조개|장어|굴|전복|낙지|문어|쭈꾸미|대게|랍스터|복어|횟집|사시미|초밥/iu,
    conflictingCandidatePattern:
      /패스트푸드|햄버거|버거|중식|중화(?:요리)?|중국(?:식|요리)?|짜장|짬뽕|마라|훠궈/iu,
  },
];

/**
 * `음식점`은 TMap의 넓은 상위 분류라 제과점에도 붙을 수 있다. 그래서 이 규칙은
 * 상위 분류가 아니라 후보의 구체적인 상호/하위 태그에만 의존한다. 반대로 실제
 * 식사를 시사하는 태그가 하나라도 있으면 카페 복합업장일 수 있으므로 막지 않는다.
 */
const CLEAR_NON_MEAL_VENUE_PATTERN = /카페|커피전문점|제과점|베이커리|디저트|빙수|음료/iu;
const MEAL_COMPATIBLE_CANDIDATE_PATTERN =
  /한식|중식|일식|양식|분식|국밥|면|고기|구이|샐러드|브런치|레스토랑|전문음식점|비건|vegan|채식|식사|파스타|스테이크|버거|피자|치킨|해산물|세계요리/iu;
const MEAL_REQUEST_EXEMPT_PATTERN = /카페|커피|브런치|베이커리|디저트|빵|찻집|tea|coffee|cafe/iu;
const EXPLICIT_MEAL_REQUEST_PATTERN = /식당|맛집|점심|저녁|식사|배부르게|먹을/iu;

/**
 * enrichment 전에는 비건/채식 후보를 정보 부재만으로 추정 거절하지 않는다. 다만 후보
 * 자체의 구조화된 이름/카테고리에 육식 메뉴가 명시된 경우는 즉시 양성 모순이다.
 * OPEN enrichment 뒤에는 별도 dietary claim gate가 상호 일치 근거를 요구한다.
 */
const VEGETARIAN_REQUEST_PATTERN = /비건|vegan|채식|vegetarian/iu;
const VEGETARIAN_COMPATIBLE_CANDIDATE_PATTERN =
  /비건|vegan|채식|vegetarian|plant\s*-?\s*based|플랜트베이스드|팔라펠|falafel/iu;
const VEGETARIAN_CONFLICTING_CANDIDATE_PATTERN =
  /고기|육류|삼겹|목살|갈비|곱창|대창|막창|족발|보쌈|돼지|소고기|한우|양고기|스테이크|햄버거|치킨|닭|케밥|kebab|해산물|사시미|참치/iu;

const VEGAN_REQUEST_PATTERN = /비건|vegan/iu;
const VEGETARIAN_ONLY_REQUEST_PATTERN = /채식|vegetarian/iu;
const HALAL_REQUEST_PATTERN = /할랄|halal/iu;
const DIETARY_DISJUNCTION_PATTERN = /\b(?:or|either)\b|또는|혹은/iu;
const VEGAN_STRUCTURED_CANDIDATE_PATTERN =
  /비건|vegan|plant\s*-?\s*based|플랜트\s*-?\s*베이스드/iu;
const VEGETARIAN_STRUCTURED_CANDIDATE_PATTERN =
  /비건|vegan|채식|vegetarian|plant\s*-?\s*based|플랜트\s*-?\s*베이스드/iu;
const HALAL_STRUCTURED_CANDIDATE_PATTERN = /할랄|halal/iu;

// 일반 bar·술집·이자카야 요청에는 적용하지 않는다. 맥주/호프/펍/beer/pub/brewery를
// 긍정적으로 명시했을 때만 와인바·젤라또바처럼 다른 주류/야간 업장을 맥주 펍으로
// 오수락하지 않도록 한다.
const BEER_VENUE_REQUEST_TERM_PATTERN =
  /맥주|호프|펍|브루잉|\b(?:beer|pub|brewery)\b/iu;
const EXCLUDED_BEER_VENUE_REQUEST_PATTERN =
  /(?:맥주|호프|펍|브루잉|\b(?:beer|pub|brewery)\b)(?:\s*(?:,|·|\/|및|와|과|나|or|and)\s*(?:맥주|호프|펍|브루잉|\b(?:beer|pub|brewery)\b))*\s*(?:은|는|이|가|을|를)?\s*(?:말고(?:요)?|제외(?:하(?:고|면|는|한)|한)?|빼고|없이|아닌|아님|아닐|원하지\s*않(?:아|는|아요)?|싫(?:어|은)?|필요\s*없(?:어|는)?)(?=\s|$|[.,!?。])|\b(?:not|no|without|non)\b\s*(?:a\s+)?(?:beer|pub|brewery)(?:\s+(?:beer|pub|brewery))?\b/giu;
const BEER_VENUE_STRUCTURED_CANDIDATE_PATTERN =
  /맥주|호프|펍|브루잉|\b(?:beer|pub|brewery)\b/iu;
const MIN_BEER_VENUE_CLAIM_IDENTITY_SCORE = 0.75;
const MIN_BEER_VENUE_CLAIM_ADDRESS_SCORE = 0.8;
const MIN_VERIFIED_PRICE_CLAIM_IDENTITY_SCORE = 0.75;
const MIN_VERIFIED_PRICE_CLAIM_ADDRESS_SCORE = 0.8;

/**
 * 서울의 대표 권역만 보수적으로 인식한다. 요청에 두 곳 이상이 등장하면 중간지점 등
 * 복수 지역 요청일 수 있으므로 이 gate를 적용하지 않는다. 후보 쪽도 주소/상호에
 * 명시적인 다른 권역 신호가 있을 때만 막고, 정보가 빠진 후보를 추정해서 제거하지 않는다.
 */
const SEOUL_LOCALITY_RULES: SeoulLocalityRule[] = [
  {
    label: "강남권",
    requestPattern: /강남|역삼|논현|신사|압구정|청담|삼성|선릉|대치|도곡|개포|gangnam/iu,
    candidatePattern: /강남|역삼|논현|신사|압구정|청담|삼성|선릉|대치|도곡|개포|gangnam/iu,
    allowedDistricts: ["강남구", "서초구"],
  },
  {
    label: "서초권",
    requestPattern: /서초|교대|반포|잠원/iu,
    candidatePattern: /서초|교대|반포|잠원/iu,
    allowedDistricts: ["서초구", "강남구"],
  },
  {
    label: "잠실권",
    requestPattern: /잠실|송파|석촌|방이/iu,
    candidatePattern: /잠실|송파|석촌|방이/iu,
    allowedDistricts: ["송파구"],
  },
  {
    label: "성수권",
    requestPattern: /성수|서울숲|왕십리|건대|seongsu/iu,
    candidatePattern: /성수|서울숲|왕십리|건대|seongsu/iu,
    allowedDistricts: ["성동구", "광진구"],
  },
  {
    label: "회기권",
    requestPattern: /회기|경희대/iu,
    candidatePattern: /회기|경희대/iu,
    allowedDistricts: ["동대문구"],
  },
  {
    label: "이태원권",
    requestPattern: /이태원|itaewon/iu,
    candidatePattern: /이태원|itaewon/iu,
    allowedDistricts: ["용산구"],
  },
  {
    label: "용산권",
    requestPattern: /용산(?:역|동|구)?|yongsan/iu,
    candidatePattern: /용산(?:역|동|점)|한강로|아이파크몰|yongsan/iu,
    allowedDistricts: ["용산구"],
  },
  {
    label: "여의도권",
    requestPattern: /여의도|yeouido/iu,
    candidatePattern: /여의도|yeouido/iu,
    allowedDistricts: ["영등포구"],
  },
  {
    label: "영등포권",
    requestPattern: /영등포|문래/iu,
    candidatePattern: /영등포|문래/iu,
    allowedDistricts: ["영등포구"],
  },
  {
    label: "마포권",
    requestPattern: /홍대|연남|합정|망원|상수|공덕|마포/iu,
    candidatePattern: /홍대|연남|합정|망원|상수|공덕|마포/iu,
    allowedDistricts: ["마포구", "서대문구"],
  },
  {
    label: "신촌권",
    requestPattern: /신촌/iu,
    candidatePattern: /신촌/iu,
    allowedDistricts: ["서대문구", "마포구"],
  },
  {
    label: "을지로권",
    requestPattern: /을지로|명동|충무로/iu,
    candidatePattern: /을지로|명동|충무로/iu,
    allowedDistricts: ["중구"],
  },
  {
    label: "종로권",
    requestPattern: /광화문|종로|익선|인사동|삼청/iu,
    candidatePattern: /광화문|종로|익선|인사동|삼청/iu,
    allowedDistricts: ["종로구"],
  },
];

const SEOUL_DISTRICTS = [
  "강남구",
  "강동구",
  "강북구",
  "강서구",
  "관악구",
  "광진구",
  "구로구",
  "금천구",
  "노원구",
  "도봉구",
  "동대문구",
  "동작구",
  "마포구",
  "서대문구",
  "서초구",
  "성동구",
  "성북구",
  "송파구",
  "양천구",
  "영등포구",
  "용산구",
  "은평구",
  "종로구",
  "중구",
  "중랑구",
] as const;

export const assessSemanticFit = (evidence: CandidateScoringEvidence): SemanticFitAssessment => {
  const request = normalizeText(evidence.userFit.naturalLanguageRequest);
  const requestedIntent = inferRequestedIntent(request);
  const basePositiveSignals = getPositiveSignals(evidence);
  const base = {
    requestedIntent,
    positiveSignals: basePositiveSignals,
  };

  const explicitConstraintMismatch = findExplicitConstraintMismatch(request, evidence);
  if (explicitConstraintMismatch) {
    return {
      ...base,
      status: "REJECT",
      score: 0,
      severity: "STRONG",
      reason: explicitConstraintMismatch.reason,
      positiveSignals: basePositiveSignals,
      negativeSignals: [explicitConstraintMismatch.label],
    };
  }

  const rule = SEMANTIC_RULES.find((candidate) => candidate.requestKeywords.test(request));
  if (!rule) {
    return {
      ...base,
      status: "PASS",
      score: 1,
      severity: "NONE",
      reason: "적용할 의미 필터 규칙 없음",
      negativeSignals: [],
    };
  }

  const candidateText = normalizeText(toCandidateSemanticText(evidence));
  const negativeSignals = rule.hardRejectSignals
    .filter((signal) => signal.pattern.test(toHardRejectText(candidateText, signal.label)))
    .map((signal) => signal.label);
  const softPenaltySignals = rule.softPenaltySignals
    .filter((signal) => signal.pattern.test(candidateText))
    .map((signal) => signal.label);

  if (negativeSignals.length > 0 && !rule.allowedWhenRequestMentions.test(request)) {
    return {
      ...base,
      status: "PENALIZE",
      score: 0.1,
      severity: "STRONG",
      reason: `${rule.intent} 요청이지만 후보가 ${negativeSignals.join(", ")}를 ` + "강하게 포함함",
      negativeSignals,
    };
  }

  if (negativeSignals.length > 0 && rule.allowedWhenRequestMentions.test(request)) {
    return {
      ...base,
      status: "PASS",
      score: 1,
      severity: "NONE",
      reason: "사용자 요청이 서비스형 카페 신호를 명시해 의미 충돌로 보지 않음",
      negativeSignals: [],
    };
  }

  if (softPenaltySignals.length > 0 && !rule.allowedWhenRequestMentions.test(request)) {
    return {
      ...base,
      status: "PENALIZE",
      score: 0.45,
      severity: "SOFT",
      reason: `일반 ${rule.intent} 요청이지만 후보가 ${softPenaltySignals.join(", ")}를 포함함`,
      negativeSignals: softPenaltySignals,
    };
  }

  return {
    ...base,
    status: "PASS",
    score: 1,
    severity: "NONE",
    reason: "사용자 의도와 충돌하는 업종 신호 없음",
    negativeSignals: [],
  };
};

/**
 * 외부 claim 없이 seed의 구조화 필드만으로 확정 가능한 충돌만 거른다.
 * 식이·맥주·검증 가격은 반드시 enrichment 이후의 전체 semantic gate에 남겨 둔다.
 */
export const assessPreEnrichmentSemanticFit = (
  evidence: CandidateScoringEvidence,
): SemanticFitAssessment => {
  const request = normalizeText(evidence.userFit.naturalLanguageRequest);
  const requestedIntent = inferRequestedIntent(request);
  const positiveSignals = getPositiveSignals(evidence);
  const mismatch = findSeedOnlyConstraintMismatch(request, evidence);
  if (!mismatch) {
    return {
      status: "PASS",
      score: 1,
      severity: "NONE",
      requestedIntent,
      reason: "seed 정보에서 확정 가능한 충돌 없음",
      positiveSignals,
      negativeSignals: [],
    };
  }

  return {
    status: "REJECT",
    score: 0,
    severity: "STRONG",
    requestedIntent,
    reason: mismatch.reason,
    positiveSignals,
    negativeSignals: [mismatch.label],
  };
};

export const getSemanticScoreAdjustment = ({
  severity,
  score,
}: SemanticFitAssessment): SemanticScoreAdjustment => {
  if (severity === "STRONG" && score === 0) return { appliedPenalty: 100, scoreCap: 0 };
  if (severity === "NONE") return { appliedPenalty: 0 };
  if (severity === "STRONG") return { appliedPenalty: 45, scoreCap: 55 };
  return {
    appliedPenalty: Math.round((1 - score) * 35),
    scoreCap: 75,
  };
};

const findExplicitConstraintMismatch = (
  request: string,
  evidence: CandidateScoringEvidence,
): ExplicitConstraintMismatch | undefined =>
  findSpecificDishMismatch(request, evidence) ??
  findCuisineMismatch(request, evidence) ??
  findExplicitMealVenueMismatch(request, evidence) ??
  findVegetarianMismatch(request, evidence) ??
  findDietaryVerificationMismatch(request, evidence) ??
  findBeerVenueVerificationMismatch(request, evidence) ??
  findVerifiedBudgetFloorMismatch(evidence) ??
  findSeoulLocalityMismatch(request, evidence);

const findSeedOnlyConstraintMismatch = (
  request: string,
  evidence: CandidateScoringEvidence,
): ExplicitConstraintMismatch | undefined =>
  findSpecificDishMismatch(request, evidence) ??
  findCuisineMismatch(request, evidence) ??
  findExplicitMealVenueMismatch(request, evidence) ??
  findVegetarianMismatch(request, evidence) ??
  findSeoulLocalityMismatch(request, evidence);

const findSpecificDishMismatch = (
  request: string,
  evidence: CandidateScoringEvidence,
): ExplicitConstraintMismatch | undefined => {
  const candidateText = normalizeText(toCandidateSemanticText(evidence));

  for (const rule of SPECIFIC_DISH_RULES) {
    if (!rule.requestPattern.test(request)) continue;
    if (rule.negatedRequestPattern?.test(request)) continue;
    // "파스타나 피자"처럼 대체 메뉴를 명시한 문장은 단일 메뉴 gate로 축소하지 않는다.
    if (rule.alternativeRequestPattern.test(request)) continue;
    if (rule.compatibleCandidatePattern.test(candidateText)) continue;
    if (!rule.conflictingCandidatePattern.test(candidateText)) continue;

    return {
      label: `명시한 ${rule.label}과 다른 후보 업종`,
      reason:
        `사용자가 ${rule.label}을 명시했지만 후보의 구조화된 상호/카테고리가 ` +
        "피자·패스트푸드 등 다른 업종으로 확인됨",
    };
  }

  return undefined;
};

const findCuisineMismatch = (
  request: string,
  evidence: CandidateScoringEvidence,
): ExplicitConstraintMismatch | undefined => {
  const requestedCuisines = CUISINE_RULES.filter((rule) => rule.requestPattern.test(request));
  // "한식 또는 일식"처럼 한 문장에 여러 식문화를 허용한 요청은 이 작은 규칙으로
  // 의도를 축소 해석하지 않는다.
  if (requestedCuisines.length !== 1) return undefined;

  const requestedCuisine = requestedCuisines[0];
  if (!requestedCuisine) return undefined;
  const candidateCategory = normalizeText(
    [
      evidence.category.mainCategory,
      evidence.category.subCategory,
      ...evidence.category.tags,
    ].join(" "),
  );
  const candidateCuisines = CUISINE_RULES.filter((rule) =>
    rule.candidateCategoryPattern.test(candidateCategory),
  );
  if (candidateCuisines.length === 0) return undefined;
  if (candidateCuisines.some((rule) => rule.family === requestedCuisine.family)) return undefined;

  return {
    label: `명시한 ${requestedCuisine.label}과 다른 후보 카테고리`,
    reason:
      `사용자가 ${requestedCuisine.label}을 명시했지만 후보의 구조화된 카테고리가 ` +
      `${candidateCuisines.map((rule) => rule.label).join(", ")}으로 확인됨`,
  };
};

const findExplicitMealVenueMismatch = (
  request: string,
  evidence: CandidateScoringEvidence,
): ExplicitConstraintMismatch | undefined => {
  const isMealRequest =
    evidence.userFit.activityType === "MEAL" || EXPLICIT_MEAL_REQUEST_PATTERN.test(request);
  if (!isMealRequest || MEAL_REQUEST_EXEMPT_PATTERN.test(request)) return undefined;

  const candidateText = normalizeText(toCandidateSemanticText(evidence));
  if (!CLEAR_NON_MEAL_VENUE_PATTERN.test(candidateText)) return undefined;
  if (MEAL_COMPATIBLE_CANDIDATE_PATTERN.test(candidateText)) return undefined;

  return {
    label: "식사 요청과 다른 카페·제과 업종",
    reason:
      "사용자가 식사 장소를 요청했지만 후보의 구조화된 상호/카테고리가 " +
      "카페·제과·디저트 중심으로 확인됨",
  };
};

const findVegetarianMismatch = (
  request: string,
  evidence: CandidateScoringEvidence,
): ExplicitConstraintMismatch | undefined => {
  if (!VEGETARIAN_REQUEST_PATTERN.test(request)) return undefined;

  const candidateText = normalizeText(toCandidateSemanticText(evidence));
  if (VEGETARIAN_COMPATIBLE_CANDIDATE_PATTERN.test(candidateText)) return undefined;
  if (!VEGETARIAN_CONFLICTING_CANDIDATE_PATTERN.test(candidateText)) return undefined;

  return {
    label: "비건·채식 요청과 다른 육식 메뉴 신호",
    reason:
      "사용자가 비건·채식 식사를 요청했지만 후보의 구조화된 상호/카테고리에 " +
      "육식 메뉴 신호가 확인됨",
  };
};

/**
 * 식이 제약은 후보가 이미 enrichment를 받은 뒤에만 검증한다. enrichment가 없으면
 * sparse 후보를 이 단계에서 추정 거절하지 않는다. 반대로 OPEN까지 확인된 후보는
 * 이름/카테고리의 명시적 표기 또는 후보 상호가 일치한 개별 Naver Search claim으로
 * 제약을 입증해야 reference URL 및 LLM scoring으로 진행할 수 있다.
 */
const findDietaryVerificationMismatch = (
  request: string,
  evidence: CandidateScoringEvidence,
): ExplicitConstraintMismatch | undefined => {
  const requirement = getDietaryRequirement(request);
  if (!requirement || !evidence.enrichment) return undefined;

  const supportsConstraint = (constraint: DietaryConstraint): boolean =>
    hasStructuredDietarySupport(evidence, constraint) ||
    hasVerifiedDietaryClaim(evidence, constraint);
  const isSatisfied =
    requirement.mode === "ALL"
      ? requirement.constraints.every(supportsConstraint)
      : requirement.constraints.some(supportsConstraint);
  if (isSatisfied) return undefined;

  const requestedLabels = requirement.constraints.map(getDietaryConstraintLabel).join("·");
  const requirementDescription =
    requirement.mode === "ANY" ? `${requestedLabels} 중 하나` : requestedLabels;
  return {
    label: "검증되지 않은 명시적 식이 제약",
    reason:
      `사용자가 ${requirementDescription}을 명시했지만 후보의 구조화된 상호/카테고리 또는 ` +
      "상호 일치 네이버 검색 근거에서 해당 식이 제약을 확인하지 못함",
  };
};

const getDietaryRequirement = (request: string): DietaryRequirement | undefined => {
  const constraints: DietaryConstraint[] = [];
  if (VEGAN_REQUEST_PATTERN.test(request)) constraints.push("VEGAN");
  if (VEGETARIAN_ONLY_REQUEST_PATTERN.test(request)) constraints.push("VEGETARIAN");
  if (HALAL_REQUEST_PATTERN.test(request)) constraints.push("HALAL");
  if (constraints.length === 0) return undefined;

  return {
    constraints,
    mode: constraints.length > 1 && DIETARY_DISJUNCTION_PATTERN.test(request) ? "ANY" : "ALL",
  };
};

const hasStructuredDietarySupport = (
  evidence: CandidateScoringEvidence,
  constraint: DietaryConstraint,
): boolean => {
  const candidateText = normalizeText(toCandidateSemanticText(evidence));
  switch (constraint) {
    case "VEGAN":
      return VEGAN_STRUCTURED_CANDIDATE_PATTERN.test(candidateText);
    case "VEGETARIAN":
      // 비건은 채식보다 강한 제약이므로 vegetarian 요청에는 허용한다.
      return VEGETARIAN_STRUCTURED_CANDIDATE_PATTERN.test(candidateText);
    case "HALAL":
      return HALAL_STRUCTURED_CANDIDATE_PATTERN.test(candidateText);
  }
};

const hasVerifiedDietaryClaim = (
  evidence: CandidateScoringEvidence,
  constraint: DietaryConstraint,
): boolean =>
  (evidence.enrichment?.dietaryClaims ?? []).some((claim) => {
    if (constraint === "VEGETARIAN") {
      // 비건 claim은 vegetarian request를 충족하지만 반대는 아니다.
      return claim.constraint === "VEGETARIAN" || claim.constraint === "VEGAN";
    }
    return claim.constraint === constraint;
  });

const getDietaryConstraintLabel = (constraint: DietaryConstraint): string => {
  switch (constraint) {
    case "VEGAN":
      return "비건";
    case "VEGETARIAN":
      return "채식";
    case "HALAL":
      return "할랄";
  }
};

/**
 * 이 gate는 enrichment 후에만 적용한다. 이름/카테고리에 맥주 업종이 분명하면 그
 * 구조화된 seed 근거를 그대로 사용하고, 그렇지 않은 일반 상호는 identity-qualified
 * Naver Search 개별 item에서 뽑은 claim만 허용한다. 합쳐진 rawTextSnippet, map URL,
 * 주변 가게 언급은 의도적으로 읽지 않는다.
 */
const findBeerVenueVerificationMismatch = (
  request: string,
  evidence: CandidateScoringEvidence,
): ExplicitConstraintMismatch | undefined => {
  if (!hasAffirmativeBeerVenueRequest(request) || !evidence.enrichment) {
    return undefined;
  }
  const candidateText = normalizeText(toCandidateSemanticText(evidence));
  if (BEER_VENUE_STRUCTURED_CANDIDATE_PATTERN.test(candidateText)) return undefined;
  if (hasVerifiedBeerVenueClaim(evidence)) return undefined;

  return {
    label: "검증되지 않은 명시적 맥주·펍 업종",
    reason:
      "사용자가 맥주·호프·펍을 명시했지만 후보의 구조화된 상호/카테고리 또는 " +
      "상호 일치 단일 Naver Search 근거에서 맥주 업종을 확인하지 못함",
  };
};

const hasAffirmativeBeerVenueRequest = (request: string): boolean =>
  BEER_VENUE_REQUEST_TERM_PATTERN.test(
    request.replace(EXCLUDED_BEER_VENUE_REQUEST_PATTERN, " "),
  );

const hasVerifiedBeerVenueClaim = (evidence: CandidateScoringEvidence): boolean =>
  (evidence.enrichment?.beerVenueClaims ?? []).some(
    (claim) =>
      claim.source === "naver-search" &&
      claim.sourceUrl.trim().length > 0 &&
      Number.isFinite(claim.identityMatchScore) &&
      claim.identityMatchScore >= MIN_BEER_VENUE_CLAIM_IDENTITY_SCORE &&
      Number.isFinite(claim.addressMatchScore) &&
      claim.addressMatchScore >= MIN_BEER_VENUE_CLAIM_ADDRESS_SCORE,
  );

/**
 * Only source-specific, identity/address-qualified menu price provenance can
 * hard-reject a supplied per-person budget. `placeInfo.priceRangePerPerson`
 * is intentionally excluded: it may come from an aggregate snippet, a source
 * selected for another purpose, or the output-category fallback.
 */
const findVerifiedBudgetFloorMismatch = (
  evidence: CandidateScoringEvidence,
): ExplicitConstraintMismatch | undefined => {
  const budgetMax = evidence.userFit.budgetPerPerson?.[1];
  const verifiedMinimumPrice = getVerifiedCandidateMinimumPrice(evidence);
  if (budgetMax === undefined || verifiedMinimumPrice === undefined) return undefined;

  if (verifiedMinimumPrice <= budgetMax) return undefined;

  return {
    label: "명시한 1인 예산 상한을 넘는 검증 메뉴 가격",
    reason:
      `사용자 1인 예산 상한은 ${budgetMax.toLocaleString("ko-KR")}원인데 후보의 ` +
      `검증 메뉴 가격 하한이 ${verifiedMinimumPrice.toLocaleString("ko-KR")}원으로 더 높음`,
  };
};

const getVerifiedCandidateMinimumPrice = (
  evidence: CandidateScoringEvidence,
): number | undefined => {
  const prices = (evidence.enrichment?.verifiedPriceClaims ?? [])
    .filter(isVerifiedPriceClaim)
    .map((claim) => claim.minimumPrice);
  if (prices.length === 0) return undefined;
  return Math.min(...prices);
};

const isVerifiedPriceClaim = (claim: VerifiedPriceClaim): boolean =>
  claim.source === "naver-search" &&
  claim.sourceUrl.trim().length > 0 &&
  Number.isFinite(claim.identityMatchScore) &&
  claim.identityMatchScore >= MIN_VERIFIED_PRICE_CLAIM_IDENTITY_SCORE &&
  Number.isFinite(claim.addressMatchScore) &&
  claim.addressMatchScore >= MIN_VERIFIED_PRICE_CLAIM_ADDRESS_SCORE &&
  Number.isFinite(claim.minimumPrice) &&
  claim.minimumPrice > 0;

const findSeoulLocalityMismatch = (
  request: string,
  evidence: CandidateScoringEvidence,
): ExplicitConstraintMismatch | undefined => {
  const requestedLocalities = SEOUL_LOCALITY_RULES.filter((rule) => rule.requestPattern.test(request));
  // 여러 지역을 함께 말한 중간지점/복수 선택 요청은 단일 지역 gate로 거절하지 않는다.
  if (requestedLocalities.length !== 1) return undefined;

  const requestedLocality = requestedLocalities[0];
  if (!requestedLocality) return undefined;
  const candidateAddress = normalizeText(
    [evidence.placeInfo.address, evidence.placeInfo.roadAddress].join(" "),
  );
  const candidateLocationText = normalizeText(
    [evidence.name, evidence.placeInfo.address, evidence.placeInfo.roadAddress].join(" "),
  );
  const candidateDistrict = SEOUL_DISTRICTS.find((district) => candidateAddress.includes(district));

  if (candidateDistrict && !requestedLocality.allowedDistricts.includes(candidateDistrict)) {
    return {
      label: `명시한 ${requestedLocality.label}과 다른 서울 행정구역`,
      reason:
        `사용자가 ${requestedLocality.label}을 명시했지만 후보 주소가 ` +
        `${candidateDistrict}로 확인됨`,
    };
  }

  // 같은 행정구 안에도 용산역/한강로처럼 명백히 다른 권역이 있다. 반대로 주소에
  // 현재 요청 권역이 명시되면 상호의 지점 표기와 함께 정상 후보로 둔다.
  if (requestedLocality.candidatePattern.test(candidateLocationText)) return undefined;
  const conflictingLocality = SEOUL_LOCALITY_RULES.find(
    (rule) =>
      rule.label !== requestedLocality.label && rule.candidatePattern.test(candidateLocationText),
  );
  if (!conflictingLocality) return undefined;

  return {
    label: `명시한 ${requestedLocality.label}과 다른 ${conflictingLocality.label}`,
    reason:
      `사용자가 ${requestedLocality.label}을 명시했지만 후보 주소/상호에 ` +
      `${conflictingLocality.label} 신호가 확인됨`,
  };
};

const inferRequestedIntent = (request: string): SemanticIntent => {
  if (/카페|커피|디저트|브런치|베이커리|티룸|찻집|tea|coffee|cafe/iu.test(request)) {
    return "CAFE";
  }
  if (/맛집|식당|음식|곱창|고기|파스타|한식|중식|일식|양식|술집|와인바|이자카야|포차/iu.test(request)) {
    return "FOOD";
  }
  return "PLACE";
};

const getPositiveSignals = (evidence: CandidateScoringEvidence): string[] => {
  const tags = evidence.category.tags.join(" ");
  const signals: string[] = [];
  if (/카페|커피|디저트|베이커리/iu.test(`${evidence.name} ${tags}`)) {
    signals.push("카페/음료 카테고리 신호");
  }
  if (/음식점|식당|전문음식점|한식|양식|중식|일식/iu.test(tags)) {
    signals.push("음식점 카테고리 신호");
  }
  return signals;
};

/**
 * 의미 판정에는 구조화된 필드만 쓴다.
 *
 * 예전에는 스크랩 원문(`rawTextSnippet`)까지 이어붙여 매칭했는데, 네이버 지도 페이지에는
 * 주변 가게와 리뷰가 섞여 있어서 리뷰에 "근처 이자카야" 한 줄만 있어도 멀쩡한 식당이
 * 주류 업장으로 오탐돼 -45점을 먹었다. 업종 판정의 근거는 카테고리와 상호명이어야 한다.
 */
const toCandidateSemanticText = (evidence: CandidateScoringEvidence): string =>
  [
    evidence.name,
    evidence.category.mainCategory,
    evidence.category.subCategory,
    ...evidence.category.tags,
  ]
    .filter((value): value is string => typeof value === "string")
    .join(" ");

const normalizeText = (value: string): string =>
  value
    .replace(/<[^>]*>/gu, " ")
    .replace(/&(?:amp|lt|gt|quot|apos);/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .toLowerCase();

const toHardRejectText = (candidateText: string, signalLabel: string): string => {
  if (signalLabel !== "타로/운세 서비스업 신호") return candidateText;

  return candidateText
    .replace(/타로\s*(?:밀크\s*티|밀크티|버블\s*티|버블티|티|라떼|스무디|음료|펄)/giu, " ")
    .replace(/(?:밀크\s*티|밀크티|버블\s*티|버블티|티|라떼|스무디|음료|펄)\s*타로/giu, " ");
};
