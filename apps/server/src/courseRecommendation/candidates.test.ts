import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL ??= "postgres://course-test:course-test@127.0.0.1:5432/course-test";
process.env.JWT_SECRET ??= "course-candidate-test-secret";

const candidatesModule = import("./candidates.js");

void test("direct candidates use honest unknown hours with neutral scores and category estimates", async () => {
  const { toUnknownPlaceRecommendationItem } = await candidatesModule;
  const cafe = toUnknownPlaceRecommendationItem(
    {
      kakaoPlaceId: "123",
      name: "테스트 카페",
      address: "서울 중구 테스트로 1",
      category: "음식점 > 카페",
      lat: 37.5,
      lng: 127,
      placeUrl: "https://place.map.kakao.com/123",
    },
    { date: "2026-08-20", startTime: "18:00" },
  );

  assert.equal(cafe.score, 50);
  assert.equal(cafe.accessibility.score, 50);
  assert.deepEqual(cafe.priceRangePerPerson, [5_000, 15_000]);
  assert.equal(cafe.availabilityAtRequestedTime.status, "UNKNOWN");
  assert.ok(
    Object.values(cafe.operationInfo.schedules).every((schedule) => schedule.status === "UNKNOWN"),
  );
});

void test("saved-place schedule refresh never reuses a prior availability verdict", async () => {
  const { refreshSavedPlaceSchedule, toUnknownPlaceRecommendationItem } = await candidatesModule;
  const original = toUnknownPlaceRecommendationItem(
    {
      kakaoPlaceId: "456",
      name: "테스트 식당",
      address: "서울 중구 테스트로 2",
      category: "음식점 > 한식",
      lat: 37.51,
      lng: 127.01,
    },
    { date: "2026-08-20", startTime: "12:00" },
  );
  const stale = {
    ...original,
    availabilityAtRequestedTime: {
      ...original.availabilityAtRequestedTime,
      status: "OPEN" as const,
      reason: "old result",
    },
  };

  const refreshed = refreshSavedPlaceSchedule(stale, {
    date: "2026-08-21",
    startTime: "20:00",
  });

  assert.equal(refreshed.availabilityAtRequestedTime.status, "UNKNOWN");
  assert.equal(refreshed.availabilityAtRequestedTime.requestedDateISO, "2026-08-21");
  assert.equal(refreshed.availabilityAtRequestedTime.requestedTime24h, "20:00");
  assert.notEqual(refreshed.availabilityAtRequestedTime.reason, "old result");
});
