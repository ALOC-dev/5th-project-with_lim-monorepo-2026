import type { CandidateScoringEvidence } from "./evidence.js";

type SemanticFitStatus = "PASS" | "PENALIZE";
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

/**
 * 업종 충돌 신호.
 *
 * `allowedWhenRequestMentions`는 신호별로 둔다. 예전에는 규칙 단위로 하나만 있어서
 * "타로를 언급하면 허용"이라는 예외가 테마카페 신호에까지 적용됐다. 신호마다
 * 면제 조건이 다른 게 자연스럽다. "고양이카페 가고 싶어"는 고양이카페만 허용해야지
 * 사주카페까지 허용할 이유가 없다.
 */
type SemanticSignal = {
  label: string;
  pattern: RegExp;
  allowedWhenRequestMentions: RegExp;
  /**
   * 이 정규식이 요청에 걸릴 때만 신호를 적용한다. 없으면 항상 적용한다.
   *
   * "카페 추천"에 스타벅스가 나오는 건 문제가 아니지만, "조용한 카페"에 나오는 건
   * 문제다. 조건부로만 켜야 하는 신호가 있어서 둔다.
   */
  appliesWhenRequestMentions?: RegExp;
};

type SemanticRule = {
  intent: SemanticIntent;
  requestKeywords: RegExp;
  hardRejectSignals: SemanticSignal[];
  softPenaltySignals: SemanticSignal[];
};

/**
 * 위에서부터 처음 걸리는 규칙 하나만 적용된다. 좁은 조건을 먼저 둬야 한다.
 *
 * "이태원 비건 식당"은 "식당" 때문에 일반 FOOD 규칙에 먼저 걸린다. 채식 규칙을
 * 아래에 두면 영원히 적용되지 않는다.
 */
