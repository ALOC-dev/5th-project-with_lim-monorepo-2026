import assert from "node:assert/strict";
import test from "node:test";

import type { PlaceRecommendationItem } from "@monorepo/recommendation-engine/v1/contracts";

import {
  type CourseCurationClient,
  type CourseInput,
  CourseRecommendationEngine,
  createCourseRecommendationEngine,
  createCalibratedTmapMatrixClient,
  DEFAULT_COURSE_ENGINE_CONFIG,
  estimateStayDeterministically,
  toCoursePersistencePayloads,
  toDistanceMeters,
  type TravelMatrixClient,
  withLlmTypical,
} from "./index.js";

/**
 * 도보 이동 시간을 고정한 계측 클라이언트. 도보는 대칭이므로 한 방향만 적어도
 * 양방향에 같은 값이 들어간다.
 */
const walkMatrix = (...legs: [string, string, number][]): TravelMatrixClient => {
  const minutesByPlaceId: Record<string, Record<string, number>> = {};
  for (const [from, to, minutes] of legs) {
    (minutesByPlaceId[from] ??= {})[to] = minutes;
    (minutesByPlaceId[to] ??= {})[from] = minutes;
  }

  return () => Promise.resolve({ minutesByPlaceId });
};

/** 후보 상위 N개를 그대로 통과시키는 큐레이터. LLM 호출 없이 결정론적으로 검증한다. */
const passthroughCuration: CourseCurationClient = ({ candidates, targetCourseCount }) =>
  Promise.resolve({
    picks: candidates.slice(0, targetCourseCount).map((candidate) => ({
      courseId: candidate.courseId,
      title: candidate.title.slice(0, 40),
      courseType: { key: "BALANCED", label: "균형형 코스", description: "테스트 큐레이션" },
      selection: {
        reasonCodes: ["BALANCED"],
        reasonTexts: ["테스트 큐레이션 근거입니다."],
        tradeoffs: [],
      },
    })),
  });

const uniformSchedules = (
  open: string,
  close: string,
): PlaceRecommendationItem["operationInfo"] => ({
  timezone: "Asia/Seoul",
  schedules: {
    MONDAY: { status: "OPEN", open, close, breakTimes: [] },
    TUESDAY: { status: "OPEN", open, close, breakTimes: [] },
    WEDNESDAY: { status: "OPEN", open, close, breakTimes: [] },
    THURSDAY: { status: "OPEN", open, close, breakTimes: [] },
    FRIDAY: { status: "OPEN", open, close, breakTimes: [] },
    SATURDAY: { status: "OPEN", open, close, breakTimes: [] },
    SUNDAY: { status: "OPEN", open, close, breakTimes: [] },
  },
});

const basePlace = (overrides: Partial<PlaceRecommendationItem>): PlaceRecommendationItem => ({
  id: "place",
  name: "장소",
  phoneNumber: null,
  tags: ["태그"],
  contentSummary: "테스트 장소입니다.",
  mainCategory: "카페",
  subCategory: "커피숍",
  operationInfo: {
    timezone: "Asia/Seoul",
    schedules: {
      MONDAY: { status: "OPEN", open: "09:00", close: "23:00", breakTimes: [] },
      TUESDAY: { status: "OPEN", open: "09:00", close: "23:00", breakTimes: [] },
      WEDNESDAY: { status: "OPEN", open: "09:00", close: "23:00", breakTimes: [] },
      THURSDAY: { status: "OPEN", open: "09:00", close: "23:00", breakTimes: [] },
      FRIDAY: { status: "OPEN", open: "09:00", close: "23:00", breakTimes: [] },
      SATURDAY: { status: "OPEN", open: "09:00", close: "23:00", breakTimes: [] },
      SUNDAY: { status: "OPEN", open: "09:00", close: "23:00", breakTimes: [] },
    },
  },
  availabilityAtRequestedTime: {
    status: "OPEN",
    requestedDateISO: "2026-08-03",
    requestedTime24h: "12:00",
    stayDurationMinutes: 60,
    reason: "열려 있습니다.",
  },
  referenceUrls: {
    kakaoMap: "https://place.map.kakao.com/1",
  },
  accessibility: {
    score: 80,
    distanceMeters: 300,
    perOrigin: [{ originId: "host", distanceMeters: 300 }],
  },
  location: {
    lat: 37.5,
    lng: 127,
    placeName: "장소",
    roadAddressKo: "서울시 테스트로 1",
  },
  priceRangePerPerson: [5_000, 15_000],
  score: 80,
  scoreBreakdown: {
    inputMatch: 80,
    trust: 80,
    accessibility: 80,
    diversity: 80,
    total: 80,
  },
  reasons: ["테스트 추천 근거"],
  ...overrides,
});

const courseInput = (places: PlaceRecommendationItem[]): CourseInput => ({
  dateISO: "2026-08-03",
  startTime24h: "11:30",
  // 식당 60 + 이동 10 + 카페 60. 여유를 0으로 둬야 체류 재분배가 개입하지 않아
  // 시각과 체류 시간을 정확히 검증할 수 있다.
  totalDurationMinutes: 130,
  places,
  numberOfPeople: 2,
});

