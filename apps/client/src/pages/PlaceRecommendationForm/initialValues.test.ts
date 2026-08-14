import { describe, expect, it } from "vitest";

import { getPlaceRecommendationFormInitialValues } from "./initialValues";

describe("getPlaceRecommendationFormInitialValues", () => {
  it.each([true, false])(
    "starts without a preselected origin (predefined: %s)",
    (usePredefined) => {
      expect(getPlaceRecommendationFormInitialValues(usePredefined).locations).toEqual([]);
    },
  );
});
