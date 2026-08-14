import { describe, expect, it } from "vitest";

import { canNavigateBack } from "./useAppNavigate";

describe("canNavigateBack", () => {
  it("allows browser back only when the current entry has an earlier app route", () => {
    expect(canNavigateBack({ idx: 1 })).toBe(true);
    expect(canNavigateBack({ idx: 4 })).toBe(true);
  });

  it("uses a safe fallback for an initial, malformed, or external history entry", () => {
    expect(canNavigateBack({ idx: 0 })).toBe(false);
    expect(canNavigateBack({})).toBe(false);
    expect(canNavigateBack(null)).toBe(false);
  });
});