test("recommends top courses from a subset of provided places and prefers lunch in a meal window", async () => {
  const lunch = basePlace({
    id: "lunch",
    name: "점심 식당",
    mainCategory: "식당",
    subCategory: "한식",
    score: 75,
    location: { lat: 37.501, lng: 127.001, placeName: "점심 식당", roadAddressKo: "서울시 밥로 1" },
  });
  const cafe = basePlace({
    id: "cafe",
    name: "대화하기 좋은 카페",
    score: 90,
    location: {
      lat: 37.502,
      lng: 127.002,
      placeName: "대화하기 좋은 카페",
      roadAddressKo: "서울시 카페로 2",
    },
  });
  const closedActivity = basePlace({
    id: "closed-activity",
    name: "오후 휴무 전시",
    mainCategory: "전시",
    subCategory: "미디어아트",
    score: 100,
    operationInfo: {
      timezone: "Asia/Seoul",
      schedules: {
        MONDAY: { status: "OPEN", open: "18:00", close: "21:00", breakTimes: [] },
        TUESDAY: { status: "OPEN", open: "18:00", close: "21:00", breakTimes: [] },
        WEDNESDAY: { status: "OPEN", open: "18:00", close: "21:00", breakTimes: [] },
        THURSDAY: { status: "OPEN", open: "18:00", close: "21:00", breakTimes: [] },
        FRIDAY: { status: "OPEN", open: "18:00", close: "21:00", breakTimes: [] },
        SATURDAY: { status: "OPEN", open: "18:00", close: "21:00", breakTimes: [] },
        SUNDAY: { status: "OPEN", open: "18:00", close: "21:00", breakTimes: [] },
      },
    },
  });

  const engine = new CourseRecommendationEngine(
    courseInput([cafe, closedActivity, lunch]),
    { ...DEFAULT_COURSE_ENGINE_CONFIG, targetCourseCount: 2 },
    {
      travelMatrix: walkMatrix(
        ["lunch", "cafe", 10],
        ["lunch", "closed-activity", 10],
        ["cafe", "closed-activity", 10],
      ),
    },
  );

  const result = await engine.process();

  assert.equal(result.status, "SUCCESS");
  assert.ok(result.userOutput.courses.length > 0);
  assert.deepEqual(
    result.userOutput.courses[0]?.places.map((place) => place.id),
    ["lunch", "cafe"],
  );
  assert.equal(result.userOutput.courses[0]?.mealPlan.status, "SATISFIED");
  assert.equal(
    result.userOutput.courses.some((course) =>
      course.places.some((place) => place.id === "closed-activity"),
    ),
    false,
  );
  // 인당 1만원대 식당이라 가격 배율로 70분이 아니라 60분이다.
  assert.equal(result.userOutput.courses[0]?.timeline[0]?.label, "11:30 점심 식당(60분 체류)");
  assert.equal(result.userOutput.courses[0]?.summary.estimatedCostPerPerson[0], 10_000);
  assert.equal(result.userOutput.courses[0]?.summary.estimatedTotalMinutes, 130);
  assert.equal(result.userOutput.courses[0]?.selection.reasonTexts.length, 3);
});

test("rejects inputs with more than fifteen places", async () => {
  const places = Array.from({ length: 16 }, (_, index) =>
    basePlace({ id: `place-${index}`, name: `장소 ${index}` }),
  );
  const engine = new CourseRecommendationEngine(courseInput(places), DEFAULT_COURSE_ENGINE_CONFIG);

  const result = await engine.process();

  assert.equal(result.status, "ERROR");
  assert.equal(result.error.code, "COURSE_INPUT_TOO_MANY_PLACES");
});

test("rejects inputs with fewer than two candidate places", async () => {
  const engine = createCourseRecommendationEngine({
    ...courseInput([basePlace({ id: "only", name: "유일한 후보" })]),
  });

  const result = await engine.process();

  assert.equal(result.status, "ERROR");
  assert.equal(result.error.code, "COURSE_INPUT_TOO_FEW_PLACES");
});

test("reports stable progress phases and explains every candidate decision", async () => {
  const places = [
    basePlace({ id: "first", name: "첫 후보", score: 90 }),
    basePlace({ id: "second", name: "둘째 후보", score: 85 }),
    basePlace({ id: "third", name: "셋째 후보", score: 80 }),
  ];
  const progress: string[] = [];
  const engine = createCourseRecommendationEngine(
    courseInput(places),
    DEFAULT_COURSE_ENGINE_CONFIG,
    {
      curateCourses: passthroughCuration,
      travelMatrix: walkMatrix(
        ["first", "second", 10],
        ["first", "third", 10],
        ["second", "third", 10],
      ),
      onProgress: (step) => {
        progress.push(step);
      },
    },
  );

  const result = await engine.process();

  assert.equal(result.status, "SUCCESS");
  assert.deepEqual(progress, ["measuring_travel", "generating_courses", "curating_courses"]);
  for (const course of result.userOutput.courses) {
    assert.deepEqual(
      new Set(course.candidateDecisions.map((decision) => decision.placeId)),
      new Set(places.map((place) => place.id)),
    );
    assert.equal(
      course.candidateDecisions.filter((decision) => decision.decision === "INCLUDED").length,
      course.places.length,
    );
  }
});

test("cancels an in-flight engine run with the supplied abort signal", async () => {
  const abortController = new AbortController();
  const abortReason = new Error("course job cancelled");
  const places = [
    basePlace({ id: "first", name: "첫 후보" }),
    basePlace({ id: "second", name: "둘째 후보" }),
  ];
  const travelMatrix: TravelMatrixClient = ({ signal }) =>
    new Promise((_, reject) => {
      signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
    });
  const engine = createCourseRecommendationEngine(
    courseInput(places),
    DEFAULT_COURSE_ENGINE_CONFIG,
    {
      signal: abortController.signal,
      travelMatrix,
      curateCourses: passthroughCuration,
      onProgress: (step) => {
        if (step === "measuring_travel") queueMicrotask(() => abortController.abort(abortReason));
      },
    },
  );

  await assert.rejects(engine.process(), (error) => error === abortReason);
});

