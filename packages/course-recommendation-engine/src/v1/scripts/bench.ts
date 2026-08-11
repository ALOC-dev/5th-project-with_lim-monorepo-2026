import type { PlaceRecommendationItem } from "@monorepo/recommendation-engine/v1/contracts";

import { CourseRecommendationEngine, DEFAULT_COURSE_ENGINE_CONFIG } from "../index.js";

const createPlace = (index: number): PlaceRecommendationItem => ({
  id: `p${index}`,
  name: `장소 ${index}`,
  phoneNumber: null,
  tags: ["태그"],
  contentSummary: "벤치마크 장소입니다.",
  mainCategory: index % 3 === 0 ? "식당" : index % 3 === 1 ? "카페" : "전시",
  subCategory: index % 3 === 0 ? "한식" : index % 3 === 1 ? "커피숍" : "미디어아트",
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
    requestedTime24h: "10:00",
    stayDurationMinutes: 60,
    reason: "열려 있습니다.",
  },
  referenceUrls: { kakaoMap: `https://place.map.kakao.com/${index}` },
  accessibility: { score: 80, distanceMeters: 300, perOrigin: [{ originId: "host", distanceMeters: 300 }] },
  location: { lat: 37.5 + index * 0.001, lng: 127 + index * 0.001, placeName: `장소 ${index}`, roadAddressKo: "서울시 벤치로 1" },
  priceRangePerPerson: [5_000, 15_000],
  score: 70 + (index % 30),
  scoreBreakdown: { inputMatch: 80, trust: 80, accessibility: 80, diversity: 80, total: 80 },
  reasons: ["벤치마크 근거"],
});

for (const placeCount of [6, 8, 10, 12, 15]) {
  const places = Array.from({ length: placeCount }, (_, i) => createPlace(i));
  const engine = new CourseRecommendationEngine(
    {
      dateISO: "2026-08-03",
      startTime24h: "10:00",
      totalDurationMinutes: 720,
      places,
      numberOfPeople: 2,
    },
    DEFAULT_COURSE_ENGINE_CONFIG,
    {
      curateCourses: ({ candidates, targetCourseCount }) =>
        Promise.resolve({
          picks: candidates.slice(0, targetCourseCount).map((c) => ({
            courseId: c.courseId,
            title: c.title.slice(0, 40),
            courseType: { key: "BALANCED", label: "균형형", description: "벤치마크" },
            selection: { reasonCodes: ["BALANCED"], reasonTexts: ["벤치마크"], tradeoffs: [] },
          })),
        }),
    },
  );

  const started = performance.now();
  const result = await engine.process();
  const elapsed = performance.now() - started;

  const scores =
    result.status === "SUCCESS" ? result.userOutput.courses.map((c) => c.score) : [];
  const candidates = result.status === "SUCCESS" ? result.meta.candidateCount : 0;
  console.log(
    `places=${String(placeCount).padStart(2)}  elapsed=${elapsed.toFixed(0).padStart(6)}ms  ` +
      `candidates=${String(candidates).padStart(5)}  status=${result.status}  topScores=${JSON.stringify(scores)}`,
  );
}
