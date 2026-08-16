import assert from "node:assert/strict";
import { promises as fileSystem, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  assessSemanticFit,
  combineSinks,
  createJsonlFileSink,
  createLogger,
  createScoringPipeline,
  type LlmScoringClient,
  type LogEvent,
  OperationVerifier,
} from "./index.js";
import { distributeSeedCounts } from "./steps/discoverSeeds/llm/approaches.js";
import { dedupeAndExclude } from "./steps/discoverSeeds/utils/dedupe.js";
import type { LocalSeed } from "./steps/discoverSeeds/vendors/contracts.js";
import { searchKakaoLocal } from "./steps/discoverSeeds/vendors/kakao-local.js";
import { toNaverLocalSeeds } from "./steps/discoverSeeds/vendors/naver-local.js";
import { toTmapRadiusKm } from "./steps/discoverSeeds/vendors/tmap-local.js";
import { selectTopWithSpatialSpread } from "./steps/evaluateSeeds/index.js";
import { hasOperationSignal } from "./steps/evaluateSeeds/llm/operation-info.js";
import { scoreShortlistRelevance } from "./steps/evaluateSeeds/llm/shortlist.js";
import {
  findExistingKakaoMapUrl,
  resolveCandidateReferenceUrls,
} from "./steps/evaluateSeeds/tools/reference-urls.js";
import {
  buildReferenceQueryVariants,
  scoreStructuredReferenceIdentity,
} from "./steps/evaluateSeeds/tools/shared/reference-query.js";
import { isBotCheckPage, stripHtml } from "./steps/evaluateSeeds/tools/shared/text.js";
import { assessClosure } from "./steps/evaluateSeeds/utils/closure.js";
import type { CandidateScoringEvidence } from "./steps/evaluateSeeds/utils/evidence.js";
import { parseOperationInfo } from "./steps/evaluateSeeds/utils/operation-hours.js";
import { buildRankedCandidates, isClearlyOverBudget } from "./steps/evaluateSeeds/utils/ranking.js";
import {
  findChainBrands,
  requestNamesDishFamily,
  scoreDishAffinity,
} from "./steps/evaluateSeeds/utils/semantic-fit.js";
import {
  toDistanceMeters,
  toMaxCandidateDistanceMeters,
  toSearchCenter,
  toSearchRadiusMeters,
} from "./utils/geo.js";
import { validateNaturalLanguageRequest } from "./utils/request-validation.js";

const schedule = (overrides: Partial<{ dateISO: string; time24h: string; stay: number }> = {}) => ({
  dateISO: overrides.dateISO ?? "2026-08-03",
  time24h: overrides.time24h ?? "12:00",
  stayDurationMinutes: overrides.stay ?? 60,
});