test("uses measured walk minutes instead of the straight-line estimate", async () => {
  const first = basePlace({
    id: "first",
    name: "첫 장소",
    score: 90,
    location: { lat: 37.5, lng: 127, placeName: "첫 장소", roadAddressKo: "서울시 첫로 1" },
  });
  const second = basePlace({
    id: "second",
    name: "두 번째 장소",
    score: 85,
    location: {
      lat: 37.51,
      lng: 127.01,
      placeName: "두 번째 장소",
      roadAddressKo: "서울시 둘로 2",
    },
  });
  const engine = new CourseRecommendationEngine(
    {
      dateISO: "2026-08-03",
      startTime24h: "14:00",
      totalDurationMinutes: 180,
      places: [first, second],
      numberOfPeople: 2,
    },
    DEFAULT_COURSE_ENGINE_CONFIG,
    { travelMatrix: walkMatrix(["first", "second", 17]) },
  );

  const result = await engine.process();

  assert.equal(result.status, "SUCCESS");
  assert.equal(result.userOutput.courses[0]?.timeline[0]?.travelMinutesFromPrevious, 0);
  assert.equal(result.userOutput.courses[0]?.timeline[1]?.travelMinutesFromPrevious, 17);
});

test("derives the course end time from start time and total duration", async () => {
  const first = basePlace({ id: "first", name: "첫 장소", score: 80 });
  const second = basePlace({ id: "second", name: "두 번째 장소", score: 80 });
  const engine = new CourseRecommendationEngine(
    {
      dateISO: "2026-08-03",
      startTime24h: "10:00",
      totalDurationMinutes: 150,
      places: [first, second],
      numberOfPeople: 2,
    },
    DEFAULT_COURSE_ENGINE_CONFIG,
    { travelMatrix: walkMatrix(["first", "second", 10]) },
  );

  const result = await engine.process();

  assert.equal(result.status, "SUCCESS");
  assert.equal(result.userInput.startTime24h, "10:00");
  assert.equal(result.userInput.totalDurationMinutes, 150);
  assert.ok(
    result.userOutput.courses.every((course) => course.endTime24h <= "12:30"),
    "course must fit within the derived end time",
  );
});

test("applies LLM curation title and selection reasons when a curation client is provided", async () => {
  const first = basePlace({ id: "first", name: "첫 장소", score: 80 });
  const second = basePlace({ id: "second", name: "두 번째 장소", score: 80 });
  const engine = new CourseRecommendationEngine(
    {
      dateISO: "2026-08-03",
      startTime24h: "10:00",
      totalDurationMinutes: 150,
      places: [first, second],
      numberOfPeople: 2,
    },
    DEFAULT_COURSE_ENGINE_CONFIG,
    {
      travelMatrix: walkMatrix(["first", "second", 10]),
      curateCourses: async ({ candidates }) => ({
        picks: [
          {
            courseId: candidates[0]?.courseId ?? "",
            title: "LLM이 고른 짧고 선명한 코스",
            courseType: {
              key: "LOW_TRAVEL",
              label: "이동 적은 코스",
              description: "장소 간 이동 부담을 줄인 코스입니다.",
            },
            selection: {
              reasonCodes: ["LOW_TRAVEL", "SIMPLE_FLOW"],
              reasonTexts: ["이동이 짧습니다.", "두 장소 흐름이 단순합니다."],
              tradeoffs: ["장소 다양성은 낮을 수 있습니다."],
            },
          },
        ],
      }),
    },
  );

  const result = await engine.process();

  assert.equal(result.status, "SUCCESS");
  assert.equal(result.userOutput.courses[0]?.title, "LLM이 고른 짧고 선명한 코스");
  assert.equal(result.userOutput.courses[0]?.courseType.key, "LOW_TRAVEL");
  assert.deepEqual(result.userOutput.courses[0]?.selection.reasonCodes, [
    "LOW_TRAVEL",
    "SIMPLE_FLOW",
  ]);
  assert.deepEqual(result.userOutput.courses[0]?.selection.reasonTexts, [
    "이동이 짧습니다.",
    "두 장소 흐름이 단순합니다.",
  ]);
});

test("waits for opening hours instead of dropping a place that opens later", async () => {
  const early = basePlace({ id: "early", name: "일찍 여는 카페", score: 80 });
  const late = basePlace({
    id: "late",
    name: "늦게 여는 전시",
    mainCategory: "전시",
    subCategory: "미디어아트",
    score: 95,
    operationInfo: uniformSchedules("12:30", "20:00"),
  });

  const engine = new CourseRecommendationEngine(
    {
      dateISO: "2026-08-03",
      startTime24h: "11:00",
      totalDurationMinutes: 180,
      places: [early, late],
      numberOfPeople: 2,
    },
    DEFAULT_COURSE_ENGINE_CONFIG,
    {
      curateCourses: passthroughCuration,
      travelMatrix: walkMatrix(["early", "late", 10]),
    },
  );

  const result = await engine.process();

  assert.equal(result.status, "SUCCESS");
  const course = result.userOutput.courses[0];
  assert.deepEqual(
    course?.places.map((place) => place.id),
    ["early", "late"],
    "늦게 여는 장소를 버리지 않고 기다렸다 방문해야 한다",
  );
  assert.equal(course?.timeline[1]?.time24h, "12:30", "개장 시각에 도착해야 한다");
  assert.equal(course?.timeline[1]?.travelMinutesFromPrevious, 10);

  // 기본 체류(60분)로는 12:10에 도착해 20분을 그냥 서서 기다려야 한다.
  // 재분배가 그 20분을 앞 카페 체류로 흡수해 죽은 시간을 없앤다.
  assert.equal(course?.timeline[0]?.stayDurationMinutes, 80);
  assert.equal(course?.timeline[1]?.waitMinutesFromPrevious, 0);
});

