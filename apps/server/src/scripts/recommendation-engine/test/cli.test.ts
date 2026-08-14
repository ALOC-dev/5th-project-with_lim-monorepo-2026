import assert from "node:assert/strict";
import { promises as fileSystem } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import type { EngineOutput } from "@monorepo/recommendation-engine/v1/contracts";

import {
  createArtifactPaths,
  createCliPreflightFailureEnvelope,
  createCompletedLifecycleMarker,
  createEngineProcessStartedLifecycleMarker,
  finalizeEventArtifact,
  getEngineReportFields,
  parseTestCliOptions,
  type TestRun,
  toArtifactFailureRun,
  toCliJsonEnvelope,
  verifyEventsArtifact,
  writeLifecycleMarkerAtomic,
} from "../test.js";
import { createTestMonitor } from "./monitoring.js";

void test("parses campaign identifiers without starting a live engine call", () => {
  const options = parseTestCliOptions([
    "engine",
    "--json",
    "--scenario=gangnam_cafe",
    "--campaign-id=campaign-20260814",
    "--round=03",
    "--run-id=normal-01",
    "--artifact-dir=.artifacts/recommendation",
    "--expect-error=UNSUPPORTED_RECOMMENDATION_REQUEST",
  ]);

  assert.equal(options.json, true);
  assert.equal(options.scenario, "gangnam_cafe");
  assert.equal(options.campaignId, "campaign-20260814");
  assert.equal(options.roundId, "03");
  assert.equal(options.runId, "normal-01");
  assert.equal(options.expectedErrorCode, "UNSUPPORTED_RECOMMENDATION_REQUEST");
  assert.equal(options.artifactDir, path.resolve(".artifacts/recommendation"));
});

void test("rejects unsafe or duplicate run identifiers", () => {
  assert.throws(() => parseTestCliOptions(["--run-id=../outside"]), /filesystem-safe identifier/);
  assert.throws(() => parseTestCliOptions(["--round=1", "--round=2"]), /Duplicate test option/);
});

void test("builds collision-resistant artifact paths containing the run identity", () => {
  const paths = createArtifactPaths({
    artifactDir: "/tmp/recommendation-campaign",
    runName: "test-gangnam_cafe",
    campaignId: "campaign-1",
    roundId: "3",
    runId: "normal-1",
    now: new Date(2026, 7, 14, 12, 34, 56, 789),
    processId: 4321,
  });

  for (const filePath of [paths.resultFile, paths.logFile, paths.eventsFile]) {
    assert.match(filePath, /-4321\.campaign-1\.round-3\.normal-1\.test-gangnam_cafe\./);
    assert.equal(path.dirname(filePath), "/tmp/recommendation-campaign");
  }
  assert.equal(paths.lifecycleFile, "/tmp/recommendation-campaign/normal-1.lifecycle.json");
  assert.equal(new Set(Object.values(paths)).size, 4);
});

void test("represents preflight failures as non-counted JSON runs", () => {
  const envelope = createCliPreflightFailureEnvelope(
    ["--json", "--campaign-id=c1", "--round=4", "--run-id=r2"],
    new Error("bad input"),
  );

  assert.equal(envelope.status, "FAIL");
  assert.equal(envelope.run.processStarted, false);
  assert.equal(envelope.run.engineStatus, "ERROR");
  assert.equal(envelope.run.errorCode, "TEST_SCRIPT_PREFLIGHT_FAILURE");
  assert.deepEqual(envelope.run.selectedItemIds, []);
  assert.equal(envelope.run.campaignId, "c1");
  assert.equal(envelope.run.roundId, "4");
  assert.equal(envelope.run.runId, "r2");
});

