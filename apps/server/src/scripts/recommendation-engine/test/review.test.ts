import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";

import {
  parseReviewCliOptions,
  reviewCampaignRound,
} from "../review.js";

const days = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
] as const;

void test("emits every recommendation, independent flags, URL checks, and trace metrics", async (t) => {
  const fixture = await createRoundFixture(t, "complete");
  const runDirectory = join(fixture.roundDirectory, "runs", "run-1");
  const resultFile = join(runDirectory, "run.result.json");
  const logFile = join(runDirectory, "run.log.json");
  const eventsFile = join(runDirectory, "run.events.jsonl");
  await mkdir(runDirectory, { recursive: true });
  await writeJson(resultFile, {
    status: "SUCCESS",
    userOutput: {
      recommendations: [
        recommendation({ id: "place-1", name: "정상 식당", address: "서울 강남구 1" }),
        recommendation({
          id: "place-2",
          name: "검토 식당",
          address: "서울 강남구 2",
          accessibility: { score: 50, perOrigin: [] },
          availability: {
            status: "UNKNOWN",
            requestedDateISO: "2026-08-17",
            requestedTime24h: "19:00",
            stayDurationMinutes: 90,
            reason: "확인 불가",
          },
          referenceUrls: {},
        }),
      ],
    },
  });
  await writeJson(logFile, {
    durationMs: 1_234,
    trace: {
      generatedCandidates: [],
      rejectedCandidates: [],
      needsMoreSeeds: [],
      infrastructureSignals: [
        {
          provider: "TMAP",
          category: "QUOTA",
          explicitQuotaFailure: true,
          phase: "discoverSeeds.provider.total_failure",
          dedupKey: "TMAP:QUOTA",
          message: "TMAP 429 quota exceeded",
          occurrenceCount: 2,
        },
        {
          provider: "TMAP",
          category: "QUOTA",
          explicitQuotaFailure: true,
          phase: "discoverSeeds.discover.failure",
          dedupKey: "TMAP:QUOTA",
          message: "propagated quota failure",
          occurrenceCount: 1,
        },
      ],
    },
  });
  await writeFile(
    eventsFile,
    [
      event("discoverSeeds.discover.result", {
        output: { seeds: [{ seedKey: "seed-1" }, { seedKey: "seed-2" }] },
      }),
      event("engine.attempt.needs_more_seeds", { reason: "LOW_QUALITY" }, "warn"),
      event("evaluateSeeds.evaluation.start", { seedCount: 2 }),
      event("evaluateSeeds.enrichment.success", {
        verifiedOpenCount: 2,
        rejected: [{ candidateId: "rejected-1" }],
      }),
      event("evaluateSeeds.reference_urls.success", { verifiedCount: 1, rejectedCount: 1 }),
      {
        ...event(
          "discoverSeeds.discover.failure",
          { errorCode: "TMAP_PROVIDER_ERROR" },
          "error",
        ),
        error: { name: "Error", message: "TMap timeout" },
      },
    ]
      .map((value) => JSON.stringify(value))
      .join("\n") + "\n",
    "utf8",
  );
  await writeManifest(fixture.manifestPath, runDirectory, {
    resultFile,
    logFile,
    eventsFile,
    recommendationCount: 2,
    reportOverrides: {
      infrastructureProvider: "TMAP",
      explicitQuotaFailure: true,
      errorCode: "DISCOVER_SEEDS_PROVIDER_ERROR",
      engineErrorMessage: "TMAP 429 quota exceeded",
    },
  });

  const packet = await reviewCampaignRound(fixture.manifestPath, {
    now: () => new Date("2026-08-14T12:00:00.000Z"),
  });

  assert.equal(packet.artifactType, "recommendation-engine-campaign-review-packet");
  assert.equal(packet.generatedAt, "2026-08-14T12:00:00.000Z");
  assert.equal(packet.grading.manualGradesAssigned, false);
  assert.equal(packet.totals.recommendations, 2);
  assert.equal(packet.runs.length, 1);
  const run = packet.runs[0];
  assert.ok(run);
  assert.equal(run.recommendations[0]?.name, "정상 식당");
  assert.equal(run.recommendations[0]?.budget instanceof Object, true);
  assert.deepEqual(run.recommendations[0]?.mapUrls, {
    kakaoMap: "https://place.map.kakao.com/1",
    naverMap: null,
  });
  assert.deepEqual(run.recommendations[0]?.descriptions.reasons, ["요청 조건 일치"]);
  assert.deepEqual(run.recommendations[0]?.structuralFlags, []);
  assert.ok(run.recommendations[1]?.structuralFlags.includes("MISSING_DISTANCE"));
  assert.ok(run.recommendations[1]?.structuralFlags.includes("MISSING_MAP_URL"));
  assert.ok(
    run.recommendations[1]?.structuralFlags.includes("REQUESTED_AVAILABILITY_UNKNOWN"),
  );
  assert.deepEqual(run.trace, {
    durationMs: 1_234,
    discoveryRetryCount: 1,
    discoveredCandidateCount: 2,
    uniqueDiscoveredCandidateCount: 2,
    evaluatedCandidateCount: 2,
    rejectedCandidateCount: 1,
    openVerifiedCandidateCount: 2,
    urlVerifiedCandidateCount: 1,
    urlRejectedCandidateCount: 1,
    providerErrors: [
      {
        provider: "TMAP",
        category: "QUOTA",
        explicitQuotaFailure: true,
        occurrenceCount: 3,
        phase: "discoverSeeds.provider.total_failure",
        message: "TMAP 429 quota exceeded",
      },
    ],
  });
  assert.deepEqual(packet.totals, {
    runs: 1,
    recommendations: 2,
    artifactIssues: 0,
    structuralFlags: 4,
    urlChecklistEntries: 2,
    durationMs: 1_234,
    discoveryRetries: 1,
    candidates: 2,
    uniqueCandidates: 2,
    evaluatedCandidates: 2,
    rejectedCandidates: 1,
    openVerifiedCandidates: 2,
    urlVerifiedCandidates: 1,
    urlRejectedCandidates: 1,
    providerErrorOccurrencesByProvider: { TMAP: 3 },
    infrastructureAffectedRuns: 1,
  });
  assert.equal(packet.urlChecklist.length, 2);
  assert.deepEqual(packet.urlChecklist[0]?.reasons, ["TOP_1"]);
  assert.deepEqual(packet.urlChecklist[1]?.reasons, ["STRUCTURAL_ANOMALY"]);
});

