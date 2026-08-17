import { describe, expect, it } from "vitest";

import type { PlaceRecommendationHistoryDetailResponseData } from "@monorepo/api-contracts";

import {
  PlaceRecommendationHistoryParseError,
  toCompletedPlaceRecommendationEngineOutput,
} from "./PlaceRecommendationHistory.data";

const validInput = {
  location: [{ lat: 37.5665, lng: 126.978 }],
  schedule: { dateISO: "2026-05-02", time24h: "19:00" },
  userNaturalLanguageRequest: "대화하기 좋은 저녁 식사 장소를 추천해줘.",
};

const createCompletedDetail = (
  input: unknown,
  output: unknown,
): PlaceRecommendationHistoryDetailResponseData =>
  ({
    completedAt: "2026-05-02T12:00:00.000Z",
    id: "00000000-0000-4000-8000-000000000001",
    input,
    output,
    requestedAt: "2026-05-02T10:00:00.000Z",
    status: "COMPLETED",
    title: "테스트 추천",
  }) as PlaceRecommendationHistoryDetailResponseData;

const getThrownError = (detail: PlaceRecommendationHistoryDetailResponseData): unknown => {
  try {
    toCompletedPlaceRecommendationEngineOutput(detail);
    return null;
  } catch (error) {
    return error;
  }
};

describe("toCompletedPlaceRecommendationEngineOutput", () => {
  it("reports when the stored input fails validation", () => {
    const error = getThrownError(createCompletedDetail({}, {}));

    expect(error).toBeInstanceOf(PlaceRecommendationHistoryParseError);
    expect(error).toMatchObject({ stage: "input" });
  });

  it("reports when the stored output fails validation", () => {
    const error = getThrownError(createCompletedDetail(validInput, {}));

    expect(error).toBeInstanceOf(PlaceRecommendationHistoryParseError);
    expect(error).toMatchObject({ stage: "output" });
  });
});
