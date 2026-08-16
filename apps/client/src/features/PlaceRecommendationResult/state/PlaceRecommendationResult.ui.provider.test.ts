import { describe, expect, it } from "vitest";

import { getFocusedMapZoom } from "./PlaceRecommendationResult.ui.provider";

describe("getFocusedMapZoom", () => {
  it("brings a wider map view to the focused-place zoom level", () => {
    expect(getFocusedMapZoom(10)).toBe(4);
    expect(getFocusedMapZoom(5)).toBe(4);
  });

  it("preserves a map view that is already more zoomed in", () => {
    expect(getFocusedMapZoom(4)).toBe(4);
    expect(getFocusedMapZoom(3)).toBe(3);
  });
});