test("keeps place score below saturation so course ranking stays meaningful", async () => {
  const first = basePlace({ id: "first", name: "첫 장소", score: 80 });
  const second = basePlace({ id: "second", name: "두 번째 장소", score: 80 });
  const engine = new CourseRecommendationEngine(
    {
      dateISO: "2026-08-03",
      startTime24h: "14:00",
      totalDurationMinutes: 180,
      places: [first, second],
      numberOfPeople: 2,
    },
    DEFAULT_COURSE_ENGINE_CONFIG,
    {
      curateCourses: passthroughCuration,
      travelMatrix: walkMatrix(["first", "second", 10]),
    },
  );

  const result = await engine.process();

  assert.equal(result.status, "SUCCESS");
  // 장소 평균 80점에 placeScoreWeight 0.5를 적용해 40점. 보너스가 들어갈 여유가 남는다.
  assert.equal(result.userOutput.courses[0]?.scoreBreakdown.placeScore, 40);
  assert.ok(
    (result.userOutput.courses[0]?.score ?? 100) < 100,
    "보너스를 더해도 100에 붙어버리면 안 된다",
  );
});

test("reports curation fallback reason in meta instead of swallowing the error", async () => {
  const first = basePlace({ id: "first", name: "첫 장소", score: 80 });
  const second = basePlace({ id: "second", name: "두 번째 장소", score: 80 });
  const engine = new CourseRecommendationEngine(
    {
      dateISO: "2026-08-03",
      startTime24h: "14:00",
      totalDurationMinutes: 180,
      places: [first, second],
      numberOfPeople: 2,
    },
    DEFAULT_COURSE_ENGINE_CONFIG,
    {
      travelMatrix: walkMatrix(["first", "second", 10]),
      curateCourses: () => Promise.reject(new Error("openai timeout")),
    },
  );

  const result = await engine.process();

  assert.equal(result.status, "SUCCESS");
  assert.equal(result.meta.curatedByLlm, false);
  assert.match(result.meta.curationFallbackReason ?? "", /openai timeout/);
  assert.ok(result.meta.candidateCount > 0);
  assert.ok(result.userOutput.courses.length > 0, "폴백해도 코스는 반환한다");
});

test("maps a course into course_options and course_places rows", async () => {
  const lunch = basePlace({
    id: "lunch",
    name: "점심 식당",
    mainCategory: "식당",
    subCategory: "한식",
    score: 85,
    priceRangePerPerson: [10_000, 20_000],
  });
  const cafe = basePlace({ id: "cafe", name: "디저트 카페", score: 80 });
  const engine = new CourseRecommendationEngine(
    {
      dateISO: "2026-08-03",
      startTime24h: "11:30",
      totalDurationMinutes: 130,
      places: [lunch, cafe],
      numberOfPeople: 2,
    },
    DEFAULT_COURSE_ENGINE_CONFIG,
    {
      curateCourses: passthroughCuration,
      travelMatrix: walkMatrix(["lunch", "cafe", 10]),
    },
  );

  const result = await engine.process();
  assert.equal(result.status, "SUCCESS");

  const [payload] = toCoursePersistencePayloads(result.userOutput);
  assert.ok(payload);

  assert.equal(payload.places[0]?.sequence, 1);
  assert.equal(payload.places[0]?.name, "점심 식당");
  assert.equal(payload.places[0]?.visitTime, "11:30");
  assert.equal(payload.places[0]?.stayDurationMinutes, 60);
  assert.equal(payload.places[0]?.kakaoPlaceId, "1");
  assert.equal(payload.places[0]?.favoritePlaceId, null);
  assert.equal(payload.places[0]?.source, "RECOMMENDATION");
  // category <- 무슨 장소인가, activity_type <- 거기서 무엇을 하는가
  assert.equal(payload.places[0]?.category, "한식");
  assert.equal(payload.places[0]?.activityType, "식당");
  assert.equal(payload.places[1]?.sequence, 2);

  assert.equal(payload.option.optionType, "BALANCED");
  assert.equal(payload.option.favorite, false);
  // 15,000~35,000원 범위를 단일 컬럼에 맞춰 중간값으로 접는다.
  assert.deepEqual(payload.unmapped.pricePerPersonWonRange, [15_000, 35_000]);
  assert.equal(payload.option.pricePerPersonWon, 25_000);
  assert.ok(payload.warnings.some((warning) => warning.includes("중간값")));
});

test("mirrors a one-directional walk measurement onto both directions", async () => {
  const first = basePlace({
    id: "first",
    name: "첫 장소",
    score: 80,
    location: { lat: 37.5, lng: 127, placeName: "첫 장소", roadAddressKo: "서울시 첫로 1" },
  });
  const second = basePlace({
    id: "second",
    name: "두 번째 장소",
    score: 80,
    // 직선거리로는 1km가 넘어 추정하면 13분쯤 나온다. 계측값 7분과 확실히 구분된다.
    location: {
      lat: 37.51,
      lng: 127.01,
      placeName: "두 번째 장소",
      roadAddressKo: "서울시 둘로 2",
    },
  });
  const engine = new CourseRecommendationEngine(
    {
      dateISO: "2026-08-03",
      startTime24h: "14:00",
      totalDurationMinutes: 180,
      places: [first, second],
      numberOfPeople: 2,
    },
    DEFAULT_COURSE_ENGINE_CONFIG,
    {
      curateCourses: passthroughCuration,
      // second -> first 방향만 알려준다.
      travelMatrix: () => Promise.resolve({ minutesByPlaceId: { second: { first: 7 } } }),
    },
  );

  const result = await engine.process();

  assert.equal(result.status, "SUCCESS");
  // first -> second 순서로 짜여도 반대 방향 계측값 7분이 그대로 쓰인다.
  assert.equal(result.userOutput.courses[0]?.timeline[1]?.travelMinutesFromPrevious, 7);
  assert.equal(result.meta.measuredTravelPairCount, 1);
  assert.equal(result.meta.estimatedTravelPairCount, 0);
  assert.equal(result.meta.travelMatrixFallbackReason, null);
});

