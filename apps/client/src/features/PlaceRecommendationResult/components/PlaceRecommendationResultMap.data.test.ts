import { describe, expect, it } from "vitest";

import {
  getFocusedPlaceCenterPoint,
  getFocusedPlacePanY,
  getRecommendationBoundsPadding,
} from "./PlaceRecommendationResultMap.data";

const mobileMapMeasurement = {
  mapBottom: 844,
  mapHeight: 792,
  viewportHeight: 844,
};

describe("place recommendation map viewport measurements", () => {
  it("excludes the initial 40dvh result sheet from the fitted map bounds", () => {
    const padding = getRecommendationBoundsPadding(mobileMapMeasurement);

    expect(padding).toMatchObject({ left: 24, right: 24, top: 24 });
    expect(padding.bottom).toBeCloseTo(361.6);
  });

  it("moves a focused place halfway toward the visible map area", () => {
    expect(getFocusedPlacePanY(mobileMapMeasurement)).toBeCloseTo(168.8);
  });

  it("derives the destination map center from the current target position", () => {
    expect(getFocusedPlaceCenterPoint({ x: 195, y: 396 }, 168.8)).toEqual({
      x: 195,
      y: 564.8,
    });
  });
});
