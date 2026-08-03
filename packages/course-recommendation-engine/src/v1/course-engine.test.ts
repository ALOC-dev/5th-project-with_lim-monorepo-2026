import assert from "node:assert/strict";
import test from "node:test";

import type { PlaceRecommendationItem } from "@monorepo/recommendation-engine/v1/contracts";

import {
  CourseRecommendationEngine,
  DEFAULT_COURSE_ENGINE_CONFIG,
  type CourseInput,
} from "./index.js";

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
  totalDurationMinutes: 210,
  places,
  travelTimeMatrix: {
    mode: "WALK_TRANSIT",
    placeToPlace: {
      cafe: { lunch: 30 },
      lunch: { cafe: 10 },
    },
  },
  numberOfPeople: 2,
  userNaturalLanguageRequest: "점심 먹고 카페까지 가는 코스",
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

  const engine = new CourseRecommendationEngine(courseInput([cafe, closedActivity, lunch]), {
    ...DEFAULT_COURSE_ENGINE_CONFIG,
    targetCourseCount: 2,
  });

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
  assert.equal(result.userOutput.courses[0]?.timeline[0]?.label, "11:30 점심 식당(70분 체류)");
  assert.equal(result.userOutput.courses[0]?.estimatedCostPerPerson[0], 10_000);
  assert.equal(result.userOutput.courses[0]?.estimatedTotalMinutes, 140);
  assert.equal(result.userOutput.courses[0]?.llmSelectionReason.length, 3);
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

test("uses the provided walk and transit matrix instead of requiring an origin", async () => {
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
    location: { lat: 37.51, lng: 127.01, placeName: "두 번째 장소", roadAddressKo: "서울시 둘로 2" },
  });
  const engine = new CourseRecommendationEngine(
    {
      dateISO: "2026-08-03",
      startTime24h: "14:00",
      totalDurationMinutes: 180,
      places: [first, second],
      travelTimeMatrix: {
        mode: "WALK_TRANSIT",
        placeToPlace: {
          first: { second: 17 },
          second: { first: 19 },
        },
      },
      numberOfPeople: 2,
      userNaturalLanguageRequest: "카페 두 곳을 여유롭게 둘러보기",
    },
    DEFAULT_COURSE_ENGINE_CONFIG,
  );

  const result = await engine.process();

  assert.equal(result.status, "SUCCESS");
  assert.equal(result.userOutput.courses[0]?.timeline[0]?.travelMinutesFromPrevious, 0);
  assert.equal(result.userOutput.courses[0]?.timeline[1]?.travelMinutesFromPrevious, 17);
});

test("derives the course end time from start time and total duration", async () => {
  const first = basePlace({ id: "first", name: "첫 장소", score: 80 });
  const second = basePlace({ id: "second", name: "두 번째 장소", score: 80 });
  const engine = new CourseRecommendationEngine({
    dateISO: "2026-08-03",
    startTime24h: "10:00",
    totalDurationMinutes: 150,
    places: [first, second],
    travelTimeMatrix: {
      mode: "WALK_TRANSIT",
      placeToPlace: {
        first: { second: 10 },
        second: { first: 10 },
      },
    },
    numberOfPeople: 2,
    userNaturalLanguageRequest: "짧은 코스",
  });

  const result = await engine.process();

  assert.equal(result.status, "SUCCESS");
  assert.equal(result.userInput.startTime24h, "10:00");
  assert.equal(result.userInput.totalDurationMinutes, 150);
  assert.ok(
    result.userOutput.courses.every((course) => course.endTime24h <= "12:30"),
    "course must fit within the derived end time",
  );
});