test("estimates walking time from straight-line distance when no measurement is available", async () => {
  const first = basePlace({
    id: "first",
    name: "첫 장소",
    score: 80,
    location: { lat: 37.5, lng: 127, placeName: "첫 장소", roadAddressKo: "서울시 첫로 1" },
  });
  const second = basePlace({
    id: "second",
    name: "두 번째 장소",
    score: 80,
    location: {
      lat: 37.5,
      lng: 127.006,
      placeName: "두 번째 장소",
      roadAddressKo: "서울시 둘로 2",
    },
  });
  const engine = new CourseRecommendationEngine(
    {
      dateISO: "2026-08-03",
      startTime24h: "14:00",
      totalDurationMinutes: 180,
      places: [first, second],
      numberOfPeople: 2,
    },
    DEFAULT_COURSE_ENGINE_CONFIG,
    { curateCourses: passthroughCuration },
  );

  const result = await engine.process();

  assert.equal(result.status, "SUCCESS");
  // 약 530m / 61m per minute = 9분
  assert.equal(result.userOutput.courses[0]?.timeline[1]?.travelMinutesFromPrevious, 9);
  assert.equal(result.meta.measuredTravelPairCount, 0);
  assert.equal(result.meta.estimatedTravelPairCount, 1);
  assert.match(result.meta.travelMatrixFallbackReason ?? "", /No travel matrix client/);
});

test("falls back to estimates when the walk measurement client fails", async () => {
  const first = basePlace({ id: "first", name: "첫 장소", score: 80 });
  const second = basePlace({
    id: "second",
    name: "두 번째 장소",
    score: 80,
    location: { lat: 37.503, lng: 127, placeName: "두 번째 장소", roadAddressKo: "서울시 둘로 2" },
  });
  const engine = new CourseRecommendationEngine(
    {
      dateISO: "2026-08-03",
      startTime24h: "14:00",
      totalDurationMinutes: 180,
      places: [first, second],
      numberOfPeople: 2,
    },
    DEFAULT_COURSE_ENGINE_CONFIG,
    {
      curateCourses: passthroughCuration,
      travelMatrix: () => Promise.reject(new Error("tmap 503")),
    },
  );

  const result = await engine.process();

  assert.equal(result.status, "SUCCESS");
  assert.ok(result.userOutput.courses.length > 0, "계측이 실패해도 코스는 나와야 한다");
  assert.equal(result.meta.measuredTravelPairCount, 0);
  assert.match(result.meta.travelMatrixFallbackReason ?? "", /tmap 503/);
});

test("calibrates a detour factor from a few sampled pairs and estimates the rest", async () => {
  // 실제 보행 경로가 직선거리의 1.4배이고 속도가 80m/분인 가상의 동네.
  const DETOUR = 1.4;
  const METERS_PER_SECOND = 80 / 60;
  let fetchCount = 0;

  const client = createCalibratedTmapMatrixClient({
    sampleSize: 5,
    fetchLeg: (from, to) => {
      fetchCount += 1;
      const meters = toDistanceMeters(from, to) * DETOUR;
      return Promise.resolve({ meters, seconds: meters / METERS_PER_SECOND });
    },
  });

  // 장소 10개 = 45쌍. 표본 5쌍만 실측해야 한다.
  const places = Array.from({ length: 10 }, (_, index) => ({
    id: `p${index}`,
    lat: 37.55 + index * 0.001,
    lng: 126.92 + index * 0.001,
  }));

  const matrix = await client({
    places,
    maxWalkableMeters: 2_000,
    concurrency: 5,
    tmapAppKey: "test-key",
  });

  assert.equal(fetchCount, 5, "표본 5쌍만 호출해야 한다");
  assert.equal(matrix.measuredPairCount, 5);
  assert.ok(matrix.calibration);
  assert.equal(matrix.calibration.sampledPairCount, 5);
  assert.ok(
    Math.abs(matrix.calibration.detourFactor - DETOUR) < 0.01,
    `우회 계수가 ${DETOUR} 근처여야 하는데 ${matrix.calibration.detourFactor}`,
  );
  assert.ok(
    Math.abs(matrix.calibration.metersPerMinute - 80) < 1,
    `보행 속도가 80 근처여야 하는데 ${matrix.calibration.metersPerMinute}`,
  );

  // 실측하지 않은 쌍도 전부 채워져 있어야 한다.
  const first = places[0];
  const last = places[9];
  assert.ok(first && last);
  const estimated = matrix.minutesByPlaceId[first.id]?.[last.id];
  assert.ok(estimated !== undefined, "실측하지 않은 쌍도 추정값이 있어야 한다");

  // 보정계수를 직접 적용한 값과 일치해야 한다.
  const expected = Math.ceil((toDistanceMeters(first, last) * DETOUR) / 80);
  assert.equal(estimated, expected);
});