test("resolves the weekday from the calendar date regardless of server timezone", () => {
  // 2026-08-03은 월요일이다. 예전 구현은 `getDay()`(머신 로컬 시간)를 써서
  // UTC 서버에서 SUNDAY로 읽었고, 월요일 요청에 일요일 영업시간을 검사했다.
  const originalTimeZone = process.env.TZ;

  try {
    for (const timeZone of ["Asia/Seoul", "UTC", "America/New_York", "Pacific/Kiritimati"]) {
      process.env.TZ = timeZone;
      assert.equal(
        new OperationVerifier(schedule()).requestedDayOfWeek,
        "MONDAY",
        `${timeZone}에서 요일이 밀렸다`,
      );
    }
  } finally {
    if (originalTimeZone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimeZone;
  }
});

test("resolves every weekday correctly", () => {
  const expected = [
    ["2026-08-03", "MONDAY"],
    ["2026-08-04", "TUESDAY"],
    ["2026-08-05", "WEDNESDAY"],
    ["2026-08-06", "THURSDAY"],
    ["2026-08-07", "FRIDAY"],
    ["2026-08-08", "SATURDAY"],
    ["2026-08-09", "SUNDAY"],
  ] as const;

  for (const [dateISO, dayOfWeek] of expected) {
    assert.equal(new OperationVerifier(schedule({ dateISO })).requestedDayOfWeek, dayOfWeek);
  }
});

const seed = (overrides: Partial<LocalSeed>): LocalSeed => ({
  provider: "tmap",
  name: "테스트 가게",
  category: "음식점",
  phone: "",
  address: "서울 마포구 서교동 1",
  roadAddress: "서울 마포구 양화로 160",
  latitude: 37.5556,
  longitude: 126.9226,
  ...overrides,
});

const evidence = (overrides: {
  name?: string;
  mainCategory?: string;
  subCategory?: string;
  tags?: string[];
  request?: string;
  rawTextSnippet?: string;
}): CandidateScoringEvidence =>
  ({
    candidateId: "c1",
    name: overrides.name ?? "테스트 장소",
    category: {
      mainCategory: overrides.mainCategory ?? "음식점",
      subCategory: overrides.subCategory ?? "한식",
      tags: overrides.tags ?? [],
    },
    placeInfo: { address: "서울 마포구", roadAddress: "서울 마포구 월드컵북로 1" },
    userFit: { naturalLanguageRequest: overrides.request ?? "홍대 맛집" },
    trustSignals: { evidenceUrls: [] },
    accessibilitySignals: {},
    raw: { seed: {} },
    ...(overrides.rawTextSnippet === undefined
      ? {}
      : { enrichment: { rawTextSnippet: overrides.rawTextSnippet } }),
  }) as unknown as CandidateScoringEvidence;

test("ignores scraped page text when judging semantic fit", () => {
  // 네이버 지도 페이지에는 주변 가게와 리뷰가 섞여 있다. 리뷰에 "이자카야" 한 줄이
  // 있다고 멀쩡한 한식당을 주류 업장으로 보면 안 된다.
  const plain = assessSemanticFit(evidence({ name: "홍대 순대국밥" }));
  const withNoisyScrape = assessSemanticFit(
    evidence({
      name: "홍대 순대국밥",
      rawTextSnippet: "근처 이자카야, 포차, 호프집도 함께 추천드립니다.",
    }),
  );

  assert.equal(plain.status, "PASS");
  assert.equal(withNoisyScrape.status, "PASS", "스크랩 원문 때문에 감점되면 안 된다");
});

test("still penalises a candidate whose own category conflicts with the request", () => {
  const izakaya = assessSemanticFit(
    evidence({
      name: "연남 이자카야",
      mainCategory: "술집",
      subCategory: "이자카야",
      tags: ["이자카야"],
      request: "홍대 맛집 추천",
    }),
  );

  assert.equal(izakaya.status, "PENALIZE");
  assert.equal(izakaya.severity, "STRONG");
});

test("treats a request that mentions drinking as allowing bar candidates", () => {
  // 예전에는 이 예외가 `바\b` 패턴에 걸려 있었는데, JS의 `\b`는 ASCII 단어경계라
  // 한국어에서는 절대 매칭되지 않아 죽은 코드였다.
  //
  // 여기서 막으려는 건 "주류 업장이라는 이유로 강하게 거부되는" 회귀다.
  // 주종이 어긋나는 경우(와인바를 찾는데 이자카야)의 약한 감점은 의도된 동작이라
  // PASS가 아니라 "STRONG이 아님"으로 검증한다.
  for (const request of ["홍대 맛집이랑 와인바", "고기 먹고 한잔", "성수 맛집 이자카야"]) {
    const result = assessSemanticFit(
      evidence({
        name: "연남 이자카야",
        mainCategory: "술집",
        subCategory: "이자카야",
        tags: ["이자카야"],
        request,
      }),
    );
    assert.notEqual(
      result.severity,
      "STRONG",
      `"${request}" 요청에서 술집이 강하게 거부되면 안 된다`,
    );
  }
});

test("keeps the exact drink type the request asked for on top", () => {
  // "을지로 맥주 펍" 요청에 와인바·칵테일바·오뎅바가 10건 중 5건을 차지했다.
  // 주류 요청은 어느 의미 규칙에도 걸리지 않아 필터가 통째로 건너뛰어졌다.
  const beerPub = assessSemanticFit(
    evidence({
      name: "을지OB베어",
      mainCategory: "술집",
      subCategory: "호프",
      tags: ["음식점", "술집", "호프"],
      request: "을지로 맥주 펍",
    }),
  );
  const wineBar = assessSemanticFit(
    evidence({
      name: "타바키",
      mainCategory: "술집",
      subCategory: "와인바",
      tags: ["음식점", "술집", "와인바"],
      request: "을지로 맥주 펍",
    }),
  );

  assert.equal(beerPub.status, "PASS");
  assert.equal(wineBar.status, "PENALIZE");
});

test("does not narrow a plain drink request to one liquor type", () => {
  // "홍대 술집"처럼 주종을 지목하지 않은 요청은 어느 술집도 감점하면 안 된다.
  for (const subCategory of ["호프", "와인바", "이자카야", "칵테일바"]) {
    const result = assessSemanticFit(
      evidence({
        name: "테스트 술집",
        mainCategory: "술집",
        subCategory,
        tags: ["음식점", "술집", subCategory],
        request: "홍대 술집",
      }),
    );
    assert.equal(result.status, "PASS", `${subCategory}가 감점되면 안 된다`);
  }
});

test("penalises a loud franchise only when the request asks for quiet", () => {
  // "강남역 조용한 카페" 요청에 스타벅스·메가커피·컴포즈·공차가 10건 중 6건이었다.
  // 체인 여부는 브랜드 목록이 아니라 후보 풀의 빈도로 판정한다.
  const franchise = {
    name: "메가MGC커피 강남역점",
    mainCategory: "음식점",
    subCategory: "카페",
    tags: ["음식점", "카페", "커피전문점"],
  };
  const chains = findChainBrands(["메가MGC커피 강남역점", "메가MGC커피 강남역신분당선점"]);

  assert.equal(
    assessSemanticFit(evidence({ ...franchise, request: "강남역 조용한 카페" }), chains).status,
    "PENALIZE",
  );
  // 그냥 "카페" 요청이면 프랜차이즈도 멀쩡한 답이다.
  assert.equal(
    assessSemanticFit(evidence({ ...franchise, request: "강남역 카페" }), chains).status,
    "PASS",
  );
});

test("recognises tea and cafe requests", () => {
  const cafe = assessSemanticFit(
    evidence({
      name: "연남 찻집",
      mainCategory: "카페",
      subCategory: "찻집",
      tags: ["차"],
      request: "조용한 찻집",
    }),
  );
  assert.equal(cafe.requestedIntent, "CAFE");
});

const evaluation = (candidateId: string) => ({
  candidateId,
  inputMatch: 80,
  trust: 70,
  accessibility: 75,
  diversity: 60,
  matchedSignals: [{ label: "테스트 근거", evidenceRefs: [], confidence: 0.8 }],
  negativeSignals: [],
  rationaleFacts: ["테스트 사실 1", "테스트 사실 2"],
});

const evidences = (count: number): CandidateScoringEvidence[] =>
  Array.from(
    { length: count },
    (_, index) => ({ ...evidence({}), candidateId: `c${index}` }),
  );

test("scores candidates in chunks instead of one call per candidate", async () => {
  const seenChunkSizes: number[] = [];
  const client: LlmScoringClient = ({ evidences: chunk }) => {
    seenChunkSizes.push(chunk.length);
    return Promise.resolve(chunk.map((item) => evaluation(item.candidateId)));
  };

  const result = await createScoringPipeline(client, 4)({ evidences: evidences(10) });

  assert.deepEqual(seenChunkSizes.sort((a, b) => b - a), [4, 4, 2]);
  assert.equal(result.length, 10);
});

test("keeps the rest of a chunk when one candidate breaks the response", async () => {
  const client: LlmScoringClient = ({ evidences: chunk }) => {
    // 청크 호출은 실패시키고, 후보 단위 재시도에서 c2만 계속 실패시킨다.
    if (chunk.length > 1) return Promise.reject(new Error("chunk response was malformed"));
    const only = chunk[0];
    if (!only || only.candidateId === "c2") {
      return Promise.reject(new Error("bad candidate"));
    }
    return Promise.resolve([evaluation(only.candidateId)]);
  };

  const result = await createScoringPipeline(client, 4)({ evidences: evidences(4) });

  assert.deepEqual(
    result.map((item) => item.candidateId).sort(),
    ["c0", "c1", "c3"],
    "후보 하나가 깨져도 나머지는 살아야 한다",
  );
});

test("caps reference query variants and orders the specific ones first", () => {
  const variants = buildReferenceQueryVariants(evidence({ name: "김덕후의곱창조 홍대본점" }));

  // 이름 별칭 × 쿼리 형태로 조합이 여러 개 나오되, 가장 구체적인 형태가 앞에 온다.
  // 실제 스크랩은 앞에서부터 제한된 횟수만 시도한다.
  assert.ok(variants.length > 1);
  assert.equal(variants[0]?.kind, "name_road_address");
  assert.ok(
    variants.every((variant) => variant.query.trim().length > 0),
    "빈 검색어가 섞이면 안 된다",
  );
});

test("distributes seed counts evenly across queries instead of loading the first one", () => {
  // LLM에게 산술을 시키던 예전 방식은 부족분을 전부 첫 검색어에 몰아줬다.
  // DiscoveryContextSchema가 "count 합 == targetSeedCount"를 요구한다.
  // 페이지당 개수에 상한을 걸었더니 4개 × 20 = 80 != 100이 되어 컨텍스트 생성이
  // 통째로 실패했다. 실제 기본값(검색어 4개, 목표 100)으로 불변식을 고정한다.
  for (const [count, target] of [
    [4, 100],
    [3, 50],
    [1, 100],
    [4, 7],
  ] as const) {
    const distributed = distributeSeedCounts(
      Array.from({ length: count }, (_, index) => `검색어 ${index}`),
      target,
    );
    const sum = distributed.reduce((total, query) => total + query.count, 0);
    assert.equal(sum, Math.max(target, count), `검색어 ${count}개 / 목표 ${target}에서 합이 어긋났다`);
    assert.ok(
      distributed.every((query) => query.count >= 1 && query.page === 1),
      "count는 1 이상, page는 1이어야 한다",
    );
  }

  const queries = distributeSeedCounts(["홍대 곱창", "연남 곱창", "합정 곱창"], 50);

  assert.equal(queries.length, 3);
  const counts = queries.map((query) => query.count);
  assert.ok(Math.max(...counts) - Math.min(...counts) <= 1, `편중됨: ${JSON.stringify(counts)}`);
  assert.ok(
    queries.every((query) => query.page === 1),
    "첫 호출은 1페이지여야 한다",
  );
});

test("writes engine events to a JSONL file, creating the directory as needed", async () => {
  const directory = await fileSystem.mkdtemp(path.join(tmpdir(), "reco-log-"));
  // 아직 없는 하위 디렉터리를 일부러 끼워 넣는다. sink가 직접 만들어야 한다.
  const logFile = path.join(directory, "nested", "run.log.jsonl");
  const logger = createLogger(createJsonlFileSink(logFile));

  logger.info("engine.process.start", { targetCount: 5 });
  logger.warn("engine.attempt.needs_more_seeds", { reason: "LOW_QUALITY" });
  const finish = logger.startTimer("engine.process.success");
  finish({ recommendationCount: 3 });

  // sink는 쓰기를 직렬화된 프라미스 체인으로 미룬다. 큐가 비워질 때까지 기다린다.
  await new Promise((resolve) => setTimeout(resolve, 100));

  const lines = (await fileSystem.readFile(logFile, "utf8")).trim().split("\n");
  const events = lines.map((line) => JSON.parse(line) as LogEvent);

  assert.equal(events.length, 3);
  assert.equal(events[0]?.phase, "engine.process.start");
  assert.equal(events[1]?.level, "warn");
  assert.equal(events[2]?.phase, "engine.process.success");
  assert.ok(typeof events[2]?.durationMs === "number", "소요 시간이 기록되어야 한다");

  await fileSystem.rm(directory, { recursive: true, force: true });
});

test("keeps other sinks alive when one sink throws", () => {
  const received: string[] = [];
  const logger = createLogger(
    combineSinks(
      () => {
        throw new Error("sink is broken");
      },
      (event) => received.push(event.phase),
    ),
  );

  logger.info("engine.process.start");
  assert.deepEqual(received, ["engine.process.start"]);
});

// ── 3-1. 요청 지점에서 먼 장소 (혜화 요청인데 종각) ──────────────────────────

const HYEHWA = { lat: 37.5822, lng: 127.0018 };
const JONGGAK = { lat: 37.5703, lng: 126.9829 };
const SEONGSU = { lat: 37.5445, lng: 127.0557 };

const userInputAt = (locations: { lat: number; lng: number }[]) =>
  ({ location: locations }) as unknown as Parameters<typeof toSearchRadiusMeters>[0];

test("keeps the search radius tight for a single origin", () => {
  const radius = toSearchRadiusMeters(userInputAt([HYEHWA]));
  const gate = toMaxCandidateDistanceMeters(radius);
  const hyehwaToJonggak = toDistanceMeters(HYEHWA, JONGGAK);

  // 혜화-종각은 약 2km다. 예전 반경 5km에서는 당연히 포함됐다.
  assert.ok(hyehwaToJonggak > 1_500, `실제 거리 ${hyehwaToJonggak}m`);
  assert.ok(
    hyehwaToJonggak > gate,
    `혜화 요청에서 종각(${hyehwaToJonggak}m)은 허용 거리 ${gate}m를 넘어야 한다`,
  );
});

test("keeps same-neighbourhood places and blocks clearly different areas", () => {
  // 반경은 감이 아니라 서울 실좌표로 보정했다.
  //   같은 생활권 최대: 1,345m (성수-건대입구)
  //   다른 동네 최소:   2,021m (강남-선릉)
  // 허용 거리가 이 둘 사이에 있어야 한다. 넓히면 "혜화 요청에 종각"이 되살아나고,
  // 좁히면 홍대에서 합정이 잘린다.
  const AREA = {
    홍대입구: { lat: 37.5571, lng: 126.9245 },
    합정: { lat: 37.5495, lng: 126.9137 },
    성수: { lat: 37.5445, lng: 127.0557 },
    건대입구: { lat: 37.5403, lng: 127.07 },
    혜화: { lat: 37.5822, lng: 127.0018 },
    종각: { lat: 37.5703, lng: 126.9829 },
    강남: { lat: 37.4979, lng: 127.0276 },
    선릉: { lat: 37.5044, lng: 127.049 },
  };

  const gate = toMaxCandidateDistanceMeters(toSearchRadiusMeters(userInputAt([AREA.홍대입구])));

  for (const [from, to] of [
    [AREA.홍대입구, AREA.합정],
    [AREA.성수, AREA.건대입구],
  ] as const) {
    assert.ok(toDistanceMeters(from, to) <= gate, "같은 생활권은 통과해야 한다");
  }

  for (const [from, to] of [
    [AREA.혜화, AREA.종각],
    [AREA.강남, AREA.선릉],
  ] as const) {
    assert.ok(toDistanceMeters(from, to) > gate, "다른 동네는 걸러져야 한다");
  }
});

test("uses the midpoint of every participant as the search center", () => {
  // 예전에는 location[0]만 썼다. 혜화와 성수에서 모이면 혜화 주변만 뒤졌다.
  const center = toSearchCenter(userInputAt([HYEHWA, SEONGSU]));
  assert.ok(center);

  const toHyehwa = toDistanceMeters(center, HYEHWA);
  const toSeongsu = toDistanceMeters(center, SEONGSU);
  assert.ok(
    Math.abs(toHyehwa - toSeongsu) < 50,
    `중심이 한쪽으로 치우쳤다: 혜화 ${toHyehwa}m / 성수 ${toSeongsu}m`,
  );
});

test("widens the radius for participants who are far apart", () => {
  const alone = toSearchRadiusMeters(userInputAt([HYEHWA]));
  const spread = toSearchRadiusMeters(userInputAt([HYEHWA, SEONGSU]));

  assert.ok(spread > alone, "멀리 흩어져 있으면 반경이 넓어져야 한다");
  // 재시도로 넓혀도 상한을 넘지 않는다.
  assert.ok(toSearchRadiusMeters(userInputAt([HYEHWA]), 9) <= 6_000);
});

// ── 3-2. 의미가 안 맞는 장소 (카페 요청인데 고양이카페) ──────────────────────

test("rejects theme cafes for a plain cafe request", () => {
  for (const [name, sub] of [
    ["캣츠 고양이카페", "고양이카페"],
    ["멍멍이 애견카페", "애견카페"],
    ["빽다방 스터디카페", "스터디카페"],
    ["홍대 만화카페", "만화카페"],
  ] as const) {
    const result = assessSemanticFit(
      evidence({ name, mainCategory: "카페", subCategory: sub, tags: [sub], request: "조용한 카페" }),
    );
    assert.equal(result.status, "PENALIZE", `${name}이 통과되면 안 된다`);
    assert.equal(result.severity, "STRONG", `${name}은 강한 감점이어야 한다`);
  }
});

test("matches theme cafe signals even when the category has spaces", () => {
  // `/고양이카페/`는 "고양이 카페"(띄어쓰기)를 매칭하지 못하던 구멍이 있었다.
  const spaced = assessSemanticFit(
    evidence({
      name: "캣츠 고양이 카페",
      mainCategory: "카페",
      subCategory: "고양이 카페",
      tags: ["고양이 카페"],
      request: "조용한 카페",
    }),
  );
  assert.equal(spaced.severity, "STRONG");
});

test("allows a theme cafe when the request asks for that theme", () => {
  const asked = assessSemanticFit(
    evidence({
      name: "캣츠 고양이카페",
      mainCategory: "카페",
      subCategory: "고양이카페",
      tags: ["고양이카페"],
      request: "고양이 카페 가고 싶어",
    }),
  );
  assert.equal(asked.status, "PASS");
});

test("keeps an ordinary cafe passing", () => {
  const ordinary = assessSemanticFit(
    evidence({
      name: "연남 로스터리",
      mainCategory: "카페",
      subCategory: "커피전문점",
      tags: ["커피전문점"],
      request: "조용한 카페",
    }),
  );
  assert.equal(ordinary.status, "PASS");
});

// ── 3-3. 이상한 요청 커트 ────────────────────────────────────────────────────

test("rejects gibberish requests before spending the pipeline", () => {
  for (const request of [
    "ㅁㄴㅇㄹ",
    "ㅋㅋㅋㅋㅋ",
    "ㅠㅠ",
    "!!!!!",
    "aaaaaa",
    "1",
    " ",
    // 실제로 써 갈긴 입력은 대개 섞여 있다. 예전에는 **문자열 전체**가 낱자일 때만
    // 걸러서 이게 그대로 통과했고, 파이프라인 전체를 66초 동안 돌린 뒤 끝났다.
    "ㅁㄴㅇㄹㅁㄴㅇㄹ asdf 1234 ㅋㅋㅋㅋㅋ",
    "ㅋㅋㅋㅋㅋㅋㅋ ㅎㅎ 123",
  ]) {
    assert.equal(
      validateNaturalLanguageRequest(request).usable,
      false,
      `"${request}"는 걸러져야 한다`,
    );
  }
});

test("keeps ordinary requests usable", () => {
  for (const request of [
    "홍대 곱창",
    "조용한 카페",
    "친구랑 갈 만한 파스타집",
    "cafe",
    "성수동 브런치 추천해줘",
    // 말끝에 붙는 낱자는 정상 요청에도 흔하다. 이걸 막으면 훨씬 나쁘다.
    "홍대 맛집 추천해줘ㅋㅋ",
    "분위기 좋은 곳 없나요ㅠㅠ",
  ]) {
    assert.equal(
      validateNaturalLanguageRequest(request).usable,
      true,
      `"${request}"는 통과해야 한다`,
    );
  }
});

// ── 3-4. 폐업 장소 필터 ──────────────────────────────────────────────────────

const enrichmentWith = (overrides: Record<string, unknown>) =>
  ({
    candidateId: "c1",
    source: "naver-map",
    sourceUrls: [],
    operationVerification: { status: "OPEN", confidence: 0.9, reason: "", sourceUrls: [] },
    ...overrides,
  }) as unknown as Parameters<typeof assessClosure>[0];

test("detects a permanently closed place from page text", () => {
  for (const text of [
    "이 장소는 폐업하였습니다.",
    "영업 종료된 매장입니다",
    "permanently closed",
    "더 이상 운영하지 않습니다",
  ]) {
    assert.equal(assessClosure(enrichmentWith({ rawTextSnippet: text })).closed, true, text);
  }
});

test("does not treat a regular holiday as a closure", () => {
  // 명절 휴무나 정기휴무는 영업시간 판정이 다룰 문제다. 여기서 걸러내면
  // 멀쩡한 가게가 사라진다.
  for (const text of ["매주 월요일 휴무", "설 연휴 임시휴업", "브레이크타임 15:00~17:00"]) {
    assert.equal(assessClosure(enrichmentWith({ rawTextSnippet: text })).closed, false, text);
  }
});

test("treats a place closed on every weekday as closed for good", () => {
  const allClosed = Object.fromEntries(
    ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"].map((day) => [
      day,
      { status: "CLOSED" },
    ]),
  );
  const assessment = assessClosure(
    enrichmentWith({ operationInfo: { timezone: "Asia/Seoul", schedules: allClosed } }),
  );
  assert.equal(assessment.closed, true);
});

