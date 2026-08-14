import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalizeKakaoPlaceId,
  planLegacySavedPlaceMigrations,
  toSeoulMigrationSchedule,
  type LegacyFavoritePlaceForMigration,
} from "../savedPlaces/legacyCompatibility.js";

const favorite = (
  overrides: Partial<LegacyFavoritePlaceForMigration> = {},
): LegacyFavoritePlaceForMigration => ({
  id: "legacy-1",
  kakaoPlaceId: "0012345",
  name: "테스트 카페",
  address: "서울 중구 테스트로 1",
  lat: "37.5665",
  lng: "126.9780",
  category: "음식점 > 카페",
  createdAt: new Date("2025-01-02T03:04:05.000Z"),
  ...overrides,
});

void test("canonical Kakao IDs normalize raw IDs, prefixes, and exact map URLs", () => {
  assert.equal(canonicalizeKakaoPlaceId("0012345"), "12345");
  assert.equal(canonicalizeKakaoPlaceId(" kakao:12345 "), "12345");
  assert.equal(
    canonicalizeKakaoPlaceId("https://place.map.kakao.com/12345?ref=legacy"),
    "12345",
  );
  assert.equal(canonicalizeKakaoPlaceId("not-a-kakao-id"), null);
  assert.equal(canonicalizeKakaoPlaceId("0"), null);
});

void test("legacy snapshots preserve identity while marking schedule and price unknown", () => {
  const schedule = { date: "2026-08-14", startTime: "09:30" };
  const plan = planLegacySavedPlaceMigrations([favorite()], [], schedule);

  assert.equal(plan.skipped.length, 0);
  assert.equal(plan.migrations.length, 1);
  const migration = plan.migrations[0];
  assert.ok(migration);
  assert.equal(migration.canonicalKakaoPlaceId, "12345");
  assert.equal(migration.placeData.id, "kakao:12345");
  assert.equal(migration.placeData.referenceUrls.kakaoMap, "https://place.map.kakao.com/12345");
  assert.deepEqual(migration.placeData.priceRangePerPerson, [0, 0]);
  assert.equal(migration.placeData.availabilityAtRequestedTime.status, "UNKNOWN");
  assert.equal(migration.placeData.availabilityAtRequestedTime.requestedDateISO, schedule.date);
  assert.equal(migration.placeData.availabilityAtRequestedTime.requestedTime24h, schedule.startTime);
  assert.deepEqual(
    new Set(Object.values(migration.placeData.operationInfo.schedules).map((day) => day.status)),
    new Set(["UNKNOWN"]),
  );
  assert.match(migration.placeData.reasons.join(" "), /가격은 확인되지 않았/u);
  assert.equal(migration.createdAt.toISOString(), "2025-01-02T03:04:05.000Z");
});

void test("migration planning is idempotent by canonical Kakao ID", () => {
  const schedule = { date: "2026-08-14", startTime: "09:30" };
  const initial = planLegacySavedPlaceMigrations([favorite()], [], schedule);
  const snapshot = initial.migrations[0]?.placeData;
  assert.ok(snapshot);

  const repeated = planLegacySavedPlaceMigrations(
    [favorite({ kakaoPlaceId: "kakao:12345" })],
    [{ placeData: snapshot }],
    schedule,
  );
  assert.equal(repeated.migrations.length, 0);

  const oldInvalidSnapshot = planLegacySavedPlaceMigrations(
    [favorite()],
    [{ placeData: { referenceUrls: { kakaoMap: "https://place.map.kakao.com/12345" } } }],
    schedule,
  );
  assert.equal(oldInvalidSnapshot.migrations.length, 0);
});

void test("canonical duplicates and malformed legacy rows are skipped without mutation", () => {
  const schedule = { date: "2026-08-14", startTime: "09:30" };
  const first = favorite({ id: "first", kakaoPlaceId: "12345", name: "첫 번째" });
  const duplicate = favorite({ id: "duplicate", kakaoPlaceId: "0012345", name: "두 번째" });
  const badId = favorite({ id: "bad-id", kakaoPlaceId: "broken" });
  const badCoordinate = favorite({ id: "bad-coordinate", kakaoPlaceId: "67890", lat: "NaN" });

  const plan = planLegacySavedPlaceMigrations(
    [first, duplicate, badId, badCoordinate],
    [],
    schedule,
  );

  assert.deepEqual(plan.migrations.map((migration) => migration.legacyFavoriteId), ["first"]);
  assert.deepEqual(plan.skipped, [
    { legacyFavoriteId: "bad-id", reason: "INVALID_KAKAO_PLACE_ID" },
    { legacyFavoriteId: "bad-coordinate", reason: "INVALID_COORDINATES" },
  ]);
});

void test("migration timestamp fields use Asia/Seoul independently of host timezone", () => {
  assert.deepEqual(toSeoulMigrationSchedule(new Date("2026-08-14T15:45:00.000Z")), {
    date: "2026-08-15",
    startTime: "00:45",
  });
});