const SEMANTIC_RULES: SemanticRule[] = [
  {
    // 채식 요청은 업종이 아니라 **식재료 제약**이라, 업종 기준 규칙으로는 걸러지지
    // 않았다. 실측에서 "이태원 비건 식당" 추천 10건에 술탄케밥·케르반레스토랑·
    // 봄베그릴·타코아미고가 들어왔다.
    intent: "FOOD",
    requestKeywords: /비건|vegan|채식|베지테리언|비덩/iu,
    hardRejectSignals: [
      {
        label: "육류 중심 업장 신호",
        pattern:
          /케밥|고기|육류|곱창|막창|삼겹살|갈비|치킨|닭|족발|보쌈|바베큐|스테이크|정육|양꼬치|초밥|장어|곰탕|설렁탕/iu,
        // "비건 옵션 있는 고깃집"처럼 요청이 직접 언급했을 때만 허용한다.
        // `고깃집`은 사이시옷 때문에 `고기`로 매칭되지 않으니 따로 넣는다.
        allowedWhenRequestMentions: /고기|고깃|육류|케밥|치킨|삼겹|갈비|초밥|바베큐/iu,
      },
    ],
    softPenaltySignals: [],
  },
  {
    intent: "CAFE",
    // `차\b`를 쓰면 안 된다. JS의 `\b`는 ASCII 단어경계라 한글 뒤에서는 성립하지 않아
    // 한국어 입력에서 절대 매칭되지 않는 죽은 패턴이 된다. 실제 어휘로 대체한다.
    requestKeywords: /카페|커피|디저트|브런치|베이커리|티룸|찻집|tea|coffee|cafe/iu,
    hardRejectSignals: [
      {
        label: "타로/운세 서비스업 신호",
        pattern: /타로|사주|운세|점술|신점|철학관|궁합|운명|작명/iu,
        allowedWhenRequestMentions: /타로|사주|운세|점술|신점|철학관|궁합|운명|작명/iu,
      },
      {
        label: "비식음료 상담 서비스 신호",
        pattern: /심리상담|상담센터|테라피|마사지|왁싱|네일|피부관리|공방|스튜디오/iu,
        allowedWhenRequestMentions: /상담|테라피|마사지|왁싱|네일|피부관리|공방|스튜디오/iu,
      },
      {
        // "카페 추천해줘"에 고양이카페가 나오는 문제.
        //
        // 예전에는 SOFT 감점(상한 75점)이라 상위권에 그대로 남았다. 테마카페는
        // "카페에서 쉬고 싶다"는 요청과 목적이 다른 업종이므로, 요청에 그 테마가
        // 명시됐을 때만 허용한다.
        label: "테마/목적형 카페 신호",
        pattern:
          /보드게임카페|만화카페|룸카페|키즈카페|애견카페|애완동물카페|반려동물카페|고양이카페|강아지카페|라쿤카페|스터디카페|파티룸|코인노래방/iu,
        allowedWhenRequestMentions:
          /보드게임|만화|룸카페|키즈|애견|애완|반려동물|고양이|강아지|라쿤|스터디|공부|작업|파티/iu,
      },
    ],
    softPenaltySignals: [
      {
        label: "음료보다 제조/판매 중심 업종 신호",
        pattern: /제과점|떡집|아이스크림전문|주스전문점/iu,
        allowedWhenRequestMentions: /제과|빵|떡|아이스크림|주스/iu,
      },
      // 체인 판정은 브랜드 목록이 아니라 `chainBrands`(그 동네에 지점이 여럿인
      // 브랜드)로 한다. 아래 `assessSemanticFit`의 체인 검사 참고.
    ],
  },
  {
    intent: "FOOD",
    requestKeywords: /맛집|식당|음식|곱창|고기|파스타|한식|중식|일식|양식|브런치|비건|점심|저녁/iu,
    hardRejectSignals: [
      {
        label: "주류 중심 업장 신호",
        pattern: /술집|호프|펍|포차|이자카야|칵테일바|와인바|맥주집/iu,
        // `바\b`는 죽은 패턴이었다. 복합어와 실제 어휘로 명시한다.
        allowedWhenRequestMentions:
          /술집|맥주|펍|호프|와인바|칵테일바|위스키바|바텐더|bar\b|포차|와인|칵테일|이자카야|한잔|술/iu,
      },
    ],
    softPenaltySignals: [
      {
        label: "요청 음식과 약한 업종 신호",
        pattern: /카페|디저트|베이커리|주스전문점|테이크아웃/iu,
        allowedWhenRequestMentions: /카페|디저트|베이커리|브런치|커피/iu,
      },
    ],
  },
  {
    // 주류 요청에는 규칙이 아예 없었다. `requestKeywords`가 CAFE/FOOD뿐이라
    // "을지로 맥주 펍"은 어느 규칙에도 걸리지 않았고, 의미 필터가 통째로
    // 건너뛰어졌다("적용할 의미 필터 규칙 없음"). 그래서 맥주집을 찾는 요청에
    // 와인바·칵테일바·오뎅바가 10건 중 5건을 차지했다.
    intent: "FOOD",
    requestKeywords: /술집|맥주|호프|펍|포차|이자카야|와인|칵테일|위스키|사케|한잔|바텐더/iu,
    hardRejectSignals: [
      {
        label: "술을 팔지 않는 업종 신호",
        pattern: /커피전문점|디저트카페|베이커리|제과점|분식|김밥/iu,
        allowedWhenRequestMentions: /카페|커피|디저트|베이커리|분식|김밥/iu,
      },
    ],
    softPenaltySignals: [],
  },
];

/**
 * 음식 계열. 요청이 특정 음식을 지목했는지, 후보가 무엇을 파는지 판정하는 데 같이 쓴다.
 *
 * `회`처럼 짧은 글자는 패턴에 넣지 않는다. "회기 곱창"의 "회기", "회식"까지 횟집으로
 * 잡아버린다. 한국어는 JS의 `\b`(ASCII 단어경계)로 잘라낼 수 없으므로, 애초에
 * 오인될 수 없는 길이의 어휘만 쓴다.
 */
