import type {
  DailyOperationInfo,
  OperationInfo,
  PlaceRecommendationItem,
} from "@monorepo/recommendation-engine/v1/contracts";

import type { CourseInput } from "../contracts.js";

/**
 * 코스 엔진 수동 확인용 목 데이터.
 *
 * 홍대/연남/합정/연희 일대 실제 좌표를 쓴다. 이동 시간 매트릭스를 주입하지 않으면
 * 직선거리 추정이 실제 도보 시간과 비슷하게 나오도록 하기 위함이다.
 *
 * 이번에 추가된 처리들이 전부 걸리도록 구성했다:
 * - 자정 넘겨 영업 (와인바 02:00 마감, 이자카야 01:00 마감)
 * - 라스트 오더 (파스타집, 오마카세, 이자카야)
 * - 브레이크 타임 (국밥집 15:00~17:00)
 * - 영업시간 미확인 (경의선숲길)
 * - 늦은 개장 (전시관 12:00)
 * - 가격 편차 (국밥 1만원 ~ 오마카세 12만원)
 * - 카테고리 다양성 (식당/카페/전시/공원/쇼핑/술집/체험)
 */

const openDay = (
  open: string,
  close: string,
  extras: { breakTimes?: { start: string; end: string }[]; lastOrderTime?: string } = {},
): DailyOperationInfo => ({
  status: "OPEN",
  open,
  close,
  breakTimes: extras.breakTimes ?? [],
  ...(extras.lastOrderTime === undefined ? {} : { lastOrderTime: extras.lastOrderTime }),
});

const everyDay = (daily: DailyOperationInfo): OperationInfo => ({
  timezone: "Asia/Seoul",
  schedules: {
    MONDAY: daily,
    TUESDAY: daily,
    WEDNESDAY: daily,
    THURSDAY: daily,
    FRIDAY: daily,
    SATURDAY: daily,
    SUNDAY: daily,
  },
});

const unknownHours: OperationInfo = {
  timezone: "Asia/Seoul",
  schedules: {
    MONDAY: { status: "UNKNOWN" },
    TUESDAY: { status: "UNKNOWN" },
    WEDNESDAY: { status: "UNKNOWN" },
    THURSDAY: { status: "UNKNOWN" },
    FRIDAY: { status: "UNKNOWN" },
    SATURDAY: { status: "UNKNOWN" },
    SUNDAY: { status: "UNKNOWN" },
  },
};

type PlaceSeed = {
  id: string;
  name: string;
  mainCategory: string;
  subCategory: string;
  tags: string[];
  contentSummary: string;
  lat: number;
  lng: number;
  roadAddressKo: string;
  priceRangePerPerson: [number, number];
  score: number;
  operationInfo: OperationInfo;
};