void test("flags duplicate recommendation IDs and normalized place identity", async (t) => {
  const fixture = await createRoundFixture(t, "duplicates");
  const runDirectory = join(fixture.roundDirectory, "runs", "run-1");
  const resultFile = join(runDirectory, "run.result.json");
  const logFile = join(runDirectory, "run.log.json");
  const eventsFile = join(runDirectory, "run.events.jsonl");
  await mkdir(runDirectory, { recursive: true });
  await writeJson(resultFile, {
    status: "SUCCESS",
    userOutput: {
      recommendations: [
        recommendation({ id: "same", name: "같은-식당", address: "서울 강남구 1" }),
        recommendation({ id: "same", name: "같은 식당", address: "서울 강남구 1" }),
      ],
    },
  });
  await writeJson(logFile, { durationMs: 10, trace: {} });
  await writeFile(eventsFile, "", "utf8");
  await writeManifest(fixture.manifestPath, runDirectory, {
    resultFile,
    logFile,
    eventsFile,
    recommendationCount: 2,
  });

  const packet = await reviewCampaignRound(fixture.manifestPath);
  const run = packet.runs[0];
  assert.ok(run?.structuralFlags.includes("DUPLICATE_RECOMMENDATION_IDS"));
  assert.ok(run?.structuralFlags.includes("DUPLICATE_PLACE_IDENTITIES"));
  assert.ok(
    run?.recommendations.every((item) =>
      item.structuralFlags.includes("DUPLICATE_RECOMMENDATION_ID"),
    ),
  );
});

void test("rejects artifact path traversal outside the exact round directory", async (t) => {
  const fixture = await createRoundFixture(t, "traversal");
  const runDirectory = join(fixture.roundDirectory, "runs", "run-1");
  await mkdir(runDirectory, { recursive: true });
  await writeManifest(fixture.manifestPath, runDirectory, {
    resultFile: join(fixture.roundDirectory, "..", "outside.result.json"),
    logFile: join(runDirectory, "run.log.json"),
    eventsFile: join(runDirectory, "run.events.jsonl"),
    recommendationCount: 1,
  });

  await assert.rejects(
    reviewCampaignRound(fixture.manifestPath),
    /escapes or equals the exact campaign round directory/,
  );
});