type DishFamily = {
  label: string;
  pattern: RegExp;
};

const DISH_FAMILIES: DishFamily[] = [
  { label: "곱창/막창", pattern: /곱창|막창|대창|양깃머리/iu },
  { label: "분식/김밥", pattern: /김밥|분식|떡볶이|순대|라면|만두|튀김/iu },
  { label: "마라/중식", pattern: /마라탕|마라샹궈|훠궈|중식|중국집|짜장|짬뽕|양꼬치|딤섬/iu },
  { label: "초밥/횟집", pattern: /초밥|스시|횟집|물회|사시미|참치|해산물/iu },
  // "회기역 이자카야" 요청에 홍익돈까스·경양카츠·금화왕돈까스·멘지가 10건 중 4건을
  // 차지했다. 이자카야는 술집이고 돈까스집은 밥집이라 목적이 다른데, 계열 목록에
  // 돈까스·면류가 없어 "업종 미상"으로 빠져나갔다.
  { label: "돈가스/면류", pattern: /돈가스|돈까스|카츠|라멘|라면|우동|소바|덮밥|규동|칼국수/iu },
  { label: "피자/파스타", pattern: /피자|파스타|스테이크|리조또|이탈리/iu },
  { label: "치킨", pattern: /치킨|닭강정|후라이드|양념통닭/iu },
  { label: "버거/샌드위치", pattern: /버거|샌드위치|핫도그|토스트/iu },
  { label: "국밥/탕", pattern: /국밥|설렁탕|해장국|감자탕|삼계탕|추어탕|칼국수/iu },
  // 카카오는 고깃집을 "음식점 > 한식 > 육류,고기"로 분류한다. `고깃집`만 보면
  // 새마을식당·고기굽는방앗간 같은 곳이 "업종 미상"으로 빠져나가, 곱창 요청에
  // 일반 고깃집이 10건 중 4건까지 섞였다. 곱창집은 태그에 곱창이 함께 있어
  // 요청 계열로 먼저 걸리므로 이 확장에 영향받지 않는다.
  {
    label: "구이/고깃집",
    pattern: /삼겹살|목살|갈비|우삼겹|고깃집|숯불|족발|보쌈|육류|고기/iu,
  },
  { label: "카페/디저트", pattern: /카페|커피|디저트|베이커리|빵집|제과/iu },
  // 주종도 같은 방식으로 가른다. "맥주 펍"을 찾는데 와인바가 나오는 건
  // "곱창"을 찾는데 김밥집이 나오는 것과 같은 종류의 어긋남이다.
  { label: "맥주/펍", pattern: /맥주|호프|펍\b|비어|브루어리|브루펍|생맥/iu },
  { label: "와인", pattern: /와인바|와인/iu },
  { label: "칵테일/위스키", pattern: /칵테일|위스키|하이볼바/iu },
  // 카카오는 이자카야를 "일본식주점"이나 "일본선술집"으로도 분류한다.
  { label: "이자카야/사케", pattern: /이자카야|일본식주점|일본선술집|선술집|사케|하이볼/iu },
  { label: "포차/실내포장마차", pattern: /포차|포장마차/iu },
];

/** 음식·음료를 파는 곳이라는 최소 신호. 카카오 업종 분류에서 흔히 쓰이는 말들이다. */
const FOOD_OR_DRINK_CATEGORY =
  /음식점|식당|맛집|카페|커피|디저트|베이커리|제과|빵|술집|호프|주점|포차|이자카야|와인바|칵테일바|간식|분식|한식|중식|일식|양식|아시아음식|뷔페|치킨|피자|패스트푸드|음식|요리|주류/iu;

