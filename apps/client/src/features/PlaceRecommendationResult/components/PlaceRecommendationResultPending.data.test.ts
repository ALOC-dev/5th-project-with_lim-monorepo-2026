import { describe, expect, it } from "vitest";

import type { PlaceRecommendationProgressSseEvent } from "../../../apis/server/placeRecommendation";
import {
  formatElapsedSeconds,
  getPlaceRecommendationDurationLabel,
  getPlaceRecommendationInputSummary,
  getPlaceRecommendationProgressTimeline,
} from "./PlaceRecommendationResultPending.data";

const event = (
  step: PlaceRecommendationProgressSseEvent["step"],
  startedAt: string,
): PlaceRecommendationProgressSseEvent => ({ type: "progress", step, startedAt });

describe("place recommendation progress timeline", () => {
  it("shows fixed durations for completed steps and an increasing duration for the active step", () => {
    const events = [
      event("input_validated", "2026-08-13T00:00:00.000Z"),
      event("discovering", "2026-08-13T00:00:03.000Z"),
      event("evaluating", "2026-08-13T00:00:11.000Z"),
    ];

    expect(
      getPlaceRecommendationProgressTimeline(events, Date.parse("2026-08-13T00:00:16.900Z")),
    ).toEqual([
      { id: "input_validated", status: "done", elapsedSeconds: 3 },
      { id: "discovering", status: "done", elapsedSeconds: 8 },
      { id: "evaluating", status: "active", elapsedSeconds: 5 },
      { id: "enriching", status: "pending", elapsedSeconds: null },
      { id: "scoring", status: "pending", elapsedSeconds: null },
    ]);
  });

  it("restores the same timeline from replayed SSE events after a reconnect", () => {
    const replayedEvents = [
      event("input_validated", "2026-08-13T00:00:00.000Z"),
      event("discovering", "2026-08-13T00:00:03.000Z"),
    ];

    const restoredTimeline = getPlaceRecommendationProgressTimeline(
      replayedEvents,
      Date.parse("2026-08-13T00:00:10.000Z"),
    );

    expect(restoredTimeline[0]).toMatchObject({ status: "done", elapsedSeconds: 3 });
    expect(restoredTimeline[1]).toMatchObject({ status: "active", elapsedSeconds: 7 });
  });

  it("does not reset a stage when the SSE buffer replays a duplicate event", () => {
    const events = [
      event("input_validated", "2026-08-13T00:00:00.000Z"),
      event("discovering", "2026-08-13T00:00:04.000Z"),
      event("discovering", "2026-08-13T00:00:09.000Z"),
    ];

    const timeline = getPlaceRecommendationProgressTimeline(
      events,
      Date.parse("2026-08-13T00:00:12.000Z"),
    );

    expect(timeline[0]).toMatchObject({ status: "done", elapsedSeconds: 4 });
    expect(timeline[1]).toMatchObject({ status: "active", elapsedSeconds: 8 });
  });

  it("formats durations in seconds and minutes", () => {
    expect(formatElapsedSeconds(12)).toBe("12초");
    expect(formatElapsedSeconds(62)).toBe("1분 2초");
  });

  it("summarizes the form input shown while a recommendation is pending", () => {
    expect(
      getPlaceRecommendationInputSummary(
        {
          schedule: {
            dateISO: "2026-08-15",
            time24h: "19:30",
            stayDurationMinutes: 120,
          },
          location: [{ lat: 37.5665, lng: 126.978 }],
          numberOfPeople: 2,
          partyType: "FRIENDS",
          activityType: "MEAL",
          budgetPerPerson: [20_000, 50_000],
          userNaturalLanguageRequest: "대화하기 좋은 저녁 식사 장소",
        },
        [
          {
            lat: 37.5665,
            lng: 126.978,
            placeName: "서울시청",
            roadNameAddress: "서울특별시 중구 세종대로 110",
          },
        ],
      ),
    ).toEqual([
      { label: "출발지", value: "서울시청" },
      { label: "일정", value: "2026-08-15 · 19:30 · 120분 체류" },
      { label: "조건", value: "식사 · 2명 · 친구 · 20,000~50,000원/인" },
      { label: "요청", value: "대화하기 좋은 저녁 식사 장소" },
    ]);
  });

  it("formats a persisted request-to-completion duration", () => {
    expect(
      getPlaceRecommendationDurationLabel("2026-08-15T10:00:00.000Z", "2026-08-15T10:02:05.900Z"),
    ).toBe("2분 5초");
    expect(getPlaceRecommendationDurationLabel("invalid", "2026-08-15T10:02:05.900Z")).toBeNull();
    expect(getPlaceRecommendationDurationLabel("2026-08-15T10:00:00.000Z", null)).toBeNull();
  });
});