test("recognises real map phrasings as an operation-hour signal", () => {
  // 이 게이트가 false면 LLM 파서를 호출조차 하지 않고 UNKNOWN으로 끝난다.
  // 실측 UNKNOWN 118건 중 50건이 여기서 죽었다. 카카오맵의 실제 표기를 넣는다.
  for (const text of [
    "영업 전 11:30 오픈",
    "영업 종료 22:00",
    "매일 11:30 - 23:00",
    "11:30~23:00 라스트오더 22:00",
    "평일 09:00-18:00 주말 휴무",
    "월~금 11:00 - 21:00",
    "24시간 영업 00:00",
    "연중무휴 10:00~22:00",
  ]) {
    assert.equal(hasOperationSignal(text), true, `"${text}"는 신호로 인식돼야 한다`);
  }
});

test("does not treat text without any clock time as an operation-hour signal", () => {
  for (const text of [
    "영업시간 정보 없음",
    "휴무일 안내",
    "본문 바로가기 메뉴 바로가기 지도 검색 로그인 카카오맵",
    "",
  ]) {
    assert.equal(hasOperationSignal(text), false, `"${text}"는 신호가 아니어야 한다`);
  }
});

test("strips style and script blocks out of scraped page text", () => {
  // 예전에는 <script>만 걷어내서 CSS 본문이 그대로 텍스트로 남았다. 실측에서
  // 카카오맵 스크랩이 "body, div, ul { margin: 0 } ..."로 시작했고 네이버는
  // 4만 자 중 대부분이 CSS였다. 그 쓰레기가 영업시간 파서에 그대로 들어갔다.
  const html = [
    "<html><head>",
    "<style>body, div, ul, li { margin: 0; padding: 0 } img { border: 0 none }</style>",
    "<script>var a = 1; document.write('영업시간 99:99');</script>",
    "</head><body>",
    "<!-- 주석 안의 영업시간 00:00 -->",
    "<div>영업정보</div><div>매일 09:00 ~ 03:00</div>",
    "<noscript>자바스크립트를 켜주세요</noscript>",
    "</body></html>",
  ].join("");

  const text = stripHtml(html).replace(/\s+/gu, " ").trim();

  assert.ok(text.includes("영업정보"), "본문은 남아야 한다");
  assert.ok(text.includes("매일 09:00 ~ 03:00"), "영업시간은 남아야 한다");
  assert.ok(!text.includes("margin"), "CSS가 남으면 안 된다");
  assert.ok(!text.includes("border"), "CSS가 남으면 안 된다");
  assert.ok(!text.includes("99:99"), "script 내용이 남으면 안 된다");
  assert.ok(!text.includes("00:00"), "주석 내용이 남으면 안 된다");
  assert.ok(!text.includes("자바스크립트를"), "noscript가 남으면 안 된다");
});

