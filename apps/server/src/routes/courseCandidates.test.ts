import assert from "node:assert/strict";
import test from "node:test";

process.env.JWT_SECRET ??= "course-search-test-secret";

const searchModule = import("./courseCandidates.js");

void test("empty candidate search returns without calling Kakao", async () => {
  const { searchKakaoCourseCandidates } = await searchModule;
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    throw new Error("unexpected fetch");
  };
  try {
    const items = await searchKakaoCourseCandidates({
      query: "   ",
      kakaoRestApiKey: "test-key",
    });
    assert.deepEqual(items, []);
    assert.equal(called, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

void test("candidate search preserves Kakao category and uses location only when provided", async () => {
  const { searchKakaoCourseCandidates } = await searchModule;
  const originalFetch = globalThis.fetch;
  const requestedUrls: URL[] = [];
  globalThis.fetch = async (input) => {
    requestedUrls.push(new URL(String(input)));
    return new Response(
      JSON.stringify({
        documents: [
          {
            id: "123",
            place_name: "테스트 카페",
            category_name: "음식점 > 카페",
            phone: "02-123-4567",
            address_name: "서울 중구 테스트동 1",
            road_address_name: "서울 중구 테스트로 1",
            x: "127.01",
            y: "37.51",
            place_url: "https://place.map.kakao.com/123",
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };
  try {
    const items = await searchKakaoCourseCandidates({
      query: "테스트 카페",
      kakaoRestApiKey: "test-key",
      lat: 37.5,
      lng: 127,
    });
    assert.equal(items.length, 1);
    assert.equal(items[0]?.category, "음식점 > 카페");
    assert.equal(items[0]?.address, "서울 중구 테스트로 1");
    assert.equal(requestedUrls[0]?.searchParams.get("x"), "127");
    assert.equal(requestedUrls[0]?.searchParams.get("y"), "37.5");

    await searchKakaoCourseCandidates({
      query: "테스트 카페",
      kakaoRestApiKey: "test-key",
    });
    assert.equal(requestedUrls[1]?.searchParams.has("x"), false);
    assert.equal(requestedUrls[1]?.searchParams.has("y"), false);
    assert.equal(requestedUrls[1]?.searchParams.has("sort"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
