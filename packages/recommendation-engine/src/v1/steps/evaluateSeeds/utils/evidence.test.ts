import assert from "node:assert/strict";
import test from "node:test";

import type { UserInput } from "../../../interfaces/input.contracts.js";
import type { LocalSeed } from "../../discoverSeeds/vendors/contracts.js";
import { buildCandidateScoringEvidence } from "./evidence.js";

const baseSeed = (overrides: Partial<LocalSeed> = {}): LocalSeed => ({
  provider: "kakao",
  providerPlaceId: "seed-1",
  name: "중간 장소",
  category: "음식점>한식",
  phone: "",
  address: "서울시 중구",
  roadAddress: "서울시 중구 테스트로 1",
  longitude: 127.1,
  latitude: 37.5,
  ...overrides,
});

const baseUserInput = (overrides: Partial<UserInput> = {}): UserInput => ({
  schedule: {
    dateISO: "2026-08-17",
    time24h: "19:00",
  },
  location: [
    { lat: 37.5, lng: 127.0 },
    { lat: 37.5, lng: 127.2 },
  ],
  userNaturalLanguageRequest: "두 사람의 중간 지점 추천",
  ...overrides,
});

void test("copies the structured activity type into scoring evidence", () => {
  const evidence = buildCandidateScoringEvidence(
    baseSeed(),
    "seed-1",
    baseUserInput({ activityType: "ACTIVITY" }),
  );

  assert.equal(evidence.userFit.activityType, "ACTIVITY");
});

void test("uses the multi-origin centroid for a missing provider distance", () => {
  const evidence = buildCandidateScoringEvidence(
    baseSeed({ latitude: 37.5, longitude: 127.1, distanceMeters: undefined }),
    "seed-1",
    baseUserInput(),
  );

  // 후보는 두 출발지(127.0, 127.2)의 중앙인 127.1에 있으므로, 첫 출발지 기준 약 8.8km가
  // 아니라 중심점 기준 0m여야 한다. 부동소수점 오차만 허용한다.
  assert.ok((evidence.accessibilitySignals.distanceMeters ?? Number.NaN) < 0.001);
});

void test("keeps a provider-supplied distance as the authoritative value", () => {
  const evidence = buildCandidateScoringEvidence(
    baseSeed({ distanceMeters: 321 }),
    "seed-1",
    baseUserInput(),
  );

  assert.equal(evidence.accessibilitySignals.distanceMeters, 321);
});
