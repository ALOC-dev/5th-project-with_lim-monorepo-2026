import assert from "node:assert/strict";
import test from "node:test";

import { getLocationCentroid } from "./geography.js";

void test("returns no centroid when a request has no origins", () => {
  assert.equal(getLocationCentroid([]), undefined);
});

void test("uses every origin rather than favouring the host origin", () => {
  const centroid = getLocationCentroid([
    { lat: 37.5, lng: 127.0 },
    { lat: 37.6, lng: 127.1 },
    { lat: 37.8, lng: 126.9 },
  ]);

  assert.deepEqual(centroid, {
    lat: (37.5 + 37.6 + 37.8) / 3,
    lng: (127.0 + 127.1 + 126.9) / 3,
  });
});