test("recognises a bot-check page so it is not mistaken for missing hours", () => {
  // 네이버는 헤드리스를 감지하면 보안 확인 페이지를 준다. 거기엔 영업시간이
  // 없으니 "정보 없음"으로 기록되는데, 그건 가게 문제가 아니라 우리 문제다.
  for (const text of [
    "네이버 NAVER 보안 확인을 완료해 주세요. 이 절차는 귀하가 실제 사용자임을",
    "자동 입력 방지 문자를 입력해 주세요",
    "비정상적인 접근이 감지되었습니다",
    "Please complete the CAPTCHA",
  ]) {
    assert.equal(isBotCheckPage(text), true, `"${text.slice(0, 20)}..."는 차단으로 봐야 한다`);
  }

  assert.equal(isBotCheckPage("영업정보 매일 09:00 ~ 03:00 연중무휴"), false);
});

test("does not turn a current-status line into a day-long closure", () => {
  // 네이버 지도 패널의 "영업 종료 11:00에 영업 시작"은 **지금** 영업 전이라는 뜻이지
  // 그날 하루 쉰다는 뜻이 아니다. 예전에는 이걸 요청 요일 CLOSED로 단정해서,
  // 카카오에서 연중무휴 09:00~03:00으로 확인된 가게가 "일요일 휴무"로 탈락했다.
  const parsed = parseOperationInfo(
    "영업시간 영업 종료 11:00에 영업 시작 11시 0분에 영업 시작 펼쳐보기 전화번호",
    "SUNDAY",
  );

  const sunday = parsed?.schedules.SUNDAY;
  assert.ok(
    sunday === undefined || sunday.status !== "CLOSED",
    `현재 상태 문구로 휴무를 단정하면 안 된다: ${JSON.stringify(sunday)}`,
  );
});

test("still reads a real weekly schedule", () => {
  // 오탐을 없애면서 정상 파싱까지 죽이면 안 된다.
  const parsed = parseOperationInfo("영업시간 매일 09:00 ~ 03:00 연중무휴", "SUNDAY");
  assert.equal(parsed?.schedules.SUNDAY?.status, "OPEN");
  assert.equal(parsed?.schedules.MONDAY?.status, "OPEN");
});

test("ranks an hours-verified candidate above an unverified one", () => {
  // 영업시간 미확인 후보를 버리지 않고 예비로 쓰되, 확인된 후보보다는 항상 아래여야 한다.
  const base = { ...evidence({}), semanticFit: { severity: "NONE", score: 1 } };
  const verified = { ...base, candidateId: "verified" } as CandidateScoringEvidence;
  const unverified = {
    ...base,
    candidateId: "unverified",
    operationUnverified: true,
  } as CandidateScoringEvidence;

  const ranked = buildRankedCandidates(
    [unverified, verified],
    [evaluation("unverified"), evaluation("verified")],
    { inputMatch: 1, trust: 1, accessibility: 1, diversity: 1 },
  );

  assert.equal(ranked[0]?.evidence.candidateId, "verified", "확인된 후보가 위여야 한다");
  assert.ok(
    (ranked[0]?.scores.total ?? 0) > (ranked[1]?.scores.total ?? 0),
    "미확인 후보는 감점되어야 한다",
  );
});

test("still returns the unverified candidate rather than dropping it", () => {
  const unverified = {
    ...evidence({}),
    candidateId: "unverified",
    operationUnverified: true,
    semanticFit: { severity: "NONE", score: 1 },
  } as CandidateScoringEvidence;

  const ranked = buildRankedCandidates([unverified], [evaluation("unverified")], {
    inputMatch: 1,
    trust: 1,
    accessibility: 1,
    diversity: 1,
  });

  // 예전에는 이런 후보가 아예 버려져 후보 부족 → 재시도 반복 → 느려짐으로 이어졌다.
  assert.equal(ranked.length, 1);
});

test("skips the expensive Naver lookup once Kakao already verified the place", async () => {
  // 출력 계약은 카카오·네이버 둘 중 하나만 요구하는데 예전에는 항상 둘 다 확인했다.
  // 네이버 확인은 후보마다 Playwright로 지도를 여러 번 긁는 가장 비싼 단계라
  // 실측 271초 중 166초(61%)를 혼자 썼다.
  let naverCalled = false;

  const evidenceWithKakao = {
    ...evidence({}),
    enrichment: {
      sourceDetails: [
        {
          source: "kakao-local",
          status: "OPEN",
          confidence: 0.9,
          identityMatchScore: 0.95,
          sourceUrls: ["https://place.map.kakao.com/12345678"],
        },
      ],
    },
  } as unknown as CandidateScoringEvidence;

  const resolution = await resolveCandidateReferenceUrls(evidenceWithKakao, {
    kakaoRestApiKey: undefined,
    getBrowser: () => {
      naverCalled = true;
      return Promise.reject(new Error("브라우저를 띄우면 안 된다"));
    },
    scrapeRequests: new Map(),
    timeoutMs: 1_000,
    settleMs: 100,
  });

  assert.equal(naverCalled, false, "카카오가 확인됐으면 네이버 스크랩을 시도하면 안 된다");
  assert.ok(resolution.referenceUrls?.kakaoMap, "카카오 URL은 그대로 채워져야 한다");
});