void test("derives selected IDs and sanitized engine errors for the public report", () => {
  const success = {
    status: "SUCCESS",
    userOutput: {
      recommendations: [{ id: "place-1" }, { id: "place-2" }, { id: "place-2" }],
    },
  } as unknown as EngineOutput;
  const failure = {
    status: "ERROR",
    error: {
      code: "DISCOVER_SEEDS_PLAN_ERROR",
      message: "OpenAI provider timed out",
    },
  } as unknown as EngineOutput;

  assert.deepEqual(getEngineReportFields(success), {
    engineStatus: "SUCCESS",
    recommendationCount: 3,
    selectedItemIds: ["place-1", "place-2", "place-2"],
  });
  assert.deepEqual(getEngineReportFields(failure), {
    engineStatus: "ERROR",
    errorCode: "DISCOVER_SEEDS_PLAN_ERROR",
    engineErrorMessage: "OpenAI provider timed out",
    recommendationCount: 0,
    selectedItemIds: [],
  });
});

void test("keeps selected IDs and the engine error message in JSON stdout reports", () => {
  const result = {
    status: "ERROR",
    error: { code: "DISCOVER_SEEDS_PLAN_ERROR", message: "OpenAI provider timed out" },
  } as unknown as EngineOutput;
  const run: TestRun = {
    name: "test-gangnam_cafe",
    scenario: "gangnam_cafe",
    status: "FAIL",
    processStarted: true,
    engineStatus: "ERROR",
    errorCode: "DISCOVER_SEEDS_PLAN_ERROR",
    engineErrorMessage: "OpenAI provider timed out",
    recommendationCount: 0,
    selectedItemIds: ["place-1", "place-2"],
    unsupportedReason: "NON_PLACE_REQUEST",
    durationMs: 100,
    result,
    log: {},
    trace: {
      eventCount: 1,
      phases: {},
      generatedCandidates: [],
      enrichmentVerifications: [],
      rejectedCandidates: [],
      selectedCandidateIds: [],
      needsMoreSeeds: [],
      failures: [],
      infrastructureSignals: [],
    },
    resultFile: "/tmp/result.json",
    logFile: "/tmp/log.json",
    eventsFile: "/tmp/events.jsonl",
    lifecycleFile: "/tmp/run.lifecycle.json",
  };

  const envelope = JSON.parse(JSON.stringify(toCliJsonEnvelope(run))) as {
    run: Record<string, unknown>;
  };
  assert.deepEqual(envelope.run.selectedItemIds, ["place-1", "place-2"]);
  assert.equal(envelope.run.engineErrorMessage, "OpenAI provider timed out");
  assert.equal(envelope.run.unsupportedReason, "NON_PLACE_REQUEST");
  assert.equal("result" in envelope.run, false);
  assert.equal("log" in envelope.run, false);

  const completed = createCompletedLifecycleMarker(run, "2026-08-14T03:00:00.000Z");
  assert.equal(completed.state, "COMPLETED");
  assert.equal(completed.processStarted, true);
  if (completed.state === "COMPLETED") {
    assert.equal(completed.publicRun.lifecycleFile, "/tmp/run.lifecycle.json");
    assert.equal(completed.publicRun.status, "FAIL");
  }

  const artifactFailure = toArtifactFailureRun(
    { ...run, status: "PASS" },
    new Error("events file missing"),
  );
  assert.equal(artifactFailure.status, "FAIL");
  assert.equal(artifactFailure.errorCode, "TEST_ARTIFACT_WRITE_FAILURE");
  assert.equal(artifactFailure.error, "events file missing");
});