void test("reports corrupt and missing artifacts without hiding readable event data", async (t) => {
  const fixture = await createRoundFixture(t, "corrupt");
  const runDirectory = join(fixture.roundDirectory, "runs", "run-1");
  const resultFile = join(runDirectory, "run.result.json");
  const logFile = join(runDirectory, "missing.log.json");
  const eventsFile = join(runDirectory, "run.events.jsonl");
  await mkdir(runDirectory, { recursive: true });
  await writeFile(resultFile, "{not-json", "utf8");
  await writeFile(
    eventsFile,
    `${JSON.stringify(event("engine.attempt.needs_more_seeds", {}, "warn"))}\nnot-json\n`,
    "utf8",
  );
  await writeManifest(fixture.manifestPath, runDirectory, {
    resultFile,
    logFile,
    eventsFile,
    recommendationCount: 1,
  });

  const packet = await reviewCampaignRound(fixture.manifestPath);
  const run = packet.runs[0];
  assert.ok(run);
  assert.deepEqual(
    run.artifactIssues.map((issue) => issue.code),
    ["CORRUPT_JSON_ARTIFACT", "MISSING_ARTIFACT", "CORRUPT_JSONL_ARTIFACT"],
  );
  assert.ok(run.structuralFlags.includes("ARTIFACT_INCOMPLETE_OR_CORRUPT"));
  assert.ok(run.structuralFlags.includes("RECOMMENDATION_COUNT_MISMATCH"));
  assert.equal(run.trace.discoveryRetryCount, 1);
});

void test("legacy fallback keeps malformed model output as product but recognizes plan quota", async (t) => {
  const productPacket = await reviewLegacyEvents(t, "legacy-product", [
    event(
      "engine.process.failure",
      {
        errorCode: "DISCOVER_SEEDS_PLAN_ERROR",
        message: "NoObjectGeneratedError: response failed schema parse validation",
      },
      "warn",
    ),
  ], {
    engineStatus: "ERROR",
    errorCode: "DISCOVER_SEEDS_PLAN_ERROR",
    engineErrorMessage:
      "NoObjectGeneratedError: response failed schema parse validation",
  });
  assert.deepEqual(productPacket.runs[0]?.trace.providerErrors, []);
  assert.equal(productPacket.totals.infrastructureAffectedRuns, 0);

  const quotaPacket = await reviewLegacyEvents(t, "legacy-quota", [
    event(
      "engine.process.failure",
      {
        errorCode: "DISCOVER_SEEDS_PLAN_ERROR",
        message: "OpenAI returned 429 rate limit exceeded",
      },
      "warn",
    ),
  ], {
    engineStatus: "ERROR",
    errorCode: "DISCOVER_SEEDS_PLAN_ERROR",
    engineErrorMessage: "OpenAI returned 429 rate limit exceeded",
  });
  assert.deepEqual(quotaPacket.runs[0]?.trace.providerErrors, [
    {
      provider: "OPENAI",
      category: "QUOTA",
      explicitQuotaFailure: true,
      occurrenceCount: 1,
      phase: "campaign.report",
      errorCode: "DISCOVER_SEEDS_PLAN_ERROR",
      message: "DISCOVER_SEEDS_PLAN_ERROR OpenAI returned 429 rate limit exceeded",
    },
  ]);
  assert.deepEqual(quotaPacket.totals.providerErrorOccurrencesByProvider, { OPENAI: 1 });
  assert.equal(quotaPacket.totals.infrastructureAffectedRuns, 1);
});

void test("empty canonical trace still captures a strict terminal OpenAI timeout once", async (t) => {
  const packet = await reviewLegacyEvents(
    t,
    "terminal-timeout",
    [
      event(
        "engine.process.failure",
        {
          errorCode: "DISCOVER_SEEDS_PLAN_ERROR",
          message: "OpenAI request timed out after 30 seconds",
        },
        "warn",
      ),
    ],
    {
      engineStatus: "ERROR",
      errorCode: "DISCOVER_SEEDS_PLAN_ERROR",
      engineErrorMessage: "OpenAI request timed out after 30 seconds",
    },
  );

  assert.deepEqual(packet.runs[0]?.trace.providerErrors, [
    {
      provider: "OPENAI",
      category: "TRANSPORT",
      explicitQuotaFailure: false,
      occurrenceCount: 1,
      phase: "campaign.report",
      errorCode: "DISCOVER_SEEDS_PLAN_ERROR",
      message:
        "DISCOVER_SEEDS_PLAN_ERROR OpenAI request timed out after 30 seconds",
    },
  ]);
  assert.deepEqual(packet.totals.providerErrorOccurrencesByProvider, { OPENAI: 1 });
  assert.equal(packet.totals.infrastructureAffectedRuns, 1);
});

void test("parses the machine-readable CLI contract without touching artifacts", () => {
  assert.deepEqual(parseReviewCliOptions(["--manifest=/tmp/round/manifest.json", "--json"]), {
    manifestPath: "/tmp/round/manifest.json",
    json: true,
  });
  assert.throws(() => parseReviewCliOptions([]), /requires exactly one --manifest/);
  assert.throws(
    () => parseReviewCliOptions(["--manifest=/tmp/a", "--manifest=/tmp/b"]),
    /requires exactly one --manifest/,
  );
  assert.throws(
    () => parseReviewCliOptions(["--manifest=/tmp/a", "--verbose"]),
    /Unknown review option/,
  );
});