const SEEDS: PlaceSeed[] = [
  {
    id: "pasta",
    name: "연남 파스타집",
    mainCategory: "식당",
    subCategory: "이탈리안",
    tags: ["파스타", "와인페어링", "데이트"],
    // "바질"의 '바'가 술집으로 오분류되던 케이스. 이제 카테고리만 보므로 영향이 없다.
    contentSummary: "바질 페스토 파스타와 하우스 와인이 유명한 연남동 이탈리안 레스토랑입니다.",
    lat: 37.5626,
    lng: 126.9256,
    roadAddressKo: "서울 마포구 연남로 30",
    priceRangePerPerson: [25_000, 40_000],
    score: 88,
    operationInfo: everyDay(openDay("11:30", "22:00", { lastOrderTime: "21:00" })),
  },
  {
    id: "gukbap",
    name: "홍대 순대국밥",
    mainCategory: "식당",
    subCategory: "한식",
    tags: ["국밥", "혼밥", "빠른회전"],
    contentSummary: "24시간 가까이 운영하는 홍대 대표 순대국밥집입니다.",
    lat: 37.5558,
    lng: 126.9234,
    roadAddressKo: "서울 마포구 어울마당로 62",
    priceRangePerPerson: [9_000, 13_000],
    score: 79,
    // 브레이크 타임이 있는 케이스.
    operationInfo: everyDay(
      openDay("09:00", "22:00", { breakTimes: [{ start: "15:00", end: "17:00" }] }),
    ),
  },
  {
    id: "omakase",
    name: "연희동 오마카세",
    mainCategory: "식당",
    subCategory: "일식",
    tags: ["오마카세", "예약제", "코스요리"],
    contentSummary: "제철 재료로 구성한 15코스 오마카세를 내는 연희동 예약제 스시야입니다.",
    lat: 37.5688,
    lng: 126.9308,
    roadAddressKo: "서울 서대문구 연희로 132",
    priceRangePerPerson: [90_000, 150_000],
    score: 94,
    // 라스트오더 20:00, 마감 22:00 -> 가게가 스스로 "주문 후 120분"이라고 말한다.
    operationInfo: everyDay(openDay("12:00", "22:00", { lastOrderTime: "20:00" })),
  },
  {
    id: "rooftop",
    name: "루프탑 디저트 카페",
    mainCategory: "카페",
    subCategory: "디저트",
    tags: ["루프탑", "야경", "케이크"],
    contentSummary: "한강과 홍대 야경이 보이는 루프탑 디저트 카페입니다.",
    lat: 37.5571,
    lng: 126.9245,
    roadAddressKo: "서울 마포구 홍익로 20",
    priceRangePerPerson: [9_000, 18_000],
    score: 90,
    operationInfo: everyDay(openDay("11:00", "23:00")),
  },
  {
    id: "roastery",
    name: "연남 로스터리",
    mainCategory: "카페",
    subCategory: "커피숍",
    tags: ["스페셜티", "조용한", "작업하기좋은"],
    contentSummary: "직접 로스팅한 싱글오리진을 내리는 작은 연남동 커피 바입니다.",
    lat: 37.5612,
    lng: 126.9268,
    roadAddressKo: "서울 마포구 성미산로 161",
    priceRangePerPerson: [5_000, 9_000],
    score: 85,
    operationInfo: everyDay(openDay("09:00", "21:00")),
  },
  {
    id: "gallery",
    name: "미디어아트 전시관",
    mainCategory: "전시",
    subCategory: "미디어아트",
    tags: ["몰입형전시", "사진촬영", "실내"],
    contentSummary: "대형 스크린으로 구성한 몰입형 미디어아트 상설 전시관입니다.",
    lat: 37.5545,
    lng: 126.9198,
    roadAddressKo: "서울 마포구 와우산로 94",
    priceRangePerPerson: [15_000, 20_000],
    score: 92,
    // 정오에 여는 케이스. 오전 시작 코스에서 대기 처리를 확인할 수 있다.
    operationInfo: everyDay(openDay("12:00", "20:00")),
  },
  {
    id: "forest",
    name: "경의선숲길",
    mainCategory: "공원",
    subCategory: "산책로",
    tags: ["산책", "야외", "무료"],
    contentSummary: "연남동을 가로지르는 선형 공원으로 산책하기 좋습니다.",
    lat: 37.5595,
    lng: 126.9251,
    roadAddressKo: "서울 마포구 연남동 388",
    priceRangePerPerson: [0, 0],
    score: 76,
    // 영업시간 미확인 케이스. 감점되고 tradeoffs에 표시되어야 한다.
    operationInfo: unknownHours,
  },
  {
    id: "bookshop",
    name: "독립서점 헬로인디북스",
    mainCategory: "쇼핑",
    subCategory: "서점",
    tags: ["독립출판", "조용한", "구경"],
    contentSummary: "독립출판물을 큐레이션하는 연남동 작은 서점입니다.",
    lat: 37.5638,
    lng: 126.9241,
    roadAddressKo: "서울 마포구 동교로 46길 33",
    priceRangePerPerson: [0, 25_000],
    score: 77,
    operationInfo: everyDay(openDay("13:00", "20:00")),
  },
  {
    id: "shop",
    name: "홍대 소품샵 거리",
    mainCategory: "쇼핑",
    subCategory: "소품",
    tags: ["소품", "기념품", "구경"],
    contentSummary: "아기자기한 소품샵이 모여 있는 홍대 골목입니다.",
    lat: 37.5533,
    lng: 126.9224,
    roadAddressKo: "서울 마포구 와우산로 29길",
    priceRangePerPerson: [5_000, 30_000],
    score: 70,
    operationInfo: everyDay(openDay("11:00", "21:00")),
  },
  {
    id: "winebar",
    name: "합정 내추럴 와인바",
    mainCategory: "술집",
    subCategory: "와인바",
    tags: ["내추럴와인", "분위기좋은", "심야"],
    contentSummary: "내추럴 와인과 간단한 안주를 내는 합정동 와인바입니다.",
    lat: 37.5495,
    lng: 126.9137,
    roadAddressKo: "서울 마포구 양화로 6길 12",
    priceRangePerPerson: [40_000, 70_000],
    score: 86,
    // 자정을 넘겨 영업하는 케이스. 예전에는 이런 장소가 코스에서 통째로 사라졌다.
    operationInfo: everyDay(openDay("18:00", "02:00")),
  },
  {
    id: "izakaya",
    name: "연남 이자카야",
    mainCategory: "술집",
    subCategory: "이자카야",
    tags: ["사케", "꼬치", "심야"],
    contentSummary: "사케와 꼬치구이를 내는 연남동 심야 이자카야입니다.",
    lat: 37.5619,
    lng: 126.9229,
    roadAddressKo: "서울 마포구 동교로 38길 9",
    priceRangePerPerson: [25_000, 45_000],
    score: 83,
    // 자정 넘김 + 라스트오더가 함께 걸린 케이스.
    operationInfo: everyDay(openDay("17:00", "01:00", { lastOrderTime: "00:00" })),
  },
  {
    id: "escape",
    name: "홍대 방탈출 카페",
    mainCategory: "체험",
    subCategory: "방탈출",
    tags: ["방탈출", "실내", "액티비티"],
    contentSummary: "난이도별 테마를 갖춘 홍대 방탈출 카페입니다.",
    lat: 37.5552,
    lng: 126.9256,
    roadAddressKo: "서울 마포구 홍익로 6길 20",
    priceRangePerPerson: [25_000, 30_000],
    score: 81,
    operationInfo: everyDay(openDay("11:00", "23:00")),
  },
];

