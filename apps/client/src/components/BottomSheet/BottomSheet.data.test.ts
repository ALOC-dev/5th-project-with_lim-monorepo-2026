import { describe, expect, it } from "vitest";

import { getResizedSheetTop } from "./BottomSheet.data";

describe("getResizedSheetTop", () => {
  it("keeps the sheet below the fixed header when it is expanded", () => {
    expect(
      getResizedSheetTop({
        currentTop: 467,
        delta: -600,
        minimumHeight: 200,
        minimumTop: 52,
        viewportHeight: 667,
      }),
    ).toBe(52);
  });

  it("does not collapse the sheet below its initial 30% height", () => {
    expect(
      getResizedSheetTop({
        currentTop: 467,
        delta: 600,
        minimumHeight: 200,
        minimumTop: 52,
        viewportHeight: 667,
      }),
    ).toBe(467);
  });
});