test("throws only when no candidate could be scored at all", async () => {
  const client: LlmScoringClient = () => Promise.reject(new Error("openai down"));

  await assert.rejects(
    createScoringPipeline(client, 4)({ evidences: evidences(4) }),
    /no usable evaluation/,
  );
});

test("collapses the same place discovered by both providers", () => {
  // TMap과 카카오는 같은 가게에도 좌표를 조금씩 다르게 주고, seedKey는 provider별로
  // 만들어진다. 그대로 두면 같은 가게를 두 번 조사하고 추천에도 중복으로 오른다.
  const { seeds } = dedupeAndExclude(
    [
      seed({ provider: "kakao", providerPlaceId: "1", name: "벤스쿠키 홍대입구점" }),
      seed({
        provider: "tmap",
        providerPlaceId: "2",
        name: "벤스쿠키",
        latitude: 37.5557,
        longitude: 126.9227,
      }),
    ],
    [],
  );

  assert.equal(seeds.length, 1, "같은 가게는 하나로 합쳐야 한다");
  assert.equal(seeds[0]?.provider, "kakao", "참조 URL을 들고 있는 카카오 쪽을 남겨야 한다");
});

test("keeps different places that merely sit in the same building", () => {
  // 좌표만으로 합치면 한 건물의 다른 가게까지 잡아먹는다. 이름도 같아야 한다.
  const { seeds } = dedupeAndExclude(
    [
      seed({ provider: "kakao", providerPlaceId: "1", name: "아톰상사 홍대점" }),
      seed({ provider: "tmap", providerPlaceId: "2", name: "플랜트랩 홍대점" }),
    ],
    [],
  );

  assert.equal(seeds.length, 2);
});

test("keeps same-name franchise branches that are far apart", () => {
  const { seeds } = dedupeAndExclude(
    [
      seed({ provider: "kakao", providerPlaceId: "1", name: "본도시락" }),
      // 약 1.4km 떨어진 다른 지점.
      seed({
        provider: "tmap",
        providerPlaceId: "2",
        name: "본도시락",
        latitude: 37.5682,
        longitude: 126.9226,
      }),
    ],
    [],
  );

  assert.equal(seeds.length, 2, "멀리 떨어진 동명 지점은 다른 가게다");
});

test("gives a discovery-time kakao url priority over an equally good candidate", () => {
  // 출력 계약은 참조 URL 없는 후보를 받지 않는다. 확인이 공짜인 후보를 먼저
  // 조사해야 같은 배치 예산으로 살아남는 후보가 많아진다.
  const withKakaoUrl = evidence({});
  const bare = evidence({});

  assert.equal(
    findExistingKakaoMapUrl({
      ...withKakaoUrl,
      raw: {
        ...withKakaoUrl.raw,
        seed: {
          ...withKakaoUrl.raw.seed,
          provider: "kakao",
          placeUrl: "http://place.map.kakao.com/12345",
        },
      },
    }),
    "http://place.map.kakao.com/12345",
  );
  assert.equal(findExistingKakaoMapUrl(bare), undefined);
});

test("penalises a restaurant that serves a different dish than requested", () => {
  // "회기 곱창" 요청에 김밥집(진김밥, 김가네)과 마라탕집이 상위로 올라왔다.
  // 기존 규칙은 카페와 술집만 걸러서 음식점끼리의 어긋남은 그대로 통과했다.
  const gimbap = assessSemanticFit(
    evidence({
      name: "진김밥",
      subCategory: "분식",
      tags: ["음식점", "분식", "김밥"],
      request: "회기 곱창",
    }),
  );
  const mala = assessSemanticFit(
    evidence({
      name: "마라대학",
      subCategory: "중식",
      tags: ["음식점", "중식", "마라탕"],
      request: "회기 곱창",
    }),
  );

  assert.equal(gimbap.status, "PENALIZE");
  assert.equal(mala.status, "PENALIZE");
});

test("leaves a place that actually serves the requested dish alone", () => {
  const gopchang = assessSemanticFit(
    evidence({
      name: "경희맛나곱창",
      subCategory: "곱창,막창,양",
      tags: ["음식점", "한식", "곱창,막창,양"],
      request: "회기 곱창",
    }),
  );

  assert.equal(gopchang.status, "PASS");
});

test("does not read the district name 회기 as a raw-fish request", () => {
  // `회` 한 글자를 패턴에 넣으면 "회기", "회식", "회관"까지 횟집으로 잡는다.
  // 한국어는 JS의 `\b`로 단어를 자를 수 없으니 애초에 긴 어휘만 써야 한다.
  const gopchangInHoegi = assessSemanticFit(
    evidence({
      name: "홍곱창 회기본점",
      subCategory: "곱창,막창,양",
      tags: ["음식점", "한식", "곱창,막창,양"],
      request: "회기 곱창",
    }),
  );

  assert.equal(gopchangInHoegi.status, "PASS");
});

test("keeps a vaguely categorised restaurant rather than guessing against it", () => {
  // 카카오 카테고리가 "음식점 > 한식"까지만 붙은 가게가 많다. 어느 계열에도
  // 걸리지 않는다는 이유로 떨어뜨리면 정보 부실을 가게 탓으로 돌리는 셈이다.
  const vague = assessSemanticFit(
    evidence({
      name: "장군집",
      subCategory: "한식",
      tags: ["음식점", "한식"],
      request: "회기 곱창",
    }),
  );

  assert.equal(vague.status, "PASS");
});

test("does not apply the dish filter when no dish was requested", () => {
  const anyRestaurant = assessSemanticFit(
    evidence({
      name: "진김밥",
      subCategory: "분식",
      tags: ["음식점", "분식", "김밥"],
      request: "홍대 맛집",
    }),
  );

  assert.equal(anyRestaurant.status, "PASS");
});

test("sends TMap an integer radius so the search does not 400", () => {
  // TMap의 `radius`는 km 정수만 받는다. 검색 반경을 5,000m에서 1,500m로 좁히면서
  // 1.5가 넘어갔고, 그때부터 TMap이 모든 검색어에서 400으로 죽었다. 실패가 빈
  // 결과로 바뀌던 탓에 카카오 혼자 돌고 있다는 걸 아무도 몰랐다.
  for (const radiusKm of [1.5, 2.4, 3.84, 6.0]) {
    const sent = toTmapRadiusKm(radiusKm);
    assert.equal(Number.isInteger(sent), true, `${radiusKm}km가 정수로 안 바뀐다`);
    assert.ok(sent >= radiusKm, "의도한 반경보다 좁게 찾으면 경계의 장소를 놓친다");
  }
});

test("never sends TMap a zero or out-of-range radius", () => {
  assert.equal(toTmapRadiusKm(0.2), 1, "0km는 반경 조건 자체가 무의미해진다");
  assert.equal(toTmapRadiusKm(100), 33, "TMap 상한을 넘기면 다시 400이다");
});

test("refuses a same-brand branch that sits too far to be the same store", () => {
  // 지도 링크를 눌렀더니 다른 동네의 같은 브랜드 지점이 열리던 버그. 이름과 주소만
  // 보던 승인 규칙에는 거리 조건이 없어서, 반경 2km 안의 다른 지점이 그대로 통과했다.
  const farBranch = scoreStructuredReferenceIdentity({
    actualName: "이디야커피 회기점",
    actualRoadAddress: "서울 동대문구 회기로 100",
    actualAddress: "서울 동대문구 회기동 100",
    expected: {
      name: "이디야커피 회기역중앙점",
      placeInfo: {
        roadAddress: "서울 동대문구 회기로 5",
        address: "서울 동대문구 회기동 5",
      },
    } as never,
    distanceMeters: 1_400,
  });

  assert.equal(farBranch.accepted, false, "1.4km 떨어진 지점을 같은 가게로 보면 안 된다");
  assert.ok(farBranch.identityScore < 0.35, "보강 조회 문턱 아래로 떨어져야 한다");
});

