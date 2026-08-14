import assert from "node:assert/strict";
import {
  link,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test, { type TestContext } from "node:test";

import { UserInputSchema } from "@monorepo/recommendation-engine/v1/contracts";

import {
  aggregateCampaignRuns,
  aggregateScenarioCampaignStats,
  assertCampaignFixturesValid,
  CAMPAIGN_INITIAL_CONCURRENCY,
  type CampaignScenario,
  classifyCampaignRun,
  createScenarioFingerprint,
  evaluateCircuitBreaker,
  getFinalValidationScenarioNames,
  getNextCampaignConcurrency,
  getRoundScenarioNames,
  getRoundScenarios,
  parseSingleRunJson,
  type ScenarioCampaignStats,
  type SingleRunPublicReport,
} from "../campaign.js";
import {
  createRelevantSourceFingerprint,
  CAMPAIGN_NEW_WORK_CUTOFF_MS,
  getCampaignTimeBudgetDecision,
  runCampaignFinalValidation,
  runCampaignRound,
  type SingleRunChildExecution,
  type SingleRunExecutionRequest,
  type SingleRunExecutor,
} from "../campaign-runner.js";
import {
  campaignScenarioDefinitions,
  edgeValidScenarioNames,
  fixedValidScenarioNames,
  SERVICE_RECOMMENDATION_TARGET,
  testConfig,
  unsupportedScenarioNames,
} from "./fixtures.js";

void test("campaign fixtures mirror the service target and remain schema-valid", () => {
  assert.equal(SERVICE_RECOMMENDATION_TARGET, 5);
  assert.equal(testConfig.targetCount, 5);
  assert.equal(fixedValidScenarioNames.length, 6);
  assert.equal(edgeValidScenarioNames.length, 10);
  assert.equal(unsupportedScenarioNames.length, 10);
  assertCampaignFixturesValid();

  for (const name of fixedValidScenarioNames) {
    const fixture = campaignScenarioDefinitions[name];
    assert.ok(fixture.input.activityType, `${name} must specify activityType`);
  }
  for (const [name, fixture] of Object.entries(campaignScenarioDefinitions)) {
    assert.equal(UserInputSchema.safeParse(fixture.input).success, true, name);
    const date = fixture.input.schedule.dateISO;
    assert.ok(date >= "2026-08-17" && date <= "2026-08-23", `${name}: ${date}`);
  }
});

void test("rounds use five pair slots and rounds six through ten repeat them", () => {
  for (let roundNumber = 1; roundNumber <= 5; roundNumber += 1) {
    const firstPass = getRoundScenarioNames(roundNumber);
    const secondPass = getRoundScenarioNames(roundNumber + 5);
    assert.equal(firstPass.length, 10);
    assert.deepEqual(secondPass, firstPass);
    assert.deepEqual(firstPass.slice(0, 6), fixedValidScenarioNames);
    assert.equal(
      firstPass.filter((name) => campaignScenarioDefinitions[name].group === "EDGE_VALID")
        .length,
      2,
    );
    assert.equal(
      firstPass.filter((name) => campaignScenarioDefinitions[name].group === "UNSUPPORTED")
        .length,
      2,
    );
  }
});

void test("classification requires PASS, five unique IDs, and the intended rejection code", () => {
  const validScenario = getRoundScenarios(1)[0];
  const unsupportedScenario = getRoundScenarios(1).find(
    (scenario) => scenario.expected.kind === "UNSUPPORTED",
  );
  assert.ok(validScenario);
  assert.ok(unsupportedScenario);

  const success = classifyCampaignRun(createPassingReport(validScenario), validScenario);
  assert.equal(success.classification, "NORMAL_SUCCESS");

  const duplicateIds = classifyCampaignRun(
    {
      ...createPassingReport(validScenario),
      selectedItemIds: ["same", "same", "same", "same", "same"],
    },
    validScenario,
  );
  assert.equal(duplicateIds.classification, "PRODUCT_FAILURE");

  const artifactFailure = classifyCampaignRun(
    { ...createPassingReport(validScenario), status: "FAIL" },
    validScenario,
  );
  assert.equal(artifactFailure.classification, "PRODUCT_FAILURE");

  const rejection = classifyCampaignRun(
    createPassingReport(unsupportedScenario),
    unsupportedScenario,
  );
  assert.equal(rejection.classification, "EXPECTED_REJECTION");
  assert.equal(unsupportedScenario.expected.kind, "UNSUPPORTED");
  if (unsupportedScenario.expected.kind !== "UNSUPPORTED") return;
  const wrongReason = classifyCampaignRun(
    { ...createPassingReport(unsupportedScenario), unsupportedReason: "NON_PLACE_REQUEST" },
    unsupportedScenario,
  );
  if (unsupportedScenario.expected.reason !== "NON_PLACE_REQUEST") {
    assert.equal(wrongReason.classification, "PRODUCT_FAILURE");
  }
});

void test("aggregation counts only process-started calls and keeps quality review independent", () => {
  const [validScenario, secondValid] = getRoundScenarios(1);
  const unsupportedScenario = getRoundScenarios(1).find(
    (scenario) => scenario.expected.kind === "UNSUPPORTED",
  );
  assert.ok(validScenario);
  assert.ok(secondValid);
  assert.ok(unsupportedScenario);

  const outcomes = [
    classifyCampaignRun(createPassingReport(validScenario), validScenario),
    classifyCampaignRun(
      {
        ...createPassingReport(secondValid),
        status: "FAIL",
        engineStatus: "ERROR",
        errorCode: "EVALUATE_SEEDS_NO_RECOMMENDABLE_CANDIDATES",
        selectedItemIds: [],
        recommendationCount: 0,
      },
      secondValid,
    ),
    classifyCampaignRun(createPassingReport(unsupportedScenario), unsupportedScenario),
    classifyCampaignRun(
      {
        status: "FAIL",
        scenario: validScenario.id,
        processStarted: false,
        engineStatus: "ERROR",
        errorCode: "TEST_SCRIPT_PREFLIGHT_FAILURE",
      },
      validScenario,
    ),
  ];
  const aggregate = aggregateCampaignRuns(outcomes, [
    {
      scenarioId: validScenario.id,
      itemGrades: ["PASS", "PASS", "WARN", "FAIL", "PASS"],
      hardDefectItemCount: 1,
      topThreeHardDefectCount: 1,
      manualQualityScore: 72,
    },
  ]);

  assert.equal(aggregate.scheduledRuns, 4);
  assert.equal(aggregate.engineStartedRuns, 3);
  assert.equal(aggregate.notCountedRuns, 1);
  assert.equal(aggregate.normalSuccesses, 1);
  assert.equal(aggregate.expectedRejections, 1);
  assert.equal(aggregate.productFailures, 1);
  assert.equal(aggregate.qualityPassRate, 3 / 5);
  assert.equal(aggregate.topThreeHardDefects, 1);

  const stats = aggregateScenarioCampaignStats(outcomes);
  assert.equal(stats.find((item) => item.scenarioId === validScenario.id)?.totalRuns, 1);
});

void test("concurrency policy starts at three, increments clean rounds, and halves infra rounds", () => {
  assert.equal(CAMPAIGN_INITIAL_CONCURRENCY, 3);
  assert.equal(getNextCampaignConcurrency(3, 0), 4);
  assert.equal(getNextCampaignConcurrency(10, 0), 10);
  assert.equal(getNextCampaignConcurrency(9, 1), 4);
  assert.equal(getNextCampaignConcurrency(1, 1), 1);
});

void test("circuit breaker trips on one quota failure or two failures from one provider", () => {
  const scenario = getRoundScenarios(1)[0];
  assert.ok(scenario);
  const quota = classifyCampaignRun(
    createFailureReport(scenario, "DISCOVER_SEEDS_PLAN_ERROR", "OpenAI 429 quota exceeded"),
    scenario,
  );
  assert.deepEqual(evaluateCircuitBreaker([quota]), {
    trip: true,
    reason: "EXPLICIT_QUOTA_FAILURE",
    provider: "OPENAI",
  });

  const timeout = classifyCampaignRun(
    createFailureReport(scenario, "TMAP_PROVIDER_ERROR", "TMap timeout"),
    scenario,
  );
  assert.deepEqual(evaluateCircuitBreaker([timeout]), { trip: false });
  assert.deepEqual(evaluateCircuitBreaker([timeout, timeout]), {
    trip: true,
    reason: "REPEATED_PROVIDER_FAILURE",
    provider: "TMAP",
  });
});

void test("provider detection keeps schema defects product-side and transport failures infra-side", () => {
  const scenario = getRoundScenarios(1)[0];
  assert.ok(scenario);
  const planSchema = classifyCampaignRun(
    createFailureReport(
      scenario,
      "DISCOVER_SEEDS_PLAN_ERROR",
      "No object generated: invalid schema validation",
    ),
    scenario,
  );
  const scoringSchema = classifyCampaignRun(
    createFailureReport(
      scenario,
      "EVALUATE_SEEDS_LLM_SCORING_ERROR",
      "scoring produced no usable evaluation after parse",
    ),
    scenario,
  );
  assert.equal(planSchema.classification, "PRODUCT_FAILURE");
  assert.equal(scoringSchema.classification, "PRODUCT_FAILURE");
  assert.deepEqual(evaluateCircuitBreaker([planSchema, scoringSchema]), { trip: false });

  const plan429 = classifyCampaignRun(
    createFailureReport(scenario, "DISCOVER_SEEDS_PLAN_ERROR", "request failed with 429"),
    scenario,
  );
  assert.equal(plan429.provider, "OPENAI");
  assert.equal(plan429.explicitQuotaFailure, true);

  const transportA = classifyCampaignRun(
    createFailureReport(scenario, "DISCOVER_SEEDS_PLAN_ERROR", "fetch failed ETIMEDOUT"),
    scenario,
  );
  const transportB = classifyCampaignRun(
    createFailureReport(scenario, "EVALUATE_SEEDS_LLM_SCORING_ERROR", "fetch failed"),
    scenario,
  );
  assert.deepEqual(evaluateCircuitBreaker([transportA, transportB]), {
    trip: true,
    reason: "REPEATED_PROVIDER_FAILURE",
    provider: "OPENAI",
  });

  const tmap = classifyCampaignRun(
    createFailureReport(scenario, "DISCOVER_SEEDS_PROVIDER_ERROR", "Request failed"),
    scenario,
  );
  assert.equal(tmap.classification, "INFRA_FAILURE");
  assert.equal(tmap.provider, "TMAP");

  const harness = classifyCampaignRun(
    createFailureReport(scenario, "TEST_ARTIFACT_WRITE_FAILURE", "disk write failed"),
    scenario,
  );
  assert.equal(harness.classification, "INFRA_FAILURE");
  assert.equal(harness.provider, "HARNESS");
});

void test("nonfatal infrastructure signals preserve success metrics and drive the circuit", () => {
  const scenario = getRoundScenarios(1)[0];
  assert.ok(scenario);
  const signal = {
    provider: "TMAP" as const,
    category: "TRANSPORT" as const,
    explicitQuotaFailure: false,
    phase: "discovery",
    dedupKey: "tmap-timeout",
    message: "timeout recovered",
    occurrenceCount: 4,
  };
  const first = classifyCampaignRun(
    { ...createPassingReport(scenario), trace: { infrastructureSignals: [signal] } },
    scenario,
  );
  const second = classifyCampaignRun(
    { ...createPassingReport(scenario), trace: { infrastructureSignals: [signal] } },
    scenario,
  );
  assert.equal(first.classification, "NORMAL_SUCCESS");
  const aggregate = aggregateCampaignRuns([first]);
  assert.equal(aggregate.infrastructureFailures, 0);
  assert.equal(aggregate.infrastructureAffectedRuns, 1);
  assert.deepEqual(aggregate.infrastructureProviderRunCounts, { TMAP: 1 });
  assert.deepEqual(evaluateCircuitBreaker([first]), { trip: false });
  assert.deepEqual(evaluateCircuitBreaker([first, second]), {
    trip: true,
    reason: "REPEATED_PROVIDER_FAILURE",
    provider: "TMAP",
  });

  const quota = classifyCampaignRun(
    {
      ...createPassingReport(scenario),
      trace: {
        infrastructureSignals: [
          { ...signal, category: "QUOTA", explicitQuotaFailure: true },
        ],
      },
    },
    scenario,
  );
  assert.deepEqual(evaluateCircuitBreaker([quota]), {
    trip: true,
    reason: "EXPLICIT_QUOTA_FAILURE",
    provider: "TMAP",
  });
});

void test("single-run JSON parsing rejects envelope mismatch and mixed selected values", () => {
  const scenario = getRoundScenarios(1)[0];
  assert.ok(scenario);
  const report = createPassingReport(scenario);
  assert.throws(
    () =>
      parseSingleRunJson(
        JSON.stringify({ status: "FAIL", selected: [], run: report }),
      ),
    /does not match/,
  );
  assert.throws(
    () =>
      parseSingleRunJson(
        JSON.stringify({ status: "PASS", selected: [scenario.id, 1], run: report }),
      ),
    /valid JSON envelope/,
  );
});

void test("final validation selects highest failure rate, then lower score and stable ID", () => {
  const stats: ScenarioCampaignStats[] = [
    statsFor("edge_busan_region", 2, 2, 60),
    statsFor("edge_late_night_bar", 2, 2, 40),
    statsFor("edge_minimal_input", 2, 1, 10),
    statsFor("unsupported_finance", 2, 2, 50),
    statsFor("unsupported_weather", 2, 2, 20),
    statsFor("unsupported_coding", 2, 1, 10),
  ];
  const selected = getFinalValidationScenarioNames(stats);
  assert.deepEqual(selected.slice(0, 6), fixedValidScenarioNames);
  assert.deepEqual(selected.slice(6, 8), ["edge_late_night_bar", "edge_busan_region"]);
  assert.deepEqual(selected.slice(8), ["unsupported_weather", "unsupported_finance"]);
});

void test("source and scenario fingerprints are deterministic and source-sensitive", async (t) => {
  const root = await createTemporaryRoot(t);
  const sourceFile = join(root, "fixture.ts");
  await writeFile(sourceFile, "export const value = 1;\n", "utf8");
  const first = await createRelevantSourceFingerprint([root]);
  const same = await createRelevantSourceFingerprint([root]);
  await writeFile(sourceFile, "export const value = 2;\n", "utf8");
  const changed = await createRelevantSourceFingerprint([root]);

  assert.equal(first, same);
  assert.notEqual(first, changed);
  assert.equal(first.length, 64);
  assert.equal(createScenarioFingerprint(getRoundScenarioNames(1)).length, 64);
});

void test("round runner enforces concurrency, writes unique manifests, and resumes without rerun", async (t) => {
  const artifactsRoot = await createTemporaryRoot(t);
  let active = 0;
  let maximumActive = 0;
  const requests: SingleRunExecutionRequest[] = [];
  const executor: SingleRunExecutor = async (request) => {
    requests.push(request);
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await Promise.resolve();
    active -= 1;
    return await passingChildExecution(request);
  };
  const baseOptions = {
    campaignId: "campaign-resume",
    roundNumber: 1,
    artifactsRoot,
    concurrency: 3,
    executor,
    skipCredentialPreflight: true,
  } as const;

  const first = await runCampaignRound(baseOptions);
  assert.equal(first.status, "COMPLETED");
  assert.equal(first.startedThisInvocation, 10);
  assert.equal(first.aggregate.engineStartedRuns, 10);
  assert.ok(maximumActive <= 3);
  assert.equal(new Set(requests.map((request) => request.runId)).size, 10);
  assert.equal(new Set(requests.map((request) => request.artifactDir)).size, 10);

  const manifest = JSON.parse(await readFile(first.manifestPath, "utf8")) as {
    scenarioFingerprint: string;
    sourceFingerprint: string;
    status: string;
  };
  assert.equal(manifest.status, "COMPLETED");
  assert.equal(manifest.scenarioFingerprint.length, 64);
  assert.equal(manifest.sourceFingerprint.length, 64);

  requests.length = 0;
  const resumed = await runCampaignRound(baseOptions);
  assert.equal(resumed.status, "COMPLETED");
  assert.equal(resumed.skippedCompleted, 10);
  assert.equal(resumed.startedThisInvocation, 0);
  assert.equal(requests.length, 0);
});

void test("round two cannot start before a verified completed round one", async (t) => {
  const artifactsRoot = await createTemporaryRoot(t);
  let executions = 0;
  await assert.rejects(
    runCampaignRound({
      campaignId: "campaign-order",
      roundNumber: 2,
      artifactsRoot,
      skipCredentialPreflight: true,
      executor: async (request) => {
        executions += 1;
        return await passingChildExecution(request);
      },
    }),
    /completed predecessor manifest round-01/,
  );
  assert.equal(executions, 0);
});

void test("campaign lock excludes a different round and is released after completion", async (t) => {
  const artifactsRoot = await createTemporaryRoot(t);
  let releaseGate: (() => void) | undefined;
  let markEntered: (() => void) | undefined;
  const gate = new Promise<void>((resolvePromise) => {
    releaseGate = resolvePromise;
  });
  const entered = new Promise<void>((resolvePromise) => {
    markEntered = resolvePromise;
  });
  let enteredOnce = false;
  const first = runCampaignRound({
    campaignId: "campaign-lock",
    roundNumber: 1,
    artifactsRoot,
    concurrency: 1,
    skipCredentialPreflight: true,
    executor: async (request) => {
      if (!enteredOnce) {
        enteredOnce = true;
        markEntered?.();
      }
      await gate;
      return await passingChildExecution(request);
    },
  });
  await entered;
  await assert.rejects(
    runCampaignRound({
      campaignId: "campaign-lock",
      roundNumber: 2,
      artifactsRoot,
      skipCredentialPreflight: true,
      executor: passingChildExecution,
    }),
    /Campaign is locked for round-01/,
  );
  releaseGate?.();
  assert.equal((await first).status, "COMPLETED");

  const second = await runCampaignRound({
    campaignId: "campaign-lock",
    roundNumber: 2,
    artifactsRoot,
    skipCredentialPreflight: true,
    executor: passingChildExecution,
  });
  assert.equal(second.status, "COMPLETED");
});

void test("corrupt manifest paths and symlinked run directories are rejected before spawn", async (t) => {
  const artifactsRoot = await createTemporaryRoot(t);
  const first = await runCampaignRound({
    campaignId: "campaign-path-audit",
    roundNumber: 1,
    artifactsRoot,
    skipCredentialPreflight: true,
    executor: passingChildExecution,
  });
  const manifest = await readTestManifest(first.manifestPath);
  const record = Object.values(manifest.runs)[0];
  assert.ok(record);
  record.artifactDir = join(artifactsRoot, "escaped");
  await writeFile(first.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  let executions = 0;
  await assert.rejects(
    runCampaignRound({
      campaignId: "campaign-path-audit",
      roundNumber: 1,
      artifactsRoot,
      skipCredentialPreflight: true,
      executor: async (request) => {
        executions += 1;
        return await passingChildExecution(request);
      },
    }),
    /identity or path is invalid/,
  );
  assert.equal(executions, 0);

  const symlinkCampaign = "campaign-symlink-audit";
  const symlinkRound = await runCampaignRound({
    campaignId: symlinkCampaign,
    roundNumber: 1,
    artifactsRoot,
    skipCredentialPreflight: true,
    executor: passingChildExecution,
  });
  const symlinkManifest = await readTestManifest(symlinkRound.manifestPath);
  const symlinkRecord = Object.values(symlinkManifest.runs)[0];
  assert.ok(symlinkRecord);
  const external = join(artifactsRoot, "external-run");
  await mkdir(external);
  await rm(symlinkRecord.artifactDir, { recursive: true });
  await symlink(external, symlinkRecord.artifactDir);
  await assert.rejects(
    runCampaignRound({
      campaignId: symlinkCampaign,
      roundNumber: 1,
      artifactsRoot,
      skipCredentialPreflight: true,
      executor: passingChildExecution,
    }),
    /must not be a symlink/,
  );
});

void test("deep manifest validation rejects outcome signal tampering before spawn", async (t) => {
  const artifactsRoot = await createTemporaryRoot(t);
  const result = await runCampaignRound({
    campaignId: "campaign-manifest-tamper",
    roundNumber: 1,
    artifactsRoot,
    skipCredentialPreflight: true,
    executor: passingChildExecution,
  });
  const manifest = await readTestManifest(result.manifestPath);
  const record = Object.values(manifest.runs)[0];
  assert.ok(record?.outcome);
  (record.outcome as Record<string, unknown>).infrastructureSignals = [
    {
      provider: "OPENAI",
      category: "QUOTA",
      explicitQuotaFailure: true,
      phase: "tampered",
      dedupKey: "tampered",
      message: "tampered",
      occurrenceCount: 1,
    },
  ];
  await writeFile(result.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  let executions = 0;
  await assert.rejects(
    runCampaignRound({
      campaignId: "campaign-manifest-tamper",
      roundNumber: 1,
      artifactsRoot,
      skipCredentialPreflight: true,
      executor: async (request) => {
        executions += 1;
        return await passingChildExecution(request);
      },
    }),
    /Stored outcome does not match/,
  );
  assert.equal(executions, 0);
});

void test("runner does not retry and leaves pre-engine failures pending for explicit resume", async (t) => {
  const artifactsRoot = await createTemporaryRoot(t);
  const executions = new Map<string, number>();
  let failFirst = true;
  const executor: SingleRunExecutor = async (request) => {
    executions.set(request.scenario.id, (executions.get(request.scenario.id) ?? 0) + 1);
    if (failFirst) {
      failFirst = false;
      return { exitCode: 1, stdout: "not-json", stderr: "spawn setup failed" };
    }
    return await passingChildExecution(request);
  };
  const options = {
    campaignId: "campaign-pre-engine",
    roundNumber: 1,
    artifactsRoot,
    concurrency: 1,
    executor,
    skipCredentialPreflight: true,
  } as const;

  const first = await runCampaignRound(options);
  assert.equal(first.status, "INCOMPLETE");
  assert.equal(first.pendingForResume, 1);
  assert.equal(first.aggregate.notCountedRuns, 1);
  assert.ok([...executions.values()].every((count) => count === 1));

  const beforeResume = [...executions.values()].reduce((sum, count) => sum + count, 0);
  const resumed = await runCampaignRound(options);
  const afterResume = [...executions.values()].reduce((sum, count) => sum + count, 0);
  assert.equal(resumed.status, "COMPLETED");
  assert.equal(resumed.startedThisInvocation, 1);
  assert.equal(afterResume - beforeResume, 1);
});

void test("quota circuit stops unstarted work and an explicit resume finishes the round", async (t) => {
  const artifactsRoot = await createTemporaryRoot(t);
  let firstRequest = true;
  const quotaExecutor: SingleRunExecutor = async (request) => {
    if (firstRequest) {
      firstRequest = false;
      return await failureChildExecution(
        request,
        createFailureReport(
          request.scenario,
          "DISCOVER_SEEDS_PLAN_ERROR",
          "OpenAI 429 quota exceeded",
        ),
      );
    }
    return await passingChildExecution(request);
  };
  const base = {
    campaignId: "campaign-circuit",
    roundNumber: 1,
    artifactsRoot,
    concurrency: 1,
    skipCredentialPreflight: true,
  } as const;
  const tripped = await runCampaignRound({ ...base, executor: quotaExecutor });
  assert.equal(tripped.status, "CIRCUIT_OPEN");
  assert.equal(tripped.startedThisInvocation, 1);
  assert.equal(tripped.pendingForResume, 9);
  assert.equal(tripped.aggregate.infrastructureFailures, 1);

  const resumed = await runCampaignRound({
    ...base,
    executor: passingChildExecution,
  });
  assert.equal(resumed.status, "COMPLETED");
  assert.equal(resumed.startedThisInvocation, 9);
  assert.equal(resumed.aggregate.engineStartedRuns, 10);
});

void test("final validation runs in a separate final manifest with selected scenarios", async (t) => {
  const artifactsRoot = await createTemporaryRoot(t);
  const executed: string[] = [];
  await completeCampaignRounds("campaign-final", artifactsRoot);
  const result = await runCampaignFinalValidation({
    campaignId: "campaign-final",
    artifactsRoot,
    concurrency: 2,
    skipCredentialPreflight: true,
    executor: async (request) => {
      executed.push(request.scenario.id);
      return await passingChildExecution(request);
    },
  });

  assert.equal(result.roundNumber, 11);
  assert.equal(result.roundId, "final");
  assert.equal(result.status, "COMPLETED");
  assert.match(result.manifestPath, /\/final\/manifest\.json$/);
  assert.equal(executed.length, 10);
});

void test("final validation refuses to start before all ten predecessor rounds", async (t) => {
  const artifactsRoot = await createTemporaryRoot(t);
  let executions = 0;
  await assert.rejects(
    runCampaignFinalValidation({
      campaignId: "campaign-final-early",
      artifactsRoot,
      skipCredentialPreflight: true,
      executor: async (request) => {
        executions += 1;
        return await passingChildExecution(request);
      },
    }),
    /completed predecessor manifest round-01/,
  );
  assert.equal(executions, 0);
});

void test("completed artifact deletion, corruption, aliasing, and event mismatch block resume", async (t) => {
  const mutations: Array<{
    campaignId: string;
    mutate: (record: TestManifest["runs"][string]) => Promise<void>;
    message: RegExp;
  }> = [
    {
      campaignId: "campaign-artifact-missing",
      mutate: async (record) => {
        const report = record.report as SingleRunPublicReport;
        assert.ok(report.resultFile);
        await unlink(report.resultFile);
      },
      message: /Required run artifact is missing/,
    },
    {
      campaignId: "campaign-artifact-corrupt",
      mutate: async (record) => {
        const report = record.report as SingleRunPublicReport;
        assert.ok(report.resultFile);
        await writeFile(report.resultFile, "{not-json\n", "utf8");
      },
      message: /Invalid result artifact JSON/,
    },
    {
      campaignId: "campaign-artifact-alias",
      mutate: async (record) => {
        const report = record.report as SingleRunPublicReport;
        assert.ok(report.resultFile);
        assert.ok(report.logFile);
        await unlink(report.logFile);
        await link(report.resultFile, report.logFile);
      },
      message: /must not alias one file/,
    },
    {
      campaignId: "campaign-artifact-events",
      mutate: async (record) => {
        const report = record.report as SingleRunPublicReport;
        assert.ok(report.eventsFile);
        await writeFile(
          report.eventsFile,
          `${JSON.stringify({ type: "one" })}\n${JSON.stringify({ type: "two" })}\n`,
          "utf8",
        );
      },
      message: /log\/event artifacts are inconsistent/,
    },
  ];

  for (const item of mutations) {
    const artifactsRoot = await createTemporaryRoot(t);
    const result = await runCampaignRound({
      campaignId: item.campaignId,
      roundNumber: 1,
      artifactsRoot,
      skipCredentialPreflight: true,
      executor: passingChildExecution,
    });
    const manifest = await readTestManifest(result.manifestPath);
    const record = Object.values(manifest.runs)[0];
    assert.ok(record);
    await item.mutate(record);
    await assert.rejects(
      runCampaignRound({
        campaignId: item.campaignId,
        roundNumber: 1,
        artifactsRoot,
        skipCredentialPreflight: true,
        executor: passingChildExecution,
      }),
      item.message,
    );
  }
});

void test("resume recovers a completed stale run from its deterministic lifecycle marker", async (t) => {
  const artifactsRoot = await createTemporaryRoot(t);
  const options = {
    campaignId: "campaign-lifecycle-complete",
    roundNumber: 1,
    artifactsRoot,
    concurrency: 2,
    skipCredentialPreflight: true,
  } as const;
  const first = await runCampaignRound({
    ...options,
    executor: passingChildExecution,
  });
  const manifest = await readTestManifest(first.manifestPath);
  const scenario = getRoundScenarios(1)[0];
  assert.ok(scenario);
  const record = manifest.runs[scenario.id];
  assert.ok(record);
  manifest.status = "RUNNING";
  record.status = "RUNNING";
  delete record.completedAt;
  delete record.report;
  delete record.outcome;
  await writeFile(first.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  let executionCount = 0;
  const recovered = await runCampaignRound({
    ...options,
    executor: async (request) => {
      executionCount += 1;
      return await passingChildExecution(request);
    },
  });
  assert.equal(recovered.status, "COMPLETED");
  assert.equal(recovered.skippedCompleted, 10);
  assert.equal(recovered.startedThisInvocation, 0);
  assert.equal(executionCount, 0);
});

void test("stale completed lifecycle with processStarted false is rerun without being counted", async (t) => {
  const artifactsRoot = await createTemporaryRoot(t);
  const options = {
    campaignId: "campaign-lifecycle-pre-engine",
    roundNumber: 1,
    artifactsRoot,
    concurrency: 1,
    skipCredentialPreflight: true,
  } as const;
  const first = await runCampaignRound({ ...options, executor: passingChildExecution });
  const manifest = await readTestManifest(first.manifestPath);
  const scenario = getRoundScenarios(1)[0];
  assert.ok(scenario);
  const record = manifest.runs[scenario.id];
  assert.ok(record);
  const oldLifecycle = JSON.parse(await readFile(record.lifecycleFile, "utf8")) as Record<
    string,
    unknown
  >;
  const oldReport = oldLifecycle.publicRun as SingleRunPublicReport;
  const preEngineReport: SingleRunPublicReport = {
    ...oldReport,
    status: "FAIL",
    processStarted: false,
    engineStatus: "ERROR",
    errorCode: "TEST_SCRIPT_PREFLIGHT_FAILURE",
    engineErrorMessage: "preflight failed",
    recommendationCount: 0,
    selectedItemIds: [],
  };
  manifest.status = "RUNNING";
  record.status = "RUNNING";
  delete record.completedAt;
  delete record.report;
  delete record.outcome;
  await writeTestLifecycle(record.lifecycleFile, {
    ...oldLifecycle,
    state: "COMPLETED",
    processStarted: false,
    publicRun: preEngineReport,
  });
  await writeFile(first.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  let executions = 0;
  const resumed = await runCampaignRound({
    ...options,
    executor: async (request) => {
      executions += 1;
      return await passingChildExecution(request);
    },
  });
  assert.equal(resumed.status, "COMPLETED");
  assert.equal(resumed.startedThisInvocation, 1);
  assert.equal(executions, 1);
  assert.equal(resumed.aggregate.engineStartedRuns, 10);
});

void test("corrupt completed lifecycle becomes a stable audit instead of a retry loop", async (t) => {
  const artifactsRoot = await createTemporaryRoot(t);
  const options = {
    campaignId: "campaign-lifecycle-corrupt",
    roundNumber: 1,
    artifactsRoot,
    concurrency: 1,
    skipCredentialPreflight: true,
  } as const;
  const first = await runCampaignRound({ ...options, executor: passingChildExecution });
  const manifest = await readTestManifest(first.manifestPath);
  const record = Object.values(manifest.runs)[0];
  assert.ok(record);
  const lifecycle = JSON.parse(await readFile(record.lifecycleFile, "utf8")) as Record<
    string,
    unknown
  >;
  lifecycle.unexpected = true;
  manifest.status = "RUNNING";
  record.status = "RUNNING";
  delete record.completedAt;
  delete record.report;
  delete record.outcome;
  await writeTestLifecycle(record.lifecycleFile, lifecycle);
  await writeFile(first.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  let executions = 0;
  const resumed = await runCampaignRound({
    ...options,
    executor: async (request) => {
      executions += 1;
      return await passingChildExecution(request);
    },
  });
  assert.equal(resumed.status, "AUDIT_REQUIRED");
  assert.equal(resumed.startedThisInvocation, 0);
  assert.equal(executions, 0);
});

void test("missing or conflicting lifecycle and exit reports stop as counted audit", async (t) => {
  const cases: Array<{
    campaignId: string;
    execute: SingleRunExecutor;
    expectedCode: string;
  }> = [
    {
      campaignId: "campaign-missing-lifecycle",
      execute: async (request) => {
        const report = createPassingReport(request.scenario, request);
        return {
          exitCode: 0,
          stdout: JSON.stringify({ status: "PASS", selected: [request.scenario.id], run: report }),
          stderr: "",
        };
      },
      expectedCode: "CAMPAIGN_STALE_LIFECYCLE_INVALID",
    },
    {
      campaignId: "campaign-lifecycle-conflict",
      execute: async (request) => {
        await writeTestLifecycle(
          request.lifecycleFile,
          createStartedLifecycleMarker(request),
        );
        const report: SingleRunPublicReport = {
          ...createPassingReport(request.scenario, request),
          status: "FAIL",
          processStarted: false,
          engineStatus: "ERROR",
          errorCode: "TEST_SCRIPT_PREFLIGHT_FAILURE",
          recommendationCount: 0,
          selectedItemIds: [],
        };
        return {
          exitCode: 1,
          stdout: JSON.stringify({ status: "FAIL", selected: [], run: report }),
          stderr: "preflight",
        };
      },
      expectedCode: "CAMPAIGN_LIFECYCLE_REPORT_MISMATCH",
    },
    {
      campaignId: "campaign-exit-conflict",
      execute: async (request) => {
        const passing = await passingChildExecution(request);
        return { ...passing, exitCode: 1 };
      },
      expectedCode: "CAMPAIGN_CHILD_EXIT_MISMATCH",
    },
  ];

  for (const item of cases) {
    const artifactsRoot = await createTemporaryRoot(t);
    const result = await runCampaignRound({
      campaignId: item.campaignId,
      roundNumber: 1,
      artifactsRoot,
      concurrency: 1,
      skipCredentialPreflight: true,
      executor: item.execute,
    });
    assert.equal(result.status, "AUDIT_REQUIRED", item.campaignId);
    assert.equal(result.startedThisInvocation, 1);
    const manifest = await readTestManifest(result.manifestPath);
    const audit = Object.values(manifest.runs).find(
      (record) => record.status === "AUDIT_REQUIRED",
    );
    assert.equal(
      (audit?.report as SingleRunPublicReport | undefined)?.errorCode,
      item.expectedCode,
    );
  }
});

void test("artifact write failures are HARNESS infra and force round audit", async (t) => {
  const artifactsRoot = await createTemporaryRoot(t);
  const result = await runCampaignRound({
    campaignId: "campaign-artifact-failure",
    roundNumber: 1,
    artifactsRoot,
    concurrency: 1,
    skipCredentialPreflight: true,
    executor: async (request) =>
      await failureChildExecution(
        request,
        createFailureReport(
          request.scenario,
          "TEST_ARTIFACT_WRITE_FAILURE",
          "events sink flush failed",
        ),
      ),
  });
  assert.equal(result.status, "AUDIT_REQUIRED");
  assert.equal(result.aggregate.infrastructureFailures, 1);
});

void test("engine-started timeout is counted once, stops scheduling, and requires audit", async (t) => {
  const artifactsRoot = await createTemporaryRoot(t);
  let executionCount = 0;
  const options = {
    campaignId: "campaign-lifecycle-timeout",
    roundNumber: 1,
    artifactsRoot,
    concurrency: 1,
    skipCredentialPreflight: true,
  } as const;
  const timedOut = await runCampaignRound({
    ...options,
    executor: async (request) => {
      executionCount += 1;
      await writeTestLifecycle(
        request.lifecycleFile,
        createStartedLifecycleMarker(request),
      );
      return { exitCode: null, stdout: "", stderr: "timed out", timedOut: true };
    },
  });

  assert.equal(timedOut.status, "AUDIT_REQUIRED");
  assert.equal(timedOut.startedThisInvocation, 1);
  assert.equal(timedOut.auditRequiredRuns, 1);
  assert.equal(timedOut.pendingForResume, 9);
  assert.equal(timedOut.aggregate.engineStartedRuns, 1);
  assert.equal(executionCount, 1);

  const resumed = await runCampaignRound({
    ...options,
    executor: async (request) => {
      executionCount += 1;
      return await passingChildExecution(request);
    },
  });
  assert.equal(resumed.status, "AUDIT_REQUIRED");
  assert.equal(resumed.startedThisInvocation, 0);
  assert.equal(executionCount, 1);
});

void test("credential preflight fails before child execution", async (t) => {
  const artifactsRoot = await createTemporaryRoot(t);
  let executionCount = 0;
  await assert.rejects(
    runCampaignRound({
      campaignId: "campaign-preflight",
      roundNumber: 1,
      artifactsRoot,
      env: {},
      executor: async (request) => {
        executionCount += 1;
        return await passingChildExecution(request);
      },
    }),
    /Campaign credential preflight failed: OpenAI.*Naver Search client ID.*Naver Search client secret/,
  );
  assert.equal(executionCount, 0);
});

void test("campaign time budget stops new rounds at 22 hours and caps child timeout", async (t) => {
  const startedAt = "2026-08-14T00:00:00.000Z";
  const cutoff = getCampaignTimeBudgetDecision({
    campaignStartedAt: startedAt,
    now: new Date(Date.parse(startedAt) + CAMPAIGN_NEW_WORK_CUTOFF_MS),
    requestedChildTimeoutMs: 2 * 60 * 60 * 1_000,
  });
  assert.equal(cutoff.canStartNewWork, false);
  const nearHardLimit = getCampaignTimeBudgetDecision({
    campaignStartedAt: startedAt,
    now: new Date(Date.parse(startedAt) + 23.5 * 60 * 60 * 1_000),
    requestedChildTimeoutMs: 2 * 60 * 60 * 1_000,
  });
  assert.equal(nearHardLimit.effectiveChildTimeoutMs, 30 * 60 * 1_000);

  const artifactsRoot = await createTemporaryRoot(t);
  let current = new Date(startedAt);
  const now = (): Date => new Date(current);
  await runCampaignRound({
    campaignId: "campaign-time-budget",
    roundNumber: 1,
    artifactsRoot,
    skipCredentialPreflight: true,
    executor: passingChildExecution,
    now,
  });
  current = new Date(Date.parse(startedAt) + CAMPAIGN_NEW_WORK_CUTOFF_MS);
  let executions = 0;
  const stopped = await runCampaignRound({
    campaignId: "campaign-time-budget",
    roundNumber: 2,
    artifactsRoot,
    skipCredentialPreflight: true,
    executor: async (request) => {
      executions += 1;
      return await passingChildExecution(request);
    },
    now,
  });
  assert.equal(stopped.status, "INCOMPLETE");
  assert.equal(stopped.haltReason, "CAMPAIGN_TIME_BUDGET_EXHAUSTED");
  assert.equal(stopped.startedThisInvocation, 0);
  assert.equal(executions, 0);
});

const createPassingReport = (
  scenario: CampaignScenario,
  request?: SingleRunExecutionRequest,
): SingleRunPublicReport => {
  const identity = request
    ? {
        name: scenario.id,
        campaignId: request.campaignId,
        roundId: request.roundId,
        runId: request.runId,
        durationMs: 1,
        trace: { eventCount: 1, infrastructureSignals: [] },
        resultFile: join(request.artifactDir, `${request.runId}.result.json`),
        logFile: join(request.artifactDir, `${request.runId}.log.json`),
        eventsFile: join(request.artifactDir, `${request.runId}.events.jsonl`),
        lifecycleFile: request.lifecycleFile,
      }
    : {};
  return scenario.expected.kind === "SUCCESS"
    ? {
        ...identity,
        status: "PASS",
        scenario: scenario.id,
        processStarted: true,
        engineStatus: "SUCCESS",
        recommendationCount: 5,
        selectedItemIds: ["place-1", "place-2", "place-3", "place-4", "place-5"],
      }
    : {
        ...identity,
        status: "PASS",
        scenario: scenario.id,
        processStarted: true,
        engineStatus: "ERROR",
        errorCode: scenario.expected.errorCode,
        unsupportedReason: scenario.expected.reason,
        engineErrorMessage: "Unsupported recommendation request",
        recommendationCount: 0,
        selectedItemIds: [],
      };
};

const createFailureReport = (
  scenario: CampaignScenario,
  errorCode: string,
  engineErrorMessage: string,
): SingleRunPublicReport => ({
  status: "FAIL",
  scenario: scenario.id,
  processStarted: true,
  engineStatus: "ERROR",
  errorCode,
  engineErrorMessage,
  recommendationCount: 0,
  selectedItemIds: [],
  error: engineErrorMessage,
});

const passingChildExecution = async (
  request: SingleRunExecutionRequest,
): Promise<SingleRunChildExecution> => {
  const report = createPassingReport(request.scenario, request);
  await writeDurableTestArtifacts(request, report);
  return {
    exitCode: 0,
    stdout: JSON.stringify({
      status: "PASS",
      selected: [request.scenario.id],
      run: report,
    }),
    stderr: "",
  };
};

const failureChildExecution = async (
  request: SingleRunExecutionRequest,
  report: SingleRunPublicReport,
): Promise<SingleRunChildExecution> => {
  const identifiedReport: SingleRunPublicReport = {
    ...report,
    name: request.scenario.id,
    campaignId: request.campaignId,
    roundId: request.roundId,
    runId: request.runId,
    durationMs: 1,
    trace: { eventCount: 1, infrastructureSignals: [] },
    resultFile: join(request.artifactDir, `${request.runId}.result.json`),
    logFile: join(request.artifactDir, `${request.runId}.log.json`),
    eventsFile: join(request.artifactDir, `${request.runId}.events.jsonl`),
    lifecycleFile: request.lifecycleFile,
  };
  await writeDurableTestArtifacts(request, identifiedReport);
  return {
    exitCode: 1,
    stdout: JSON.stringify({
      status: "FAIL",
      selected: [report.scenario],
      run: identifiedReport,
    }),
    stderr: report.engineErrorMessage ?? report.error ?? "failure",
  };
};

const writeDurableTestArtifacts = async (
  request: SingleRunExecutionRequest,
  report: SingleRunPublicReport,
): Promise<void> => {
  assert.ok(report.resultFile);
  assert.ok(report.logFile);
  assert.ok(report.eventsFile);
  assert.ok(report.lifecycleFile);
  const event = { type: "test.event", runId: request.runId };
  const result =
    report.engineStatus === "SUCCESS"
      ? {
          status: "SUCCESS",
          userOutput: {
            recommendations: (report.selectedItemIds ?? []).map((id) => ({ id })),
          },
        }
      : {
          status: "ERROR",
          error: {
            code: report.errorCode,
            message: report.engineErrorMessage,
          },
        };
  const log = {
    schemaVersion: 1,
    artifactType: "recommendation-engine-test-log",
    name: report.name,
    scenario: report.scenario,
    campaignId: report.campaignId,
    roundId: report.roundId,
    runId: report.runId,
    status: report.status,
    processStarted: report.processStarted,
    engineStatus: report.engineStatus,
    errorCode: report.errorCode,
    engineErrorMessage: report.engineErrorMessage,
    recommendationCount: report.recommendationCount,
    selectedItemIds: report.selectedItemIds,
    trace: report.trace,
    eventCount: 1,
    resultFile: report.resultFile,
    logFile: report.logFile,
    eventsFile: report.eventsFile,
    lifecycleFile: report.lifecycleFile,
  };
  const lifecycle = {
    schemaVersion: 1,
    artifactType: "recommendation-engine-test-lifecycle",
    state: "COMPLETED",
    campaignId: request.campaignId,
    roundId: request.roundId,
    runId: request.runId,
    scenario: request.scenario.id,
    processId: process.pid,
    processStarted: report.processStarted,
    lifecycleFile: report.lifecycleFile,
    resultFile: report.resultFile,
    logFile: report.logFile,
    eventsFile: report.eventsFile,
    updatedAt: "2026-08-14T00:00:00.000Z",
    completedAt: "2026-08-14T00:00:00.000Z",
    publicRun: report,
  };
  await Promise.all([
    writeFile(report.resultFile, `${JSON.stringify(result)}\n`, "utf8"),
    writeFile(report.logFile, `${JSON.stringify(log)}\n`, "utf8"),
    writeFile(report.eventsFile, `${JSON.stringify(event)}\n`, "utf8"),
    writeFile(report.lifecycleFile, `${JSON.stringify(lifecycle)}\n`, "utf8"),
  ]);
};

const statsFor = (
  scenarioId: ScenarioCampaignStats["scenarioId"],
  totalRuns: number,
  failedRuns: number,
  manualQualityScore: number,
): ScenarioCampaignStats => ({
  scenarioId,
  totalRuns,
  failedRuns,
  manualQualityScore,
});

const completeCampaignRounds = async (
  campaignId: string,
  artifactsRoot: string,
  throughRound = 10,
): Promise<void> => {
  for (let roundNumber = 1; roundNumber <= throughRound; roundNumber += 1) {
    const result = await runCampaignRound({
      campaignId,
      roundNumber,
      artifactsRoot,
      concurrency: 3,
      skipCredentialPreflight: true,
      executor: passingChildExecution,
    });
    assert.equal(result.status, "COMPLETED", `round ${roundNumber}`);
  }
};

const createStartedLifecycleMarker = (
  request: SingleRunExecutionRequest,
): Record<string, unknown> => ({
  schemaVersion: 1,
  artifactType: "recommendation-engine-test-lifecycle",
  state: "ENGINE_PROCESS_STARTED",
  campaignId: request.campaignId,
  roundId: request.roundId,
  runId: request.runId,
  scenario: request.scenario.id,
  processId: process.pid,
  processStarted: true,
  lifecycleFile: request.lifecycleFile,
  resultFile: join(request.artifactDir, `${request.runId}.result.json`),
  logFile: join(request.artifactDir, `${request.runId}.log.json`),
  eventsFile: join(request.artifactDir, `${request.runId}.events.jsonl`),
  updatedAt: "2026-08-14T00:00:00.000Z",
  engineProcessStartedAt: "2026-08-14T00:00:00.000Z",
});

const createTemporaryRoot = async (
  context: TestContext,
): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), "recommendation-campaign-"));
  context.after(async () => {
    await rm(root, { recursive: true, force: true });
  });
  return root;
};

type TestManifest = {
  status: string;
  runs: Record<
    string,
    {
      runId: string;
      lifecycleFile: string;
      status: string;
      completedAt?: string;
      report?: unknown;
      outcome?: unknown;
    }
  >;
};

const readTestManifest = async (manifestFile: string): Promise<TestManifest> =>
  JSON.parse(await readFile(manifestFile, "utf8")) as TestManifest;

const writeTestLifecycle = async (
  lifecycleFile: string,
  marker: Record<string, unknown>,
): Promise<void> => {
  await mkdir(dirname(lifecycleFile), { recursive: true });
  await writeFile(lifecycleFile, `${JSON.stringify(marker, null, 2)}\n`, "utf8");
};