/**
 * 업종 정보는 있는데 그 안에 음식·음료 신호가 하나도 없는 후보.
 *
 * **상호명은 보지 않는다.** `프린트카페`처럼 이름에만 "카페"가 들어간 인쇄소가
 * 스스로를 구제해 버린다. 업종을 아예 모르는 후보(업종 정보가 비어 있는 경우)는
 * 판단하지 않는다 — 정보가 부실한 걸 가게 탓으로 돌려 떨어뜨리면 안 된다.
 */
const isNonFoodBusiness = (evidence: CandidateScoringEvidence): boolean => {
  const categoryText = [
    evidence.category.mainCategory,
    evidence.category.subCategory,
    ...evidence.category.tags,
  ]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .trim();

  if (categoryText.length === 0) return false;
  return !FOOD_OR_DRINK_CATEGORY.test(categoryText);
};

/**
 * 요청이 업종을 지목했는가. "회기 곱창"은 참, "다 같이 저녁 먹을 곳"은 거짓이다.
 *
 * 지목한 요청과 포괄적인 요청은 좋은 결과의 모양이 다르다. 전자는 그 업종으로
 * 채우는 게 맞고, 후자는 골라볼 수 있게 여러 업종이 섞여야 한다.
 */
export const requestNamesDishFamily = (request: string): boolean => {
  const normalized = normalizeText(request);
  return DISH_FAMILIES.some((family) => family.pattern.test(normalized));
};

/**
 * 요청한 음식과 후보의 관계. 조사 순서를 정할 때 쓴다.
 *
 *   1  요청한 음식을 취급하는 신호가 있다
 *   0  요청에 특정 음식이 없거나, 후보 업종을 판단할 수 없다
 *  -1  다른 음식의 전문점이다
 *
 * 의미 게이트는 점수만 깎을 뿐 후보를 버리지 않는다. 그런데 조사(enrichment)는
 * 예산이 정해져 있어서 앞쪽 후보만 보고 끝난다. 순서가 뒤섞여 있으면 요청과
 * 무관한 가게를 조사하느라 정작 맞는 가게가 조사되지 못한 채 잘린다.
 */
export const scoreDishAffinity = (request: string, candidateText: string): number => {
  const normalizedRequest = normalizeText(request);
  const requested = DISH_FAMILIES.filter((family) => family.pattern.test(normalizedRequest));
  if (requested.length === 0) return 0;

  const normalizedCandidate = normalizeText(candidateText);
  const compact = normalizedCandidate.replace(/\s/gu, "");
  const matches = (family: DishFamily): boolean =>
    family.pattern.test(normalizedCandidate) || family.pattern.test(compact);

  if (requested.some(matches)) return 1;

  const requestedLabels = new Set(requested.map((family) => family.label));
  const servesOther = DISH_FAMILIES.some(
    (family) => !requestedLabels.has(family.label) && matches(family),
  );
  return servesOther ? -1 : 0;
};

/**
 * 요청한 음식과 다른 음식의 전문점일 때만 잡아낸다.
 *
 * "회기 곱창"에 김밥집(진김밥, 김가네)과 마라탕집이 상위로 올라오던 문제. 기존
 * 규칙은 카페·술집만 걸러서, 같은 "음식점"끼리의 어긋남은 그대로 통과했다.
 *
 * 후보가 **다른 계열임이 확인될 때만** 감점한다. 카카오 카테고리가 "음식점 > 한식"
 * 정도로만 붙은 가게는 아무 계열에도 걸리지 않는데, 그런 후보까지 떨어뜨리면
 * 정보가 부실하다는 이유로 멀쩡한 가게를 버리게 된다.
 */