test("still accepts the same store when the two providers disagree slightly", () => {
  // 제공자 간 좌표 편차는 수십 m 수준이다. 거기까지 잘라내면 멀쩡한 매칭을 버린다.
  const samePlace = scoreStructuredReferenceIdentity({
    actualName: "이디야커피 회기역중앙점",
    actualRoadAddress: "서울 동대문구 회기로 5",
    actualAddress: "서울 동대문구 회기동 5",
    expected: {
      name: "이디야커피 회기역중앙점",
      placeInfo: {
        roadAddress: "서울 동대문구 회기로 5",
        address: "서울 동대문구 회기동 5",
      },
    } as never,
    distanceMeters: 40,
  });

  assert.equal(samePlace.accepted, true);
});

test("penalises a place whose real prices exceed the budget", () => {
  // 예산은 사용자가 직접 넣은 조건인데 LLM의 inputMatch 안에서만 느슨하게 반영됐다.
  const overBudget = {
    ...evidence({}),
    placeInfo: { address: "서울", roadAddress: "서울", priceRangePerPerson: [60_000, 90_000] },
    userFit: { naturalLanguageRequest: "홍대 맛집", budgetPerPerson: [10_000, 35_000] },
  } as never as CandidateScoringEvidence;

  assert.equal(isClearlyOverBudget(overBudget), true);
});

test("does not judge budget from a category guess", () => {
  // 가격 근거를 못 찾아 업종 추정치를 넣은 후보까지 예산으로 재면, 근거 없는 값으로
  // 멀쩡한 가게를 떨어뜨리게 된다.
  const noPriceEvidence = {
    ...evidence({}),
    placeInfo: { address: "서울", roadAddress: "서울" },
    userFit: { naturalLanguageRequest: "홍대 맛집", budgetPerPerson: [10_000, 35_000] },
  } as never as CandidateScoringEvidence;

  assert.equal(isClearlyOverBudget(noPriceEvidence), false);
});

test("treats a cheaper place as fitting the budget", () => {
  // 예산은 상한이지 맞춰야 할 목표가 아니다.
  const cheap = {
    ...evidence({}),
    placeInfo: { address: "서울", roadAddress: "서울", priceRangePerPerson: [6_000, 9_000] },
    userFit: { naturalLanguageRequest: "홍대 맛집", budgetPerPerson: [10_000, 35_000] },
  } as never as CandidateScoringEvidence;

  assert.equal(isClearlyOverBudget(cheap), false);
});

test("knows when a request names a specific type and when it does not", () => {
  for (const request of ["회기 곱창", "강남역 조용한 카페", "을지로 맥주 펍", "성수 데이트 파스타"]) {
    assert.equal(requestNamesDishFamily(request), true, `"${request}"는 업종을 지목한다`);
  }
  for (const request of ["다 같이 모여서 저녁 먹을 곳", "놀 만한 곳", "분위기 좋은 데"]) {
    assert.equal(requestNamesDishFamily(request), false, `"${request}"는 포괄적이다`);
  }
});

test("puts the requested dish ahead of an unrelated restaurant", () => {
  // 조사 예산은 한정돼 있어 앞쪽 후보만 본다. 순서가 뒤섞이면 요청과 무관한 가게를
  // 조사하느라 정작 맞는 가게가 조사되지 못한 채 잘린다.
  assert.equal(scoreDishAffinity("회기 곱창", "태곱이네 음식점 한식 곱창"), 1);
  assert.equal(scoreDishAffinity("회기 곱창", "진김밥 음식점 분식 김밥"), -1);
  // 업종을 지목하지 않은 요청에서는 아무도 밀거나 당기지 않는다.
  assert.equal(scoreDishAffinity("다 같이 저녁 먹을 곳", "진김밥 음식점 분식 김밥"), 0);
  // 업종을 알 수 없는 후보는 추측으로 밀어내지 않는다.
  assert.equal(scoreDishAffinity("회기 곱창", "장군집 음식점 한식"), 0);
});

test("does not spend two recommendation slots on the same spot", () => {
  // 실측에서 "강남역 조용한 카페" 추천 두 곳의 거리가 0m(같은 지하상가), "을지로 맥주 펍"이
  // 1m였다. 다른 가게이긴 해도 "어디로 갈까"를 정하는 입장에서는 같은 자리다.
  const at = (candidateId: string, lat: number, lng: number, total: number) =>
    ({
      evidence: {
        candidateId,
        name: `가게-${candidateId}`,
        category: { mainCategory: "음식점", subCategory: "한식", tags: [] },
        raw: { seed: { latitude: lat, longitude: lng } },
      },
      llm: {},
      scores: { total },
    }) as never;

  const picked = selectTopWithSpatialSpread(
    [
      at("a", 37.5, 127.0, 90),
      // a에서 약 9m. 점수는 2등이지만 사실상 같은 자리다.
      at("b", 37.50008, 127.0, 85),
      at("c", 37.503, 127.0, 80),
      at("d", 37.506, 127.0, 70),
    ],
    3,
  );

  assert.deepEqual(
    picked.map((entry: { evidence: { candidateId: string } }) => entry.evidence.candidateId),
    ["a", "c", "d"],
  );
});

test("fills the list from deferred neighbours rather than returning fewer", () => {
  // 자리를 비워두는 것보다는 가까운 후보라도 채우는 편이 낫다.
  const at = (candidateId: string, lat: number, total: number) =>
    ({
      evidence: {
        candidateId,
        name: `가게-${candidateId}`,
        category: { mainCategory: "음식점", subCategory: "한식", tags: [] },
        raw: { seed: { latitude: lat, longitude: 127.0 } },
      },
      llm: {},
      scores: { total },
    }) as never;

  const picked = selectTopWithSpatialSpread([at("a", 37.5, 90), at("b", 37.50008, 85)], 2);

  assert.equal(picked.length, 2, "후보가 부족하면 밀어낸 후보로 채워야 한다");
});