void test("atomically writes a deterministic process-started lifecycle marker", async () => {
  const directory = await fileSystem.mkdtemp(path.join(tmpdir(), "reco-lifecycle-"));
  const paths = createArtifactPaths({
    artifactDir: directory,
    runName: "test-gangnam_cafe",
    campaignId: "campaign-1",
    roundId: "round-01",
    runId: "run-1",
    now: new Date(2026, 7, 14, 12, 0, 0, 0),
    processId: 4321,
  });

  try {
    const marker = createEngineProcessStartedLifecycleMarker(
      {
        campaignId: "campaign-1",
        roundId: "round-01",
        runId: "run-1",
        scenario: "gangnam_cafe",
        paths,
        processId: 4321,
      },
      "2026-08-14T03:00:00.000Z",
    );
    await writeLifecycleMarkerAtomic(paths.lifecycleFile, marker);

    const persisted = JSON.parse(await fileSystem.readFile(paths.lifecycleFile, "utf8")) as {
      state?: string;
      processStarted?: boolean;
      runId?: string;
      resultFile?: string;
    };
    assert.equal(paths.lifecycleFile, path.join(directory, "run-1.lifecycle.json"));
    assert.equal(persisted.state, "ENGINE_PROCESS_STARTED");
    assert.equal(persisted.processStarted, true);
    assert.equal(persisted.runId, "run-1");
    assert.equal(persisted.resultFile, paths.resultFile);
    assert.deepEqual(
      (await fileSystem.readdir(directory)).filter((name) => name.endsWith(".tmp")),
      [],
    );
  } finally {
    await fileSystem.rm(directory, { recursive: true, force: true });
  }
});

void test("extracts only supported reasons from the dedicated engine event", () => {
  const monitor = createTestMonitor();
  monitor.startCheck("unsupported-reason");
  monitor.logger.info("engine.unsupported_request", { reason: "NOT_A_REASON" });
  assert.equal(monitor.getSummary().unsupportedReason, undefined);

  monitor.logger.info("engine.unsupported_request", { reason: "CONTRADICTORY_REQUEST" });
  assert.equal(monitor.getSummary().unsupportedReason, "CONTRADICTORY_REQUEST");
});

void test("normalizes, sanitizes, and deduplicates explicit provider quota signals", () => {
  const monitor = createTestMonitor();
  monitor.startCheck("quota-signal");
  monitor.logger.warn("discoverSeeds.provider.total_failure", {
    provider: "TMAP",
    queryCount: 2,
    rejectedQueryCount: 2,
    recoverable: false,
    errors: [
      {
        name: "HTTPError",
        message: "429 quota exceeded https://apis.openapi.sk.com/tmap/pois?appKey=secret-value",
      },
      {
        name: "HTTPError",
        message: "429 quota exceeded while fetching the next TMAP query",
      },
    ],
  });
  monitor.logger.error(
    "discoverSeeds.discover.failure",
    new Error("Request failed after provider rejection"),
    { errorCode: "DISCOVER_SEEDS_PROVIDER_ERROR" },
  );

  const signals = monitor.getSummary().infrastructureSignals;
  assert.equal(signals.length, 1, "같은 TMAP quota 장애가 단계별로 중복 집계되면 안 된다");
  assert.deepEqual(signals[0], {
    provider: "TMAP",
    category: "QUOTA",
    explicitQuotaFailure: true,
    phase: "discoverSeeds.provider.total_failure",
    dedupKey: "TMAP:QUOTA",
    message: "HTTPError: 429 quota exceeded https://apis.openapi.sk.com/tmap/pois",
    occurrenceCount: 2,
  });
});

