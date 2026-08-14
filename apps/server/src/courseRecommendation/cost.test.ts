import assert from "node:assert/strict";
import test from "node:test";

import { presentEstimatedCostPerPerson } from "./cost.js";

test("does not present a zero-only engine range as a verified free course", () => {
  assert.deepEqual(presentEstimatedCostPerPerson([0, 0]), {
    min: null,
    max: null,
    quality: "UNKNOWN",
  });
});

test("marks non-zero engine ranges as estimates", () => {
  assert.deepEqual(presentEstimatedCostPerPerson([10_000, 30_000]), {
    min: 10_000,
    max: 30_000,
    quality: "ESTIMATED",
  });
});
