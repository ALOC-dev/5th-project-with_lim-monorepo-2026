import assert from "node:assert/strict";
import { promises as fileSystem } from "node:fs";
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
import { DiscoveryContextSchema, SearchQuerySchema } from "./steps/discoverSeeds/contracts.js";
import { distributeSeedCounts } from "./steps/discoverSeeds/llm/approaches.js";
import { toDiscoverSeedsFailure } from "./steps/discoverSeeds/utils/failure.js";
import { settleProviderSeeds } from "./steps/discoverSeeds/utils/provider.js";
import type { LocalSeedSearchResponse } from "./steps/discoverSeeds/vendors/contracts.js";
import { logRecoverableAgenticCandidateFailure } from "./steps/evaluateSeeds/llm/enrichment.js";
import { buildReferenceQueryVariants } from "./steps/evaluateSeeds/tools/shared/reference-query.js";
import type { CandidateScoringEvidence } from "./steps/evaluateSeeds/utils/evidence.js";

const schedule = (overrides: Partial<{ dateISO: string; time24h: string; stay: number }> = {}) => ({
  dateISO: overrides.dateISO ?? "2026-08-03",
  time24h: overrides.time24h ?? "12:00",
  stayDurationMinutes: overrides.stay ?? 60,
});

void test("resolves the weekday from the calendar date regardless of server timezone", () => {
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

void test("resolves every weekday correctly", () => {
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

void test("ignores scraped page text when judging semantic fit", () => {
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

void test("still penalises a candidate whose own category conflicts with the request", () => {
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

void test("treats a request that mentions drinking as allowing bar candidates", () => {
  // 예전에는 이 예외가 `바\b` 패턴에 걸려 있었는데, JS의 `\b`는 ASCII 단어경계라
  // 한국어에서는 절대 매칭되지 않아 죽은 코드였다.
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
    assert.equal(result.status, "PASS", `"${request}" 요청에서 술집이 감점되면 안 된다`);
  }
});

void test("recognises tea and cafe requests", () => {
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
  Array.from({ length: count }, (_, index) => ({ ...evidence({}), candidateId: `c${index}` }));

void test("scores candidates in chunks instead of one call per candidate", async () => {
  const seenChunkSizes: number[] = [];
  const client: LlmScoringClient = ({ evidences: chunk }) => {
    seenChunkSizes.push(chunk.length);
    return Promise.resolve(chunk.map((item) => evaluation(item.candidateId)));
  };

  const result = await createScoringPipeline(client, 4)({ evidences: evidences(10) });

  assert.deepEqual(
    seenChunkSizes.sort((a, b) => b - a),
    [4, 4, 2],
  );
  assert.equal(result.length, 10);
});

void test("keeps the rest of a chunk when one candidate breaks the response", async () => {
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

void test("caps reference query variants and orders the specific ones first", () => {
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

void test("distributes a target of 50 exactly and evenly without exceeding the per-query cap", () => {
  // LLM에게 산술을 시키던 예전 방식은 부족분을 전부 첫 검색어에 몰아줬다.
  const queries = distributeSeedCounts(["홍대 곱창", "연남 곱창", "합정 곱창"], 50);

  assert.equal(queries.length, 3);
  const counts = queries.map((query) => query.count);
  assert.equal(
    counts.reduce((total, count) => total + count, 0),
    50,
  );
  assert.ok(
    counts.every((count) => count <= 20),
    `20건 상한 초과: ${JSON.stringify(counts)}`,
  );
  assert.ok(Math.max(...counts) - Math.min(...counts) <= 1, `편중됨: ${JSON.stringify(counts)}`);
  assert.ok(
    queries.every((query) => query.page === 1),
    "첫 호출은 1페이지여야 한다",
  );
});

void test("caps the initial target of 100 at 80 across four discovery queries", () => {
  const queries = distributeSeedCounts(["파스타", "이탈리안", "양식", "레스토랑"], 100);
  const counts = queries.map((query) => query.count);

  assert.deepEqual(counts, [20, 20, 20, 20]);
  assert.equal(
    counts.reduce((total, count) => total + count, 0),
    80,
  );

  const parsed = DiscoveryContextSchema.safeParse({
    attemptNo: 1,
    targetSeedCount: 100,
    queries,
    alreadyCheckedIds: [],
  });
  assert.equal(
    parsed.success,
    true,
    "provider 상한으로 80건을 요청해도 초기 context가 유효해야 한다",
  );
});

void test("still rejects initial and retry discovery totals above targetSeedCount", () => {
  for (const attemptNo of [1, 2]) {
    const parsed = DiscoveryContextSchema.safeParse({
      attemptNo,
      targetSeedCount: 20,
      queries: [
        { query: "한식", page: 1, count: 11 },
        { query: "맛집", page: 1, count: 10 },
      ],
      alreadyCheckedIds: [],
      ...(attemptNo > 1 ? { previousFailureReason: "LOW_QUALITY" } : {}),
    });

    assert.equal(parsed.success, false, `${attemptNo}회차에서 목표 초과 요청을 허용하면 안 된다`);
  }
});

void test("accepts the TMAP query count maximum and rejects a count above it", () => {
  assert.equal(SearchQuerySchema.safeParse({ query: "한식", page: 1, count: 20 }).success, true);
  assert.equal(SearchQuerySchema.safeParse({ query: "한식", page: 1, count: 21 }).success, false);
});

void test("preserves successful TMAP queries when another query rejects", () => {
  const queries = [
    { query: "한식", page: 1, count: 20 },
    { query: "카페", page: 1, count: 20 },
  ];
  const successfulResponse: LocalSeedSearchResponse = {
    provider: "tmap",
    query: "한식",
    page: 1,
    count: 20,
    totalCount: 1,
    isEnd: true,
    seeds: [],
  };

  const events: LogEvent[] = [];
  const responses = settleProviderSeeds(
    queries,
    [
      { status: "fulfilled", value: successfulResponse },
      { status: "rejected", reason: new Error("TMAP temporary failure") },
    ],
    createLogger((event) => events.push(event)),
  );

  assert.equal(responses[0], successfulResponse);
  assert.deepEqual(responses[1], {
    provider: "tmap",
    query: "카페",
    page: 1,
    count: 20,
    totalCount: 0,
    isEnd: true,
    seeds: [],
  });
  assert.equal(events.length, 1);
  assert.equal(events[0]?.phase, "discoverSeeds.provider.partial_failure");
  assert.deepEqual(events[0]?.data, {
    provider: "TMAP",
    queryCount: 2,
    rejectedQueryCount: 1,
    recoverable: true,
    errors: [{ name: "Error", message: "TMAP temporary failure" }],
  });
});

void test("logs a recoverable agentic candidate failure before falling back to UNKNOWN", () => {
  const events: LogEvent[] = [];
  logRecoverableAgenticCandidateFailure(
    createLogger((event) => events.push(event)),
    "candidate-7",
    new Error("OpenAI request timed out"),
  );

  assert.equal(events.length, 1);
  assert.equal(events[0]?.phase, "evaluateSeeds.enrichment.agentic_candidate.failure");
  assert.equal(events[0]?.context?.candidateId, "candidate-7");
  assert.equal(events[0]?.context?.source, "agentic");
  assert.deepEqual(events[0]?.data, {
    provider: "OPENAI",
    recoverable: true,
    fallbackStatus: "UNKNOWN",
  });
  assert.equal(events[0]?.error?.message, "OpenAI request timed out");
});

void test("classifies rejection of every TMAP query as a provider failure", () => {
  const queries = [
    { query: "한식", page: 1, count: 20 },
    { query: "카페", page: 1, count: 20 },
  ];

  assert.throws(
    () =>
      settleProviderSeeds(queries, [
        { status: "rejected", reason: new Error("first failure") },
        { status: "rejected", reason: new Error("second failure") },
      ]),
    (error: unknown) => {
      assert.ok(error instanceof AggregateError);
      assert.match(error.message, /TMAP provider/);
      const failure = toDiscoverSeedsFailure(error);
      assert.equal(failure.ok, false);
      if (!failure.ok) assert.equal(failure.errorCode, "DISCOVER_SEEDS_PROVIDER_ERROR");
      return true;
    },
  );
});

void test("writes engine events to a JSONL file, creating the directory as needed", async () => {
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

void test("keeps other sinks alive when one sink throws", () => {
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

void test("throws only when no candidate could be scored at all", async () => {
  const client: LlmScoringClient = () => Promise.reject(new Error("openai down"));

  await assert.rejects(
    createScoringPipeline(client, 4)({ evidences: evidences(4) }),
    /no usable evaluation/,
  );
});