const createRoundFixture = async (
  t: TestContext,
  name: string,
): Promise<{ manifestPath: string; roundDirectory: string }> => {
  const root = await mkdtemp(join(tmpdir(), `recommendation-review-${name}-`));
  t.after(() => rm(root, { recursive: true, force: true }));
  const roundDirectory = join(root, "campaign-1", "round-01");
  await mkdir(roundDirectory, { recursive: true });
  return { manifestPath: join(roundDirectory, "manifest.json"), roundDirectory };
};

const reviewLegacyEvents = async (
  t: TestContext,
  name: string,
  events: Record<string, unknown>[],
  reportOverrides: Record<string, unknown> = {},
) => {
  const fixture = await createRoundFixture(t, name);
  const runDirectory = join(fixture.roundDirectory, "runs", "run-1");
  const resultFile = join(runDirectory, "run.result.json");
  const logFile = join(runDirectory, "run.log.json");
  const eventsFile = join(runDirectory, "run.events.jsonl");
  await mkdir(runDirectory, { recursive: true });
  await writeJson(resultFile, {
    status: "SUCCESS",
    userOutput: { recommendations: [] },
  });
  await writeJson(logFile, {
    durationMs: 10,
    trace: {
      generatedCandidates: [],
      rejectedCandidates: [],
      needsMoreSeeds: [],
      infrastructureSignals: [],
    },
  });
  await writeFile(
    eventsFile,
    `${events.map((value) => JSON.stringify(value)).join("\n")}\n`,
    "utf8",
  );
  await writeManifest(fixture.manifestPath, runDirectory, {
    resultFile,
    logFile,
    eventsFile,
    recommendationCount: 0,
    reportOverrides,
  });
  return await reviewCampaignRound(fixture.manifestPath);
};

const writeManifest = async (
  manifestPath: string,
  artifactDirectory: string,
  artifacts: {
    resultFile: string;
    logFile: string;
    eventsFile: string;
    recommendationCount: number;
    reportOverrides?: Record<string, unknown>;
  },
): Promise<void> =>
  await writeJson(manifestPath, {
    schemaVersion: 1,
    artifactType: "recommendation-engine-campaign-round",
    campaignId: "campaign-1",
    roundId: "round-01",
    roundNumber: 1,
    status: "COMPLETED",
    concurrency: 3,
    sourceFingerprint: "source-hash",
    scenarioFingerprint: "scenario-hash",
    runs: {
      scenario_1: {
        runId: "run-1",
        scenarioId: "scenario_1",
        artifactDir: artifactDirectory,
        status: "COMPLETED",
        report: {
          engineStatus: "SUCCESS",
          resultFile: artifacts.resultFile,
          logFile: artifacts.logFile,
          eventsFile: artifacts.eventsFile,
          ...artifacts.reportOverrides,
        },
        outcome: {
          classification: "NORMAL_SUCCESS",
          expected: { kind: "SUCCESS", recommendationCount: artifacts.recommendationCount },
        },
      },
    },
  });

const recommendation = ({
  id,
  name,
  address,
  accessibility = {
    score: 80,
    distanceMeters: 900,
    estimatedTravelMinutes: 12,
    perOrigin: [{ originId: "host", distanceMeters: 900 }],
  },
  availability = {
    status: "OPEN",
    requestedDateISO: "2026-08-17",
    requestedTime24h: "19:00",
    stayDurationMinutes: 90,
    reason: "요청 시간 영업",
  },
  referenceUrls = { kakaoMap: "https://place.map.kakao.com/1" },
}: {
  id: string;
  name: string;
  address: string;
  accessibility?: Record<string, unknown>;
  availability?: Record<string, unknown>;
  referenceUrls?: Record<string, unknown>;
}): Record<string, unknown> => ({
  id,
  name,
  tags: ["한식"],
  contentSummary: "대표 메뉴가 분명한 식당입니다.",
  mainCategory: "식당",
  subCategory: "한식",
  operationInfo: {
    timezone: "Asia/Seoul",
    schedules: Object.fromEntries(
      days.map((day) => [
        day,
        { status: "OPEN", open: "10:00", close: "22:00", breakTimes: [] },
      ]),
    ),
  },
  availabilityAtRequestedTime: availability,
  referenceUrls,
  accessibility,
  location: { placeName: name, roadAddressKo: address, lat: 37.5, lng: 127.03 },
  priceRangePerPerson: { min: 10_000, max: 20_000 },
  reasons: ["요청 조건 일치"],
});

const event = (
  phase: string,
  data: Record<string, unknown>,
  level: "info" | "warn" | "error" = "info",
): Record<string, unknown> => ({
  ts: "2026-08-14T00:00:00.000Z",
  level,
  phase,
  data,
});

const writeJson = async (path: string, value: unknown): Promise<void> =>
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