void test("extracts recoverable provider and browser infrastructure without changing failures", () => {
  const monitor = createTestMonitor();
  monitor.startCheck("recoverable-infrastructure");
  monitor.logger.error(
    "evaluateSeeds.enrichment.tool.kakao-local.failure",
    new Error("fetch failed: ECONNRESET"),
    { recoverable: true, fallbackStatus: "UNKNOWN" },
  );
  monitor.logger.error(
    "evaluateSeeds.enrichment.tool.naver-search.failure",
    new Error("Naver API returned 401 unauthorized"),
    { recoverable: true, fallbackStatus: "UNKNOWN" },
  );
  monitor.logger.error(
    "evaluateSeeds.enrichment.tool.naver-map.failure",
    new Error("browser page content read timed out"),
    { recoverable: true, fallbackStatus: "UNKNOWN" },
  );
  monitor.logger.error(
    "evaluateSeeds.enrichment.agentic_candidate.failure",
    new Error("OpenAI request timed out after 35000ms"),
    { provider: "OPENAI", recoverable: true, fallbackStatus: "UNKNOWN" },
  );

  assert.deepEqual(
    monitor
      .getSummary()
      .infrastructureSignals.map(
        ({ provider, category, explicitQuotaFailure, occurrenceCount }) => ({
          provider,
          category,
          explicitQuotaFailure,
          occurrenceCount,
        }),
      ),
    [
      {
        provider: "KAKAO",
        category: "TRANSPORT",
        explicitQuotaFailure: false,
        occurrenceCount: 1,
      },
      {
        provider: "NAVER",
        category: "AUTH",
        explicitQuotaFailure: false,
        occurrenceCount: 1,
      },
      {
        provider: "BROWSER",
        category: "TRANSPORT",
        explicitQuotaFailure: false,
        occurrenceCount: 1,
      },
      {
        provider: "OPENAI",
        category: "TRANSPORT",
        explicitQuotaFailure: false,
        occurrenceCount: 1,
      },
    ],
  );
  assert.equal(monitor.getSummary().failures.length, 4, "기존 terminal/failure trace는 보존한다");
});

void test("attributes browser launch and crash failures before the enclosing source provider", () => {
  const monitor = createTestMonitor();
  monitor.startCheck("browser-attribution");
  monitor.logger.error(
    "evaluateSeeds.enrichment.tool.kakao-local.failure",
    new Error("Chromium browser process crashed while launching"),
    { recoverable: true, fallbackStatus: "UNKNOWN" },
  );
  monitor.logger.error(
    "evaluateSeeds.enrichment.tool.kakao-local.failure",
    new Error("browser process crashed while launching"),
    { recoverable: true, fallbackStatus: "UNKNOWN" },
  );

  assert.deepEqual(monitor.getSummary().infrastructureSignals, [
    {
      provider: "BROWSER",
      category: "RESOURCE",
      explicitQuotaFailure: false,
      phase: "evaluateSeeds.enrichment.tool.kakao-local.failure",
      dedupKey: "BROWSER:RESOURCE",
      message: "Error: Chromium browser process crashed while launching",
      occurrenceCount: 2,
    },
  ]);
});

void test("excludes product output and ordinary missing-evidence failures from infrastructure", () => {
  const monitor = createTestMonitor();
  monitor.startCheck("non-infrastructure");
  monitor.logger.error(
    "evaluateSeeds.enrichment.tool.naver-map.failure",
    new Error("selector not found on an otherwise healthy page"),
  );
  monitor.logger.error(
    "evaluateSeeds.enrichment.tool.kakao-local.failure",
    new Error("Kakao Local returned no usable place match"),
  );
  monitor.logger.error(
    "evaluateSeeds.enrichment.agentic_candidate.failure",
    new Error("Invalid input: model response did not match schema"),
    { provider: "OPENAI", recoverable: true, fallbackStatus: "UNKNOWN" },
  );
  monitor.logger.error(
    "evaluateSeeds.llm_scoring.failure",
    new Error("Zod parse failed for model output"),
    { errorCode: "EVALUATE_SEEDS_INVALID_SCORING_RESPONSE" },
  );

  assert.deepEqual(monitor.getSummary().infrastructureSignals, []);
  assert.equal(monitor.getSummary().failures.length, 4);
});