const findDishMismatch = (request: string, candidateText: string): string | undefined => {
  const requested = DISH_FAMILIES.filter((family) => family.pattern.test(request));
  if (requested.length === 0) return undefined;

  const compact = candidateText.replace(/\s/gu, "");
  const servesRequested = requested.some(
    (family) => family.pattern.test(candidateText) || family.pattern.test(compact),
  );
  if (servesRequested) return undefined;

  const requestedLabels = new Set(requested.map((family) => family.label));
  const candidateFamilies = DISH_FAMILIES.filter(
    (family) =>
      !requestedLabels.has(family.label) &&
      (family.pattern.test(candidateText) || family.pattern.test(compact)),
  );
  if (candidateFamilies.length === 0) return undefined;

  return `요청한 ${[...requestedLabels].join("/")} 대신 ${candidateFamilies
    .map((family) => family.label)
    .join(", ")} 신호`;
};

/** 요청이 붐비지 않는 곳을 원한다는 신호. */
const CALM_REQUEST = /조용|한적|아늑|차분|잔잔|작업|공부|노트북|집중|프라이빗|한산/iu;

/** 그 동네에 지점이 여럿인 브랜드. 지점명을 뗀 이름을 키로 쓴다. */
export type ChainBrands = ReadonlySet<string>;

/**
 * 지점명을 떼어낸 브랜드 이름. "스타벅스 강남GT타워점" → "스타벅스"
 *
 * `evaluateSeeds/index.ts`의 최종 선택에서 쓰는 것과 같은 규칙이다. 여기서는
 * 브랜드 빈도를 세는 데 쓴다.
 */
export const toSemanticBrandKey = (name: string): string => {
  const trimmed = name.replace(/\s+/gu, " ").trim().replace(/\s*\[[^\]]*\]\s*$/u, "");
  // 지점명이 두 단어인 경우가 흔하다("디저트39 **강남 테헤란로점**", "태성골뱅이 **신사 낙원점**").
  // 한 단어만 떼면 브랜드가 "디저트39 강남"으로 남아 같은 브랜드끼리 묶이지 않는다.
  const withoutBranch = trimmed
    .replace(
      /\s+(?:[가-힣A-Za-z0-9]+\s+)?[가-힣A-Za-z0-9]*(?:본점|직영점|\d+호점|역사점|지하상가점|역점|점)$/u,
      "",
    )
    .trim();

  return (withoutBranch.length >= 2 ? withoutBranch : trimmed).toLowerCase();
};

/**
 * 검색 반경 안에 지점이 여럿인 브랜드를 찾는다.
 *
 * 예전에는 프랜차이즈를 상호 목록(`스타벅스|투썸|…`)으로 판정했다. 목록은 계속
 * 늘어나고 늘 뒤처진다 — 실측에서 폴바셋·텐퍼센트커피·헤이티가 빠져 "조용한 카페"
 * 결과에 그대로 들어왔고, 목록을 채우자 이번엔 백미당·디저트39가 남았다.
 *
 * 후보 풀에서 같은 브랜드가 여러 번 나오면 그 자체가 체인이라는 근거다. 실측에서
 * 강남역 후보 118건 중 스타벅스 6·바나프레소 3·커피빈 3·디저트39 3·폴바셋 2·투썸 2·
 * 백미당 2·메가MGC 2·컴포즈 2·아티제 2가 이 방식만으로 전부 잡혔고, 이태원 비건
 * 후보 29건에서는 하나도 걸리지 않았다(오탐 0).
 *
 * 게다가 이 신호는 지역을 안다. "그 동네에서 붐비는 브랜드"가 애초에 우리가 피하려던
 * 것이고, 새 브랜드가 생겨도 목록을 고칠 필요가 없다.
 */