test("keeps the exact measurement for sampled pairs instead of overwriting with the estimate", async () => {
  const client = createCalibratedTmapMatrixClient({
    sampleSize: 1,
    // 직선거리와 무관하게 항상 600m / 900초(15분)를 돌려준다.
    fetchLeg: () => Promise.resolve({ meters: 600, seconds: 900 }),
  });

  const places = [
    { id: "a", lat: 37.55, lng: 126.92 },
    { id: "b", lat: 37.552, lng: 126.922 },
    { id: "c", lat: 37.554, lng: 126.924 },
  ];

  const matrix = await client({
    places,
    maxWalkableMeters: 2_000,
    concurrency: 5,
    tmapAppKey: "test-key",
  });

  assert.equal(matrix.measuredPairCount, 1);
  // 실측한 쌍은 정확히 15분이어야 한다. 표본은 거리 중앙값인 a-b 또는 b-c.
  const measuredMinutes = Object.values(matrix.minutesByPlaceId)
    .flatMap((row) => Object.values(row))
    .filter((minutes) => minutes === 15);
  assert.ok(measuredMinutes.length >= 2, "실측 쌍은 양방향 모두 15분으로 남아야 한다");
});

test("reports the calibration in meta and applies it to every leg", async () => {
  const first = basePlace({
    id: "first",
    name: "첫 장소",
    score: 80,
    location: { lat: 37.55, lng: 126.92, placeName: "첫 장소", roadAddressKo: "서울시 첫로 1" },
  });
  const second = basePlace({
    id: "second",
    name: "두 번째 장소",
    score: 80,
    location: {
      lat: 37.554,
      lng: 126.924,
      placeName: "두 번째 장소",
      roadAddressKo: "서울시 둘로 2",
    },
  });

  const engine = new CourseRecommendationEngine(
    {
      dateISO: "2026-08-03",
      startTime24h: "14:00",
      totalDurationMinutes: 180,
      places: [first, second],
      numberOfPeople: 2,
    },
    DEFAULT_COURSE_ENGINE_CONFIG,
    {
      curateCourses: passthroughCuration,
      tmapAppKey: "test-key",
      travelMatrix: createCalibratedTmapMatrixClient({
        sampleSize: 5,
        fetchLeg: (from, to) => {
          const meters = toDistanceMeters(from, to) * 1.5;
          return Promise.resolve({ meters, seconds: meters / (80 / 60) });
        },
      }),
    },
  );

  const result = await engine.process();

  assert.equal(result.status, "SUCCESS");
  assert.equal(result.meta.measuredTravelPairCount, 1);
  assert.equal(result.meta.estimatedTravelPairCount, 0);
  assert.ok(result.meta.travelCalibration);
  assert.ok(Math.abs(result.meta.travelCalibration.detourFactor - 1.5) < 0.01);
});

test("schedules places that stay open past midnight", async () => {
  const izakaya = basePlace({
    id: "izakaya",
    name: "새벽 이자카야",
    mainCategory: "술집",
    subCategory: "이자카야",
    score: 88,
    operationInfo: uniformSchedules("18:00", "02:00"),
  });
  const cafe = basePlace({ id: "cafe", name: "카페", score: 80 });

  const engine = new CourseRecommendationEngine(
    {
      dateISO: "2026-08-03",
      startTime24h: "21:00",
      totalDurationMinutes: 300,
      places: [izakaya, cafe],
      numberOfPeople: 2,
    },
    DEFAULT_COURSE_ENGINE_CONFIG,
    {
      curateCourses: passthroughCuration,
      travelMatrix: walkMatrix(["izakaya", "cafe", 10]),
    },
  );

  const result = await engine.process();

  assert.equal(result.status, "SUCCESS");
  const course = result.userOutput.courses[0];
  assert.ok(
    course?.places.some((place) => place.id === "izakaya"),
    "02:00 마감 술집이 코스에 포함되어야 한다",
  );
  // 21:00 시작 + 카페 60분 + 이동 10분 -> 22:10 이자카야 120분 -> 00:10 종료.
  // 자정을 넘겨도 26:10이 아니라 00:10으로 표기해야 한다.
  assert.match(course?.endTime24h ?? "", /^([01]\d|2[0-3]):[0-5]\d$/);
});

test("rejects arrivals after last order", async () => {
  const day = {
    status: "OPEN" as const,
    open: "11:00",
    close: "22:00",
    breakTimes: [],
    lastOrderTime: "13:00",
  };
  const withLastOrder: PlaceRecommendationItem["operationInfo"] = {
    timezone: "Asia/Seoul",
    schedules: {
      MONDAY: day,
      TUESDAY: day,
      WEDNESDAY: day,
      THURSDAY: day,
      FRIDAY: day,
      SATURDAY: day,
      SUNDAY: day,
    },
  };

  const restaurant = basePlace({
    id: "restaurant",
    name: "라스트오더 이른 식당",
    mainCategory: "식당",
    subCategory: "한식",
    score: 95,
    operationInfo: withLastOrder,
  });
  const cafe = basePlace({ id: "cafe", name: "카페", score: 70 });

  // 18:00 시작이면 식당 라스트오더 13:00을 한참 넘긴다.
  const engine = new CourseRecommendationEngine(
    {
      dateISO: "2026-08-03",
      startTime24h: "18:00",
      totalDurationMinutes: 240,
      places: [restaurant, cafe],
      numberOfPeople: 2,
    },
    DEFAULT_COURSE_ENGINE_CONFIG,
    { curateCourses: passthroughCuration, travelMatrix: walkMatrix(["restaurant", "cafe", 10]) },
  );

  const result = await engine.process();

  // 점수가 훨씬 높은데도 라스트오더 때문에 배치될 수 없어 코스가 성립하지 않는다.
  assert.equal(result.status, "ERROR");
  assert.equal(result.error.code, "COURSE_NO_FEASIBLE_COURSES");
});