void test("flushes run-local monitor events with campaign context", async () => {
  const directory = await fileSystem.mkdtemp(path.join(tmpdir(), "reco-monitor-flush-"));
  const eventsFile = path.join(directory, "events.jsonl");

  try {
    const monitor = createTestMonitor();
    monitor.startCheck("single-run");
    monitor.configure({
      eventsFile,
      context: { campaignId: "campaign-1", roundId: "2", runId: "edge-1" },
    });
    monitor.logger.debug("qa.detail", { item: 1 });
    await monitor.flush();

    const event = JSON.parse((await fileSystem.readFile(eventsFile, "utf8")).trim()) as {
      context?: Record<string, string>;
    };
    assert.deepEqual(event.context, {
      campaignId: "campaign-1",
      roundId: "2",
      runId: "edge-1",
    });
    await verifyEventsArtifact(eventsFile, monitor.getSummary().eventCount);
  } finally {
    await fileSystem.rm(directory, { recursive: true, force: true });
  }
});

void test("surfaces an event sink durability failure during flush", async () => {
  const directory = await fileSystem.mkdtemp(path.join(tmpdir(), "reco-monitor-failure-"));
  const blockingParent = path.join(directory, "not-a-directory");
  const eventsFile = path.join(blockingParent, "events.jsonl");
  const directoryAtEventsPath = path.join(directory, "events-directory");

  try {
    await fileSystem.writeFile(blockingParent, "blocks mkdir", "utf8");
    await fileSystem.mkdir(directoryAtEventsPath);
    const monitor = createTestMonitor();
    monitor.startCheck("failed-sink");
    monitor.configure({ eventsFile });
    monitor.logger.debug("qa.detail", { item: 1 });

    await assert.rejects(monitor.flush(), /EEXIST|ENOTDIR|file already exists|not a directory/iu);
    await assert.rejects(
      verifyEventsArtifact(eventsFile, monitor.getSummary().eventCount),
      /Events artifact is missing after flush/,
    );
    await assert.rejects(
      verifyEventsArtifact(directoryAtEventsPath, 1),
      /Events artifact is not a regular file after flush/,
    );
  } finally {
    await fileSystem.rm(directory, { recursive: true, force: true });
  }
});

void test("rejects a partially persisted events artifact", async () => {
  const directory = await fileSystem.mkdtemp(path.join(tmpdir(), "reco-monitor-partial-"));
  const eventsFile = path.join(directory, "events.jsonl");

  try {
    await fileSystem.writeFile(eventsFile, '{"phase":"only-one"}\n', "utf8");
    await assert.rejects(
      verifyEventsArtifact(eventsFile, 2),
      /Events artifact count mismatch.*emitted=2, persisted=1/,
    );
  } finally {
    await fileSystem.rm(directory, { recursive: true, force: true });
  }
});

void test("keeps a post-process flush failure counted as an artifact failure", async () => {
  const result = {
    status: "SUCCESS",
    userOutput: { recommendations: [] },
  } as unknown as EngineOutput;
  const run: TestRun = {
    name: "test-gangnam_cafe",
    scenario: "gangnam_cafe",
    status: "PASS",
    processStarted: true,
    engineStatus: "SUCCESS",
    recommendationCount: 5,
    selectedItemIds: ["1", "2", "3", "4", "5"],
    durationMs: 100,
    result,
    log: {},
    trace: {
      eventCount: 1,
      phases: {},
      generatedCandidates: [],
      enrichmentVerifications: [],
      rejectedCandidates: [],
      selectedCandidateIds: [],
      needsMoreSeeds: [],
      failures: [],
      infrastructureSignals: [],
    },
    resultFile: "/tmp/result.json",
    logFile: "/tmp/log.json",
    eventsFile: "/tmp/events.jsonl",
    lifecycleFile: "/tmp/run.lifecycle.json",
  };

  const finalized = await finalizeEventArtifact(run, {
    flush: () => Promise.reject(new Error("disk full")),
  });
  assert.equal(finalized.processStarted, true);
  assert.equal(finalized.status, "FAIL");
  assert.equal(finalized.errorCode, "TEST_ARTIFACT_WRITE_FAILURE");
  assert.equal(finalized.error, "disk full");
});
