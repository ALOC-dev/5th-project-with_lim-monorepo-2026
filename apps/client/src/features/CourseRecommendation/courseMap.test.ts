import { describe, expect, it } from "vitest";

import type { CourseOption } from "./course.types";
import { getCourseMapPoints, getCourseRoutePath } from "./courseMap";

const baseOption = {
  id: "option-1",
  courseId: "course-1",
  rank: 1,
  type: "이동 최소",
  courseType: { key: "LOW_TRAVEL", label: "이동 최소", description: "이동을 줄였어요." },
  title: "이동 최소 코스",
  reason: "가까운 장소를 연결했어요.",
  reasonTexts: ["가까운 장소를 연결했어요."],
  tradeoffs: [],
  totalDurationMinutes: 180,
  totalTravelMinutes: 24,
  totalStayMinutes: 120,
  startTime: "18:30",
  endTime: "21:30",
  pricePerPersonWon: 20000,
  estimatedCostPerPerson: { min: 18000, max: 22000, quality: "ESTIMATED" },
  candidateDecisions: [],
  routePathSource: "NONE",
  isFavorite: false,
  legacy: false,
  stops: [
    {
      id: "stop-1",
      source: "DIRECT_SEARCH",
      kakaoPlaceId: "kakao-1",
      name: "첫 번째 장소",
      address: "서울시",
      category: "카페",
      lat: 37.5,
      lng: 127.0,
      visitTime: "18:30",
      stayMinutes: 60,
      activityLabel: "대화",
      travelMinutesFromPrevious: 0,
      waitMinutesFromPrevious: 0,
    },
    {
      id: "stop-2",
      source: "DIRECT_SEARCH",
      kakaoPlaceId: "kakao-2",
      name: "두 번째 장소",
      address: "서울시",
      category: "식당",
      lat: 37.6,
      lng: 127.1,
      visitTime: "19:50",
      stayMinutes: 60,
      activityLabel: "식사",
      travelMinutesFromPrevious: 24,
      waitMinutesFromPrevious: 0,
    },
  ],
} satisfies Omit<CourseOption, "routePath">;

describe("getCourseRoutePath", () => {
  it("uses measured TMAP geometry when it has at least two points", () => {
    const routePath = [
      { lat: 37.51, lng: 127.01 },
      { lat: 37.55, lng: 127.05 },
      { lat: 37.59, lng: 127.09 },
    ] as const;

    expect(getCourseRoutePath({ ...baseOption, routePath, routePathSource: "TMAP" })).toBe(
      routePath,
    );
  });

  it("never presents stop coordinates or unverified geometry as a route", () => {
    const straightLine = [
      { lat: 37.5, lng: 127 },
      { lat: 37.6, lng: 127.1 },
    ] as const;
    expect(getCourseRoutePath({ ...baseOption, routePath: straightLine })).toEqual([]);
    expect(getCourseRoutePath({ ...baseOption, routePath: [], routePathSource: "TMAP" })).toEqual(
      [],
    );
  });

  it("uses stop coordinates only for fitting map markers", () => {
    expect(getCourseMapPoints({ ...baseOption, routePath: [] })).toEqual([
      { lat: 37.5, lng: 127 },
      { lat: 37.6, lng: 127.1 },
    ]);
  });
});