const stayOptions = {
  dayOfWeek: "MONDAY" as const,
  numberOfPeople: 2,
  largeGroupThreshold: DEFAULT_COURSE_ENGINE_CONFIG.largeGroupThreshold,
  largeGroupExtraStayMinutes: DEFAULT_COURSE_ENGINE_CONFIG.largeGroupExtraStayMinutes,
  pace: "NORMAL" as const,
};

test("classifies stay duration from categories, not from the free-text summary", () => {
  const plain = basePlace({
    id: "pasta",
    mainCategory: "식당",
    subCategory: "이탈리안",
    contentSummary: "트러플 파스타가 유명한 곳입니다.",
    priceRangePerPerson: [20_000, 30_000],
  });
  // "바질"의 '바'가 술집 패턴에 걸려 체류가 120분으로 튀던 케이스.
  const withBasil = basePlace({
    ...plain,
    contentSummary: "바질 페스토 파스타가 유명한 곳입니다.",
  });

  assert.equal(estimateStayDeterministically(plain, stayOptions).kind, "MEAL");
  assert.equal(estimateStayDeterministically(withBasil, stayOptions).kind, "MEAL");
  assert.equal(
    estimateStayDeterministically(withBasil, stayOptions).range.typical,
    estimateStayDeterministically(plain, stayOptions).range.typical,
    "설명 문구는 체류 시간에 영향을 주면 안 된다",
  );
});

test("scales seated stay by price band", () => {
  const cheap = basePlace({
    mainCategory: "식당",
    subCategory: "한식",
    priceRangePerPerson: [8_000, 12_000],
  });
  const mid = basePlace({
    mainCategory: "식당",
    subCategory: "한식",
    priceRangePerPerson: [20_000, 30_000],
  });
  const omakase = basePlace({
    mainCategory: "식당",
    subCategory: "일식",
    priceRangePerPerson: [90_000, 150_000],
  });
  // 카페는 가격과 체류 시간의 상관이 약해 배율을 적용하지 않는다.
  const pricyCafe = basePlace({ priceRangePerPerson: [90_000, 150_000] });
  const plainCafe = basePlace({ priceRangePerPerson: [5_000, 8_000] });

  const typical = (place: PlaceRecommendationItem) =>
    estimateStayDeterministically(place, stayOptions).range.typical;

  assert.ok(typical(cheap) < typical(mid), "저렴한 식당은 더 짧게");
  assert.ok(typical(mid) < typical(omakase), "고가 식당은 더 길게");
  assert.equal(typical(pricyCafe), typical(plainCafe), "카페는 가격 영향을 받지 않는다");
});

test("prefers the venue's own last-order signal over category and price", () => {
  const day = {
    status: "OPEN" as const,
    open: "11:00",
    close: "22:00",
    breakTimes: [],
    lastOrderTime: "20:30",
  };
  const place = basePlace({
    mainCategory: "식당",
    subCategory: "한식",
    priceRangePerPerson: [20_000, 30_000],
    operationInfo: {
      timezone: "Asia/Seoul",
      schedules: {
        MONDAY: day,
        TUESDAY: day,
        WEDNESDAY: day,
        THURSDAY: day,
        FRIDAY: day,
        SATURDAY: day,
        SUNDAY: day,
      },
    },
  });

  const estimate = estimateStayDeterministically(place, stayOptions);
  // 라스트오더 20:30, 마감 22:00 -> 가게가 스스로 "주문 후 90분"이라고 말하는 값.
  assert.equal(estimate.source, "LAST_ORDER");
  assert.equal(estimate.range.typical, 90);
});

test("extends seated stay for large groups", () => {
  const meal = basePlace({
    mainCategory: "식당",
    subCategory: "한식",
    priceRangePerPerson: [20_000, 30_000],
  });

  const small = estimateStayDeterministically(meal, stayOptions).range.typical;
  const large = estimateStayDeterministically(meal, { ...stayOptions, numberOfPeople: 6 }).range
    .typical;

  assert.equal(large - small, DEFAULT_COURSE_ENGINE_CONFIG.largeGroupExtraStayMinutes);
});

test("scales the whole stay range by pace preference", () => {
  const cafe = basePlace({});
  const normal = estimateStayDeterministically(cafe, stayOptions).range;
  const relaxed = estimateStayDeterministically(cafe, { ...stayOptions, pace: "RELAXED" }).range;
  const packed = estimateStayDeterministically(cafe, { ...stayOptions, pace: "PACKED" }).range;

  assert.ok(relaxed.typical > normal.typical);
  assert.ok(packed.typical < normal.typical);
  // 상한도 함께 올라가야 코스 확정 후 재분배에서 실제로 더 머물 수 있다.
  assert.ok(relaxed.max > normal.max);
});

test("clamps an LLM stay estimate into the category range", () => {
  const cafe = basePlace({});
  const base = estimateStayDeterministically(cafe, stayOptions);

  assert.equal(withLlmTypical(base, 75).range.typical, 75);
  // 범위를 벗어난 응답은 잘라낸다. LLM이 이상한 값을 줘도 일정이 망가지지 않는다.
  assert.equal(withLlmTypical(base, 9_999).range.typical, base.range.max);
  assert.equal(withLlmTypical(base, 1).range.typical, base.range.min);
  assert.equal(withLlmTypical(base, 75).source, "LLM");
});