test("asks Kakao for more than one page when the requested count needs it", async () => {
  // 카카오는 한 페이지에 최대 15건이다. 예전에는 1페이지만 받고 끝내서 25건을
  // 요청해도 15건만 얻었고, "회기 곱창"의 채점 대상이 14건까지 줄었다.
  const seenPages: number[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL) => {
    // ky는 Request 객체로 호출한다. toString()은 URL을 주지 않는다.
    const url = new URL(input instanceof Request ? input.url : String(input));
    seenPages.push(Number(url.searchParams.get("page")));
    const documents = Array.from({ length: 15 }, (_, index) => ({
      id: `${url.searchParams.get("page")}-${index}`,
      place_name: `가게${index}`,
      category_name: "음식점",
      category_group_code: "FD6",
      category_group_name: "음식점",
      phone: "",
      address_name: "서울 마포구 서교동 1",
      road_address_name: "서울 마포구 양화로 1",
      x: "126.9",
      y: "37.5",
      place_url: "http://place.map.kakao.com/1",
      distance: "100",
    }));
    return Promise.resolve(
      new Response(
        JSON.stringify({
          documents,
          meta: { total_count: 45, pageable_count: 45, is_end: false, same_name: null },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
  });

  try {
    const result = await searchKakaoLocal(
      { query: "곱창", pagination: { page: 1, count: 25 } },
      { restApiKey: "test" },
    );
    assert.deepEqual(seenPages, [1, 2], "25건을 요청했으면 2페이지까지 받아야 한다");
    assert.equal(result.seeds.length, 25, "요청한 개수만큼 잘라서 돌려줘야 한다");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rejects a business that is not food or drink at all", () => {
  // "강남역 조용한 카페" 결과에 `프린트카페 강남역지하상가점`(서비스 > 산업 > 인쇄,복사)이
  // 들어왔다. 상호에 "카페"가 들어갔을 뿐 인쇄소다.
  const printShop = assessSemanticFit(
    evidence({
      name: "프린트카페 강남역지하상가점",
      mainCategory: "서비스",
      subCategory: "산업",
      tags: ["서비스", "산업", "인쇄", "복사"],
      request: "강남역 조용한 카페",
    }),
  );

  assert.equal(printShop.status, "PENALIZE");
  assert.equal(printShop.severity, "STRONG");
});

test("keeps a real pub whose main category is not 음식점", () => {
  // 카카오는 일부 술집을 "생활편의 > 술집"으로 분류한다. 대분류만 보면 안 된다.
  const pub = assessSemanticFit(
    evidence({
      name: "만선호프 노가리체인본점",
      mainCategory: "생활편의",
      subCategory: "술집",
      tags: ["생활편의", "술집", "호프"],
      request: "을지로 맥주 펍",
    }),
  );

  assert.equal(pub.status, "PASS");
});

test("does not punish a candidate whose category is simply unknown", () => {
  // 업종 정보가 비어 있는 걸 가게 탓으로 돌리면 안 된다.
  const unknown = assessSemanticFit(
    evidence({ name: "이름만 있는 집", mainCategory: "", subCategory: "", tags: [], request: "홍대 맛집" }),
  );

  assert.equal(unknown.status, "PASS");
});

test("treats a plain meat restaurant as a different dish from 곱창", () => {
  // 카카오는 고깃집을 "음식점 > 한식 > 육류,고기"로 분류한다. `고깃집`만 보면
  // 새마을식당·고기굽는방앗간이 "업종 미상"으로 빠져나가 곱창 요청에 섞였다.
  const meatHouse = assessSemanticFit(
    evidence({
      name: "새마을식당 청량리점",
      subCategory: "한식",
      tags: ["음식점", "한식", "육류", "고기"],
      request: "회기 곱창",
    }),
  );
  const gopchang = assessSemanticFit(
    evidence({
      name: "경희맛나곱창",
      subCategory: "한식",
      tags: ["음식점", "한식", "육류", "고기", "곱창"],
      request: "회기 곱창",
    }),
  );

  assert.equal(meatHouse.status, "PENALIZE");
  assert.equal(gopchang.status, "PASS", "곱창집은 육류 태그가 있어도 요청 계열로 먼저 걸려야 한다");
});

test("does not let one brand take over the list", () => {
  // "홍대 곱창" 추천 10건 중 3건이 `김덕후의곱창조`(본점·2호점·3호점)였고,
  // "회기역 이자카야"에는 `오사카고양이` 두 지점이 들어왔다.
  const branch = (name: string, lat: number, total: number) =>
    ({
      evidence: {
        candidateId: name,
        name,
        category: { mainCategory: "음식점", subCategory: "한식", tags: [] },
        raw: { seed: { latitude: lat, longitude: 127.0 } },
      },
      llm: {},
      scores: { total },
    }) as never;

  const picked = selectTopWithSpatialSpread(
    [
      branch("김덕후의곱창조 홍대본점", 37.5, 95),
      branch("김덕후의곱창조 홍대2호점", 37.51, 90),
      branch("김덕후의곱창조 홍대3호점", 37.52, 85),
      branch("마포곱창타운", 37.53, 60),
    ],
    3,
  );

  const brands = picked.map((entry: { evidence: { name: string } }) => entry.evidence.name);
  assert.equal(brands[0], "김덕후의곱창조 홍대본점", "가장 높은 지점은 남아야 한다");
  assert.ok(brands.includes("마포곱창타운"), "다른 브랜드가 밀려나면 안 된다");
});

test("keeps meat-first restaurants out of a vegan request", () => {
  // "이태원 비건 식당" 추천에 술탄케밥·케르반레스토랑·봄베그릴·타코아미고가 들어왔다.
  // 채식은 업종이 아니라 식재료 제약이라 업종 기준 규칙으로는 걸러지지 않았다.
  const kebab = assessSemanticFit(
    evidence({
      name: "술탄케밥",
      subCategory: "아시아음식",
      tags: ["음식점", "아시아음식", "터키음식", "케밥"],
      request: "이태원 비건 식당",
    }),
  );

  assert.equal(kebab.status, "PENALIZE");
  assert.equal(kebab.severity, "STRONG");
});

test("still allows a meat place when the request itself asks for it", () => {
  // "비건 옵션 있는 고깃집"처럼 요청이 직접 언급하면 막지 않는다.
  const result = assessSemanticFit(
    evidence({
      name: "이태원 고깃집",
      subCategory: "한식",
      tags: ["음식점", "한식", "육류", "고기"],
      request: "비건 메뉴도 있는 고깃집",
    }),
  );

  assert.notEqual(result.severity, "STRONG");
});

test("keeps investigating even when the shortlist call fails", async () => {
  // 사전 선별은 순서를 개선하는 단계이지 없으면 안 되는 단계가 아니다.
  // 실패했다고 후보를 잃으면 그게 훨씬 나쁘다.
  const logger = createLogger(() => {});
  const relevance = await scoreShortlistRelevance(
    { userNaturalLanguageRequest: "홍대 곱창" } as never,
    [evidence({ name: "가게1" }), evidence({ name: "가게2" })],
    logger,
    { openAiApiKey: "invalid-key-for-test" },
  );

  assert.equal(relevance.size, 0, "실패하면 빈 결과를 돌려줘야 한다");
});

test("returns nothing to score when there are no candidates", async () => {
  const logger = createLogger(() => {});
  const relevance = await scoreShortlistRelevance(
    { userNaturalLanguageRequest: "홍대 곱창" } as never,
    [],
    logger,
  );

  assert.equal(relevance.size, 0);
});

test("catches chains that no hardcoded list would have covered", () => {
  // 목록 방식일 때 폴바셋·텐퍼센트커피·헤이티가 빠져 있었고, 채우자 백미당·디저트39가
  // 남았다. 빈도 방식은 브랜드를 몰라도 잡는다.
  const pool = [
    "폴바셋 강남점",
    "폴바셋 강남삼성타운점",
    "백미당 강남역점",
    "백미당 강남358타워점",
    "디저트39 강남 테헤란로점",
    "디저트39 강남역점",
    "브라운홀릭",
  ];
  const chains = findChainBrands(pool);

  for (const name of ["폴바셋 강남점", "백미당 강남역점", "디저트39 강남역점"]) {
    const result = assessSemanticFit(
      evidence({
        name,
        subCategory: "카페",
        tags: ["음식점", "카페", "커피전문점"],
        request: "강남역 조용한 카페",
      }),
      chains,
    );
    assert.equal(result.status, "PENALIZE", `${name}가 감점되어야 한다`);
  }
});


test("identifies chains from the candidate pool instead of a brand list", () => {
  // 예전에는 프랜차이즈를 상호 목록으로 판정했다. 목록은 늘 뒤처진다 — 폴바셋·
  // 텐퍼센트커피가 빠져 있었고, 채우자 백미당·디저트39가 남았다.
  const chains = findChainBrands([
    "스타벅스 강남R점",
    "스타벅스 강남GT타워점",
    "폴바셋 강남점",
    "폴바셋 강남삼성타운점",
    "브라운홀릭",
    "하마커피",
  ]);

  assert.equal(chains.has("스타벅스"), true);
  assert.equal(chains.has("폴바셋"), true, "목록에 없던 브랜드도 빈도로 잡혀야 한다");
  assert.equal(chains.has("브라운홀릭"), false, "지점이 하나뿐이면 체인이 아니다");
});

test("penalises a local chain only when the request wants somewhere calm", () => {
  const chains = findChainBrands(["폴바셋 강남점", "폴바셋 강남삼성타운점"]);
  const candidate = {
    name: "폴바셋 강남점",
    subCategory: "카페",
    tags: ["음식점", "카페", "커피전문점"],
  };

  assert.equal(
    assessSemanticFit(evidence({ ...candidate, request: "강남역 조용한 카페" }), chains).status,
    "PENALIZE",
  );
  assert.equal(
    assessSemanticFit(evidence({ ...candidate, request: "강남역 카페" }), chains).status,
    "PASS",
  );
});

test("merges a place whose brand prefix one provider omits", () => {
  // `원유로스페셜티 강남역지하상가점`과 `강다짐 원유로스페셜티 강남역지하상가점`이
  // 추천 10건 중 두 칸을 차지했다. 접두 일치만 보면 앞에 브랜드명이 덧붙은 경우를 놓친다.
  const { seeds } = dedupeAndExclude(
    [
      seed({ provider: "kakao", providerPlaceId: "1", name: "강다짐 원유로스페셜티 강남역지하상가점" }),
      seed({ provider: "tmap", providerPlaceId: "2", name: "원유로스페셜티 강남역지하상가점" }),
    ],
    [],
  );

  assert.equal(seeds.length, 1);
});

test("does not merge a short name that merely appears inside another", () => {
  const { seeds } = dedupeAndExclude(
    [
      seed({ provider: "kakao", providerPlaceId: "1", name: "곱창" }),
      seed({ provider: "tmap", providerPlaceId: "2", name: "홍곱창 회기본점" }),
    ],
    [],
  );

  assert.equal(seeds.length, 2, "짧은 이름이 포함됐다고 합치면 안 된다");
});

test("caps one category when the request names no specific type", () => {
  // "다 같이 모여서 저녁 먹을 곳"에 중식이 10건 중 7건을 차지한 적이 있다.
  // 고르라고 주는 목록에서 한 업종이 7할이면 고를 게 없는 것과 같다.
  const at = (id: string, subCategory: string, lat: number, total: number) =>
    ({
      evidence: {
        candidateId: id,
        name: id,
        category: { mainCategory: "음식점", subCategory, tags: [] },
        raw: { seed: { latitude: lat, longitude: 127.0 } },
      },
      llm: {},
      scores: { total },
    }) as never;

  // 중식이 점수 상위를 독차지하지만 다른 업종도 넉넉히 있다.
  const ranked = [
    ...Array.from({ length: 8 }, (_, i) => at(`중식${i}`, "중식", 37.5 + i * 0.01, 90 - i)),
    ...Array.from({ length: 5 }, (_, i) => at(`한식${i}`, "한식", 37.7 + i * 0.01, 70 - i)),
    ...Array.from({ length: 4 }, (_, i) => at(`양식${i}`, "양식", 37.9 + i * 0.01, 60 - i)),
  ];

  const capped = selectTopWithSpatialSpread(ranked, 10, { capCategoryShare: true });
  const counts: Record<string, number> = {};
  for (const entry of capped as Array<{ evidence: { category: { subCategory: string } } }>) {
    const key = entry.evidence.category.subCategory;
    counts[key] = (counts[key] ?? 0) + 1;
  }

  assert.equal(capped.length, 10);
  assert.ok(
    (counts["중식"] ?? 0) <= 4,
    `대안이 충분하면 한 업종이 4할을 넘으면 안 된다: ${JSON.stringify(counts)}`,
  );
  assert.ok(Object.keys(counts).length >= 3, "여러 업종이 섞여야 한다");
});

test("does not cap categories when the request asked for one", () => {
  // "회기 곱창"에 업종 제한을 걸면 곱창집을 밀어내게 된다.
  const at = (id: string, lat: number, total: number) =>
    ({
      evidence: {
        candidateId: id,
        name: id,
        category: { mainCategory: "음식점", subCategory: "한식", tags: [] },
        raw: { seed: { latitude: lat, longitude: 127.0 } },
      },
      llm: {},
      scores: { total },
    }) as never;

  const picked = selectTopWithSpatialSpread(
    [at("곱창1", 37.5, 90), at("곱창2", 37.51, 89), at("곱창3", 37.52, 88)],
    3,
  );

  assert.equal(picked.length, 3);
});

test("asks for more seeds even when no page is left to turn", () => {
  // 예전에는 "다음 페이지가 남아 있을 때"만 더 찾아 달라고 알렸다. 그런데 검색어
  // 자체가 나쁘면 첫 시도에 페이지가 소진되고, 그때가 바로 검색어를 새로 만들어야
  // 할 때다. "압구정 파인다이닝"이 그 탓에 5곳만 나오고 끝났다.
  //
  // 조건에서 nextQueries 검사가 빠졌는지 소스로 확인한다. 이 분기는 실제 LLM과
  // 외부 API가 있어야 재현되므로 단위 테스트로는 동작을 직접 부를 수 없다.
  const source = readFileSync(
    new URL("./steps/evaluateSeeds/index.ts", import.meta.url),
    "utf8",
  );

  assert.ok(
    source.includes("if (ranked.length < config.targetCount) {"),
    "목표 미달이면 페이지 잔여와 무관하게 더 찾아 달라고 해야 한다",
  );
  assert.ok(
    !source.includes("ranked.length < config.targetCount && discoverSeedsOutput.nextQueries"),
    "nextQueries 조건이 남아 있으면 안 된다",
  );
  assert.ok(
    source.includes("partial: { data: output, funnel }"),
    "재시도가 실패해도 남기도록 부분 결과를 함께 넘겨야 한다",
  );
});

test("turns a Naver local item into a usable seed", () => {
  // 네이버는 좌표를 WGS84 × 10^7 정수로 주고, 질의어와 겹치는 부분을 <b>로 감싼다.
  const seeds = toNaverLocalSeeds([
    {
      title: "<b>스와니예</b>",
      category: "음식점>양식",
      telephone: "",
      address: "서울특별시 강남구 신사동 566",
      roadAddress: "서울특별시 강남구 강남대로 652 신사스퀘어 2층",
      mapx: "1270190103",
      mapy: "375196631",
    },
  ]);

  assert.equal(seeds.length, 1);
  assert.equal(seeds[0]?.name, "스와니예", "<b> 표시가 상호에 남으면 안 된다");
  assert.equal(seeds[0]?.provider, "naver");
  assert.ok(Math.abs((seeds[0]?.longitude ?? 0) - 127.0190103) < 1e-6);
  assert.ok(Math.abs((seeds[0]?.latitude ?? 0) - 37.5196631) < 1e-6);
});

test("drops a Naver item without usable coordinates", () => {
  const seeds = toNaverLocalSeeds([
    { title: "좌표없음", category: "음식점", mapx: "", mapy: "" },
  ]);

  assert.equal(seeds.length, 0);
});

test("separates an izakaya request from a katsu restaurant", () => {
  // "회기역 이자카야" 추천 10건 중 4건이 홍익돈까스·경양카츠·금화왕돈까스·멘지였다.
  // 이자카야는 술집이고 돈까스집은 밥집이라 목적이 다르다.
  const katsu = assessSemanticFit(
    evidence({
      name: "홍익돈까스 회기점",
      subCategory: "일식",
      tags: ["음식점", "일식", "돈까스", "우동"],
      request: "회기역 이자카야",
    }),
  );
  const izakaya = assessSemanticFit(
    evidence({
      name: "문자카야",
      subCategory: "술집",
      tags: ["생활편의", "술집", "일본선술집"],
      request: "회기역 이자카야",
    }),
  );

  assert.equal(katsu.status, "PENALIZE");
  assert.equal(izakaya.status, "PASS", "일본선술집도 이자카야로 봐야 한다");
});

test("still matches a katsu place when that is what was asked for", () => {
  const katsu = assessSemanticFit(
    evidence({
      name: "홍익돈까스 회기점",
      subCategory: "일식",
      tags: ["음식점", "일식", "돈까스", "우동"],
      request: "회기 돈까스",
    }),
  );

  assert.equal(katsu.status, "PASS");
});

test("prefers another brand over a third branch when filling the list", () => {
  // 후보가 14개뿐이던 "회기역 이자카야"에 `오사카고양이` 세 지점이 들어왔다.
  // 밀어낸 후보를 한 번에 다 풀면, 다른 브랜드가 남아 있는데도 같은 브랜드로 채운다.
  const at = (name: string, lat: number, lng: number, total: number) =>
    ({
      evidence: {
        candidateId: name,
        name,
        category: { mainCategory: "음식점", subCategory: "술집", tags: [] },
        raw: { seed: { latitude: lat, longitude: lng } },
      },
      llm: {},
      scores: { total },
    }) as never;

  const picked = selectTopWithSpatialSpread(
    [
      at("오사카고양이 회기역점", 37.5, 127.0, 95),
      at("오사카고양이 회기점", 37.51, 127.0, 94),
      at("오사카고양이 외대역점", 37.52, 127.0, 93),
      // 아래 둘은 서로 10m 안에 붙어 있어 첫 통과에서 하나만 뽑히고 하나는 밀린다.
      at("문자카야", 37.53, 127.0, 60),
      at("이로리야", 37.530_08, 127.0, 59),
    ],
    4,
  );

  const names = picked.map((entry: { evidence: { name: string } }) => entry.evidence.name);
  const brandCount = names.filter((name: string) => name.startsWith("오사카고양이")).length;

  assert.equal(picked.length, 4, "채울 수 있으면 채워야 한다");
  assert.ok(brandCount <= 2, `같은 브랜드가 절반을 넘으면 안 된다: ${names.join(", ")}`);
  assert.ok(names.includes("이로리야"), "밀려 있던 다른 브랜드를 먼저 써야 한다");
});