const toPlace = (seed: PlaceSeed, index: number): PlaceRecommendationItem => ({
  id: seed.id,
  name: seed.name,
  phoneNumber: null,
  tags: seed.tags,
  contentSummary: seed.contentSummary,
  mainCategory: seed.mainCategory,
  subCategory: seed.subCategory,
  operationInfo: seed.operationInfo,
  availabilityAtRequestedTime: {
    status: "OPEN",
    requestedDateISO: "2026-08-03",
    requestedTime24h: "12:00",
    stayDurationMinutes: 60,
    reason: "목 데이터 기준 방문 가능합니다.",
  },
  referenceUrls: { kakaoMap: `https://place.map.kakao.com/${1_000_000 + index}` },
  accessibility: {
    score: 80,
    distanceMeters: 500,
    perOrigin: [{ originId: "host", distanceMeters: 500 }],
  },
  location: {
    lat: seed.lat,
    lng: seed.lng,
    placeName: seed.name,
    roadAddressKo: seed.roadAddressKo,
  },
  priceRangePerPerson: seed.priceRangePerPerson,
  priceRangeSource: "CATEGORY_ESTIMATE",
  score: seed.score,
  scoreBreakdown: {
    inputMatch: seed.score,
    trust: seed.score,
    accessibility: 80,
    diversity: 80,
    total: seed.score,
  },
  reasons: [`${seed.mainCategory} 카테고리 상위 추천 장소입니다.`],
});

export const MOCK_PLACES: PlaceRecommendationItem[] = SEEDS.map(toPlace);

export const MOCK_SCENARIOS = {
  /** 점심부터 저녁까지 이어지는 기본 데이트 코스. */
  lunch: {
    dateISO: "2026-08-03",
    startTime24h: "11:00",
    totalDurationMinutes: 480,
    numberOfPeople: 2,
  },
  /** 밤 코스. 자정을 넘겨 영업하는 술집이 실제로 잡히는지 확인한다. */
  night: {
    dateISO: "2026-08-03",
    startTime24h: "19:00",
    totalDurationMinutes: 420,
    numberOfPeople: 2,
  },
  /** 예산이 빠듯한 코스. 오마카세 같은 고가 장소가 밀려나야 한다. */
  budget: {
    dateISO: "2026-08-03",
    startTime24h: "12:00",
    totalDurationMinutes: 360,
    numberOfPeople: 2,
    budgetPerPersonWon: [40_000, 40_000],
  },
  /** 6명 단체. 식사/술자리 체류가 늘어나야 한다. */
  group: {
    dateISO: "2026-08-03",
    startTime24h: "17:00",
    totalDurationMinutes: 420,
    numberOfPeople: 6,
  },
  /** 여유로운 페이스. 장소를 늘리는 대신 오래 머물러야 한다. */
  relaxed: {
    dateISO: "2026-08-03",
    startTime24h: "12:00",
    totalDurationMinutes: 480,
    numberOfPeople: 2,
    pacePreference: "RELAXED",
  },
  /** 빡빡한 페이스. 짧게 여러 곳을 돌아야 한다. */
  packed: {
    dateISO: "2026-08-03",
    startTime24h: "12:00",
    totalDurationMinutes: 480,
    numberOfPeople: 2,
    pacePreference: "PACKED",
  },
} as const satisfies Record<string, Omit<CourseInput, "places">>;

export type MockScenarioName = keyof typeof MOCK_SCENARIOS;

export const isMockScenarioName = (value: string): value is MockScenarioName =>
  Object.hasOwn(MOCK_SCENARIOS, value);

export const toMockCourseInput = (scenario: MockScenarioName): CourseInput => ({
  ...MOCK_SCENARIOS[scenario],
  places: MOCK_PLACES,
});