test("redistributes leftover time into stays instead of leaving the course short", async () => {
  const places = [
    basePlace({
      id: "meal",
      name: "식당",
      mainCategory: "식당",
      subCategory: "한식",
      score: 90,
      priceRangePerPerson: [20_000, 30_000],
    }),
    basePlace({ id: "cafe", name: "카페", score: 88 }),
  ];

  const run = async (totalDurationMinutes: number) => {
    const engine = new CourseRecommendationEngine(
      {
        dateISO: "2026-08-03",
        startTime24h: "12:00",
        totalDurationMinutes,
        places,
        numberOfPeople: 2,
      },
      DEFAULT_COURSE_ENGINE_CONFIG,
      { curateCourses: passthroughCuration, travelMatrix: walkMatrix(["meal", "cafe", 10]) },
    );
    const result = await engine.process();
    assert.equal(result.status, "SUCCESS");
    return result.userOutput.courses[0];
  };

  // 기본 체류(식당 70 + 카페 60) + 이동 10 = 140분이면 여유가 없다.
  const tight = await run(140);
  // 240분을 요청하면 남는 100분을 두 장소에 나눠 넣어야 한다.
  const roomy = await run(240);

  const tightStay = tight?.totalStayMinutes ?? 0;
  const roomyStay = roomy?.totalStayMinutes ?? 0;
  assert.ok(roomyStay > tightStay, "여유 시간이 있으면 체류를 늘려야 한다");
  assert.equal(roomy?.places.length, 2, "장소를 억지로 추가하지 않는다");

  // 한 곳에 몰아주지 않고 고르게 나눠야 한다.
  const stays = roomy?.timeline.map((item) => item.stayDurationMinutes) ?? [];
  const [first = 0, second = 0] = stays;
  assert.ok(Math.abs(first - second) <= 30, `체류가 한쪽에 치우쳤다: ${JSON.stringify(stays)}`);
});

test("penalises places with unknown opening hours and flags them as a tradeoff", async () => {
  const known = basePlace({ id: "known", name: "확인된 카페", score: 80 });
  const unknown = basePlace({
    id: "unknown",
    name: "영업시간 미확인 카페",
    score: 80,
    operationInfo: {
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
    },
  });

  const engine = new CourseRecommendationEngine(
    {
      dateISO: "2026-08-03",
      startTime24h: "14:00",
      totalDurationMinutes: 240,
      places: [known, unknown],
      numberOfPeople: 2,
    },
    DEFAULT_COURSE_ENGINE_CONFIG,
    { curateCourses: passthroughCuration, travelMatrix: walkMatrix(["known", "unknown", 10]) },
  );

  const result = await engine.process();

  assert.equal(result.status, "SUCCESS");
  const course = result.userOutput.courses[0];
  assert.equal(course?.scoreBreakdown.unknownHours, -5);
  assert.ok(
    course?.selection.tradeoffs.some((text) => text.includes("영업시간이 확인되지 않은")),
    "감안할 점에 표시되어야 한다",
  );
});

test("scores a course against the budget when one is given", async () => {
  const cheap = basePlace({
    id: "cheap",
    name: "저렴한 곳",
    score: 80,
    priceRangePerPerson: [5_000, 10_000],
  });
  const pricey = basePlace({
    id: "pricey",
    name: "비싼 곳",
    score: 80,
    priceRangePerPerson: [80_000, 120_000],
  });

  const withBudget = async (budgetPerPersonWon?: number) => {
    const engine = new CourseRecommendationEngine(
      {
        dateISO: "2026-08-03",
        startTime24h: "14:00",
        totalDurationMinutes: 240,
        places: [cheap, pricey],
        numberOfPeople: 2,
        ...(budgetPerPersonWon === undefined ? {} : { budgetPerPersonWon }),
      },
      DEFAULT_COURSE_ENGINE_CONFIG,
      { curateCourses: passthroughCuration, travelMatrix: walkMatrix(["cheap", "pricey", 10]) },
    );
    const result = await engine.process();
    assert.equal(result.status, "SUCCESS");
    const costFit = result.userOutput.courses[0]?.scoreBreakdown.costFit;
    assert.ok(costFit !== undefined);
    return costFit;
  };

  // 예산을 안 주면 비용은 랭킹에 반영하지 않는다.
  assert.equal(await withBudget(undefined), 0);
  // 예상 비용 중앙값 107,500원. 예산 20,000원이면 크게 초과해 감점된다.
  assert.ok((await withBudget(20_000)) < 0);
  // 예산이 넉넉하면 만점.
  assert.equal(await withBudget(200_000), 10);
});

test("marks a place as favorite-sourced when the caller supplies the mapping", async () => {
  const lunch = basePlace({
    id: "lunch",
    name: "점심 식당",
    mainCategory: "식당",
    subCategory: "한식",
    score: 85,
  });
  const cafe = basePlace({ id: "cafe", name: "디저트 카페", score: 80 });
  const engine = new CourseRecommendationEngine(
    {
      dateISO: "2026-08-03",
      startTime24h: "11:30",
      totalDurationMinutes: 240,
      places: [lunch, cafe],
      numberOfPeople: 2,
    },
    DEFAULT_COURSE_ENGINE_CONFIG,
    {
      curateCourses: passthroughCuration,
      travelMatrix: walkMatrix(["lunch", "cafe", 10]),
    },
  );

  const result = await engine.process();
  assert.equal(result.status, "SUCCESS");

  const [payload] = toCoursePersistencePayloads(result.userOutput, {
    favoritePlaceIdByKakaoPlaceId: { "1": "11111111-1111-1111-1111-111111111111" },
  });

  assert.equal(payload?.places[0]?.source, "FAVORITE");
  assert.equal(payload?.places[0]?.favoritePlaceId, "11111111-1111-1111-1111-111111111111");
});