export const findChainBrands = (names: readonly string[]): ChainBrands => {
  const counts = new Map<string, number>();
  for (const name of names) {
    const key = toSemanticBrandKey(name);
    if (key.length === 0) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return new Set(
    [...counts.entries()].filter(([, count]) => count >= 2).map(([brand]) => brand),
  );
};

export const assessSemanticFit = (
  evidence: CandidateScoringEvidence,
  chainBrands: ChainBrands = new Set(),
): SemanticFitAssessment => {
  const request = normalizeText(evidence.userFit.naturalLanguageRequest);
  const requestedIntent = inferRequestedIntent(request);
  const base = {
    requestedIntent,
    positiveSignals: getPositiveSignals(evidence),
  };

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
  const matches = (signal: SemanticSignal): boolean => {
    if (signal.appliesWhenRequestMentions && !signal.appliesWhenRequestMentions.test(request)) {
      return false;
    }
    if (signal.allowedWhenRequestMentions.test(request)) return false;
    // 공백을 지운 형태로도 검사한다. "고양이 카페"처럼 띄어쓰기가 들어가면
    // `/고양이카페/`가 매칭되지 않던 구멍이 있었다.
    const text = toSignalText(candidateText, signal.label);
    return signal.pattern.test(text) || signal.pattern.test(text.replace(/\s/gu, ""));
  };

  // 먹고 마시러 가는 요청인데 후보가 음식·음료 업종이 아예 아닌 경우.
  //
  // "강남역 조용한 카페" 결과에 `프린트카페 강남역지하상가점`(서비스 > 산업 > 인쇄,복사)이
  // 들어왔다. 상호에 "카페"가 들어갔을 뿐 인쇄소다. 업종별 예외 패턴을 하나씩 늘리는
  // 대신, 음식·음료 신호가 하나도 없으면 걸러 이런 부류를 통째로 막는다.
  if (isNonFoodBusiness(evidence)) {
    return {
      ...base,
      status: "PENALIZE",
      score: 0.1,
      severity: "STRONG",
      reason: `${rule.intent} 요청이지만 후보에 음식·음료 업종 신호가 전혀 없음`,
      negativeSignals: ["비음식 업종 신호"],
    };
  }

  const negativeSignals = rule.hardRejectSignals.filter(matches).map((signal) => signal.label);
  if (negativeSignals.length > 0) {
    return {
      ...base,
      status: "PENALIZE",
      score: 0.1,
      severity: "STRONG",
      reason: `${rule.intent} 요청이지만 후보가 ${negativeSignals.join(", ")}를 강하게 포함함`,
      negativeSignals,
    };
  }

  // 붐비지 않는 곳을 찾는데 후보가 그 동네에 지점이 여럿인 브랜드인 경우.
  // 어떤 브랜드가 체인인지는 목록이 아니라 후보 풀의 빈도로 판정한다.
  const isCrowdedChain =
    CALM_REQUEST.test(request) && chainBrands.has(toSemanticBrandKey(evidence.name));

  const dishMismatch = findDishMismatch(request, candidateText);
  const softPenaltySignals = [
    ...rule.softPenaltySignals.filter(matches).map((signal) => signal.label),
    ...(dishMismatch ? [dishMismatch] : []),
    ...(isCrowdedChain ? ["이 동네에 지점이 여럿인 브랜드 신호"] : []),
  ];
  if (softPenaltySignals.length > 0) {
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

export const getSemanticScoreAdjustment = ({
  severity,
  score,
}: SemanticFitAssessment): SemanticScoreAdjustment => {
  if (severity === "NONE") return { appliedPenalty: 0 };
  if (severity === "STRONG") return { appliedPenalty: 45, scoreCap: 55 };
  return {
    appliedPenalty: Math.round((1 - score) * 35),
    scoreCap: 75,
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

/**
 * "타로 밀크티"처럼 메뉴명에 들어간 단어가 업종 신호로 오인되는 경우를 걷어낸다.
 */
const toSignalText = (candidateText: string, signalLabel: string): string => {
  if (signalLabel !== "타로/운세 서비스업 신호") return candidateText;

  return candidateText
    .replace(/타로\s*(?:밀크\s*티|밀크티|버블\s*티|버블티|티|라떼|스무디|음료|펄)/giu, " ")
    .replace(/(?:밀크\s*티|밀크티|버블\s*티|버블티|티|라떼|스무디|음료|펄)\s*타로/giu, " ");
};
