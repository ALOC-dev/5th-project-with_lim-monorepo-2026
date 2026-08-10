import { describe, expect, it } from "vitest";

import { getCourseRoutePath } from "./courseMap";
import type { CourseOption } from "./course.types";

const baseOption = {
  id: "option-1",
  courseId: "course-1",
  type: "이동 최소",
  title: "이동 최소 코스",
  reason: "가까운 장소를 연결했어요.",
  totalDurationMinutes: 180,
  totalTravelMinutes: 24,
  pricePerPersonWon: 20000,
  isFavorite: false,
  stops: [
    {
      id: "stop-1",
      source: "KAKAO",
      kakaoPlaceId: "kakao-1",
      name: "첫 번째 장소",
      address: "서울시",
      category: "카페",
      lat: 37.5,
      lng: 127.0,
      visitTime: "18:30",
      stayMinutes: 60,
      activityLabel: "대화",
    },
    {
      id: "stop-2",
      source: "KAKAO",
      kakaoPlaceId: "kakao-2",
      name: "두 번째 장소",
      address: "서울시",
      category: "식당",
      lat: 37.6,
      lng: 127.1,
      visitTime: "19:50",
      stayMinutes: 60,
      activityLabel: "식사",
    },
  ],
} satisfies Omit<CourseOption, "routePath">;

describe("getCourseRoutePath", () => {
  it("uses engine-provided route geometry when it has at least two points", () => {
    const routePath = [
      { lat: 37.51, lng: 127.01 },
      { lat: 37.55, lng: 127.05 },
      { lat: 37.59, lng: 127.09 },
    ] as const;

    expect(getCourseRoutePath({ ...baseOption, routePath })).toBe(routePath);
  });

  it("falls back to stop coordinates for legacy or incomplete route geometry", () => {
    expect(getCourseRoutePath({ ...baseOption, routePath: [] })).toEqual([
      { lat: 37.5, lng: 127 },
      { lat: 37.6, lng: 127.1 },
    ]);
    expect(getCourseRoutePath({ ...baseOption, routePath: [{ lat: 0, lng: 0 }] })).toEqual([
      { lat: 37.5, lng: 127 },
      { lat: 37.6, lng: 127.1 },
    ]);
  });
});
