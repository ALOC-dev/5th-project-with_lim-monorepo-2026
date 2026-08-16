import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import {
  access,
  lstat,
  mkdir,
  open,
  readdir,
  readFile,
  realpath,
  rename,
  stat,
  unlink,
} from "node:fs/promises";
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

import {
  aggregateCampaignRuns,
  aggregateScenarioCampaignStats,
  assertCampaignFixturesValid,
  CAMPAIGN_INITIAL_CONCURRENCY,
  CAMPAIGN_MAX_CONCURRENCY,
  CAMPAIGN_ROUND_SIZE,
  type CampaignAggregate,
  type CampaignScenario,
  type CircuitBreakerDecision,
  type ClassifiedCampaignRun,
  classifyCampaignRun,
  createScenarioFingerprint,
  evaluateCircuitBreaker,
  getFinalValidationScenarios,
  getNextCampaignConcurrency,
  getRoundScenarios,
  parseSingleRunJson,
  type ScenarioCampaignStats,
  type SingleRunPublicReport,
} from "./campaign.js";
import {
  parseTestScenarioName,
  type TestScenarioName,
  UNSUPPORTED_RECOMMENDATION_ERROR_CODE,
} from "./test/fixtures.js";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const defaultServerRoot = resolve(moduleDir, "../../..");
const repositoryRoot = resolve(moduleDir, "../../../../..");
const recommendationEngineSourceRoot = join(
  repositoryRoot,
  "packages",
  "recommendation-engine",
  "src",
  "v1",
);

export const DEFAULT_SINGLE_RUN_SCRIPT = join(moduleDir, "test.ts");
export const DEFAULT_CAMPAIGN_ARTIFACTS_ROOT = join(moduleDir, ".log", "campaigns");
export const DEFAULT_CHILD_TIMEOUT_MS = 2 * 60 * 60 * 1_000;
export const CAMPAIGN_MAX_DURATION_MS = 24 * 60 * 60 * 1_000;
export const CAMPAIGN_NEW_WORK_CUTOFF_MS = 22 * 60 * 60 * 1_000;
export const CAMPAIGN_CHILD_TERMINATION_GRACE_MS = 10_000;

const manifestFileName = "manifest.json";
const maximumCapturedOutputCharacters = 1_000_000;
const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,47}$/;

export type CampaignRunStatus =
  | "PENDING"
  | "RUNNING"
  | "COMPLETED"
  | "PRE_ENGINE_FAILURE"
  | "AUDIT_REQUIRED";

export type CampaignRoundStatus =
  | "RUNNING"
  | "COMPLETED"
  | "INCOMPLETE"
  | "CIRCUIT_OPEN"
  | "AUDIT_REQUIRED";

export type CampaignRunRecord = {
  runId: string;
  scenarioId: TestScenarioName;
  artifactDir: string;
  lifecycleFile: string;
  status: CampaignRunStatus;
  executionCount: number;
  startedAt?: string;
  completedAt?: string;
  childExitCode?: number | null;
  childStderr?: string;
  report?: SingleRunPublicReport;
  outcome?: ClassifiedCampaignRun;
};

export type CampaignRoundManifest = {
  schemaVersion: 1;
  artifactType: "recommendation-engine-campaign-round";
  campaignId: string;
  roundId: string;
  roundNumber: number;
  scenarioFingerprint: string;
  sourceFingerprint: string;
  initialConcurrency: number;
  concurrency: number;
  circuitAcknowledgedRunIds: string[];
  childTimeoutMs: number;
  status: CampaignRoundStatus;
  createdAt: string;
  updatedAt: string;
  scenarioIds: TestScenarioName[];
  runs: Record<string, CampaignRunRecord>;
  circuitBreaker?: Exclude<CircuitBreakerDecision, { trip: false }>;
  haltReason?: "CAMPAIGN_TIME_BUDGET_EXHAUSTED";
};

export type SingleRunExecutionRequest = {
  campaignId: string;
  roundId: string;
  runId: string;
  scenario: CampaignScenario;
  artifactDir: string;
  lifecycleFile: string;
};

export type SingleRunChildExecution = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut?: boolean;
};

export type SingleRunExecutor = (
  request: SingleRunExecutionRequest,
) => Promise<SingleRunChildExecution>;

type SingleRunLifecycle = {
  schemaVersion: 1;
  artifactType: "recommendation-engine-test-lifecycle";
  state: "ENGINE_PROCESS_STARTED" | "COMPLETED";
  campaignId?: string;
  roundId?: string;
  scenario: TestScenarioName;
  runId?: string;
  processId: number;
  processStarted: boolean;
  lifecycleFile: string;
  resultFile: string;
  logFile: string;
  eventsFile: string;
  updatedAt: string;
  engineProcessStartedAt?: string;
  completedAt?: string;
  publicRun?: SingleRunPublicReport;
};

type LifecycleExpectation = {
  campaignId: string;
  roundId: string;
  runId: string;
  scenarioId: TestScenarioName;
  artifactDir: string;
  lifecycleFile: string;
};

export type CredentialRequirement = {
  label: string;
  alternatives: string[];
};

export const DEFAULT_CAMPAIGN_CREDENTIAL_REQUIREMENTS: readonly CredentialRequirement[] = [
  { label: "OpenAI", alternatives: ["OPENAI_API_KEY"] },
  { label: "TMap", alternatives: ["TMAP_APP_KEY"] },
  { label: "Kakao Local", alternatives: ["KAKAO_REST_API_KEY"] },
  {
    label: "Naver Search client ID",
    alternatives: ["NAVER_SEARCH_CLIENT_ID", "NAVER_CLIENT_ID"],
  },
  {
    label: "Naver Search client secret",
    alternatives: ["NAVER_SEARCH_CLIENT_SECRET", "NAVER_CLIENT_SECRET"],
  },
];

export type RunCampaignRoundOptions = {
  campaignId: string;
  roundNumber: number;
  artifactsRoot?: string;
  concurrency?: number;
  scenarios?: CampaignScenario[];
  executor?: SingleRunExecutor;
  singleRunScript?: string;
  serverRoot?: string;
  env?: NodeJS.ProcessEnv;
  credentialRequirements?: readonly CredentialRequirement[];
  skipCredentialPreflight?: boolean;
  childTimeoutMs?: number;
  finalStats?: readonly ScenarioCampaignStats[];
  allowTimeBudgetOverride?: boolean;
  now?: () => Date;
  onCircuitBreaker?: (
    decision: Exclude<CircuitBreakerDecision, { trip: false }>,
  ) => void | Promise<void>;
};

export type CampaignRoundResult = {
  campaignId: string;
  roundId: string;
  roundNumber: number;
  manifestPath: string;
  status: CampaignRoundStatus;
  concurrency: number;
  childTimeoutMs: number;
  scenarioCount: number;
  startedThisInvocation: number;
  skippedCompleted: number;
  pendingForResume: number;
  auditRequiredRuns: number;
  aggregate: CampaignAggregate;
  circuitBreaker?: Exclude<CircuitBreakerDecision, { trip: false }>;
  haltReason?: "CAMPAIGN_TIME_BUDGET_EXHAUSTED";
};

type CampaignRoundPaths = {
  campaignDir: string;
  roundDir: string;
  runsDir: string;
  manifestPath: string;
  lockPath: string;
};

type CampaignRoundLock = {
  schemaVersion: 1;
  artifactType: "recommendation-engine-campaign-lock";
  campaignId: string;
  roundId: string;
  ownerProcessId: number;
  invocationId: string;
  createdAt: string;
};

export const runCampaignRound = async (
  options: RunCampaignRoundOptions,
): Promise<CampaignRoundResult> => {
  const campaignId = parseCampaignIdentifier(options.campaignId, "campaignId");
  const roundNumber = parseRoundNumber(options.roundNumber);
  const roundId = formatRoundId(roundNumber);
  const requestedConcurrency =
    options.concurrency === undefined ? undefined : parseConcurrency(options.concurrency);
  const childTimeoutMs = parsePositiveDuration(
    options.childTimeoutMs ?? DEFAULT_CHILD_TIMEOUT_MS,
    "childTimeoutMs",
  );
  const artifactsRoot = resolve(options.artifactsRoot ?? DEFAULT_CAMPAIGN_ARTIFACTS_ROOT);
  const now = options.now ?? (() => new Date());
  const paths = createCampaignRoundPaths(artifactsRoot, campaignId, roundId);
  const singleRunScript = resolve(options.singleRunScript ?? DEFAULT_SINGLE_RUN_SCRIPT);
  const serverRoot = resolve(options.serverRoot ?? defaultServerRoot);
  const runtimeEnv = options.env ?? (await loadCampaignEnvironment(serverRoot));
  const sourceFingerprint = await createRelevantSourceFingerprint([
    moduleDir,
    recommendationEngineSourceRoot,
  ]);
  await assertExistingManagedPathsSafe(paths);
  const existingLock = await readCampaignRoundLockIfPresent(paths.lockPath);
  if (existingLock) {
    throw new Error(
      `Campaign is locked for ${existingLock.roundId} by process ${existingLock.ownerProcessId}; stale locks require manual audit`,
    );
  }
  const preflightHistory =
    roundNumber > 1
      ? await verifyCompletedCampaignHistory({
          artifactsRoot,
          campaignId,
          throughRoundNumber: roundNumber - 1,
          suppliedStats: roundNumber === 11 ? options.finalStats : undefined,
        })
      : undefined;
  const initialConcurrency =
    preflightHistory?.nextRoundConcurrency ?? CAMPAIGN_INITIAL_CONCURRENCY;
  const verifiedFinalStats =
    roundNumber === 11 ? preflightHistory?.stats : options.finalStats;
  const scenarios = resolveRoundScenarios(
    { ...options, finalStats: verifiedFinalStats },
    roundNumber,
  );
  assertRoundScenarios(scenarios);
  const scenarioIds = scenarios.map((scenario) => scenario.id);
  const scenarioFingerprint = createScenarioFingerprint(scenarioIds);
  const preflightManifest = await validateExistingRoundBeforeMutation({
    paths,
    campaignId,
    roundId,
    roundNumber,
    scenarioFingerprint,
    sourceFingerprint,
    initialConcurrency,
    childTimeoutMs,
    minimumCreatedAt: preflightHistory?.lastRoundCreatedAt,
    scenarios,
  });
  let concurrency = getInvocationConcurrency(preflightManifest, initialConcurrency);
  assertRequestedConcurrency(requestedConcurrency, concurrency);

  await preflightCampaignInputs({
    singleRunScript,
    serverRoot,
    env: runtimeEnv,
    credentialRequirements:
      options.credentialRequirements ?? DEFAULT_CAMPAIGN_CREDENTIAL_REQUIREMENTS,
    skipCredentialPreflight: options.skipCredentialPreflight ?? false,
  });
  await prepareCampaignDirectoryForLock(paths);
  const roundLock = await acquireCampaignRoundLock(paths, campaignId, roundId, now);
  try {
  if (roundNumber > 1) {
    const lockedHistory = await verifyCompletedCampaignHistory({
      artifactsRoot,
      campaignId,
      throughRoundNumber: roundNumber - 1,
      suppliedStats: roundNumber === 11 ? options.finalStats : undefined,
    });
    if (
      roundNumber === 11 &&
      createScenarioFingerprint(
        getFinalValidationScenarios(lockedHistory.stats).map((scenario) => scenario.id),
      ) !== scenarioFingerprint
    ) {
      throw new Error("Campaign history changed while final validation acquired its lock");
    }
  }

  const lockedManifest = await validateExistingRoundBeforeMutation({
    paths,
    campaignId,
    roundId,
    roundNumber,
    scenarioFingerprint,
    sourceFingerprint,
    initialConcurrency,
    childTimeoutMs,
    minimumCreatedAt: preflightHistory?.lastRoundCreatedAt,
    scenarios,
  });
  concurrency = getInvocationConcurrency(lockedManifest, initialConcurrency);
  assertRequestedConcurrency(requestedConcurrency, concurrency);
  await prepareCampaignRoundDirectories(paths);

  const manifest = await loadOrCreateManifest({
    paths,
    campaignId,
    roundId,
    roundNumber,
    scenarioFingerprint,
    sourceFingerprint,
    initialConcurrency,
    childTimeoutMs,
    minimumCreatedAt: preflightHistory?.lastRoundCreatedAt,
    scenarios,
    now,
  });
  const scenarioById = new Map(scenarios.map((scenario) => [scenario.id, scenario]));
  await prepareRunArtifactDirectories(manifest, paths);
  if (getInvocationConcurrency(manifest, initialConcurrency) !== concurrency) {
    throw new Error(
      `Existing round concurrency violates the adaptive policy: expected ${concurrency}, received ${manifest.concurrency}`,
    );
  }
  if (manifest.status === "CIRCUIT_OPEN") {
    manifest.concurrency = concurrency;
    manifest.circuitAcknowledgedRunIds = getManifestOutcomeRunIds(manifest);
  }
  manifest.childTimeoutMs = childTimeoutMs;
  await reconcileStaleRunRecords(manifest, scenarioById, now);
  await assertManifestPhysicalPathsSafe(manifest, paths);
  const campaignStartedAt = preflightHistory?.campaignStartedAt ?? manifest.createdAt;

  const completedBeforeInvocation = Object.values(manifest.runs).filter(
    (run) => run.status === "COMPLETED",
  ).length;
  const existingAuditRequiredRuns = countAuditBlockingRuns(manifest);
  if (existingAuditRequiredRuns > 0) {
    manifest.status = "AUDIT_REQUIRED";
    delete manifest.circuitBreaker;
    delete manifest.haltReason;
    manifest.updatedAt = now().toISOString();
    validateManifestStatusInvariants(manifest);
    await assertManifestPhysicalPathsSafe(manifest, paths);
    await writeJsonAtomic(paths.manifestPath, manifest);
    const outcomes = getManifestOutcomes(manifest);
    return {
      campaignId,
      roundId,
      roundNumber,
      manifestPath: paths.manifestPath,
      status: manifest.status,
      concurrency,
      childTimeoutMs,
      scenarioCount: scenarios.length,
      startedThisInvocation: 0,
      skippedCompleted: completedBeforeInvocation,
      pendingForResume: countSafelyResumableRuns(manifest),
      auditRequiredRuns: existingAuditRequiredRuns,
      aggregate: aggregateCampaignRuns(outcomes),
    };
  }

  const hasUnfinishedRuns = Object.values(manifest.runs).some(
    (run) => run.status !== "COMPLETED",
  );
  const circuitBaselineOutcomes = getUnacknowledgedManifestOutcomes(manifest);
  const recoveredCircuitBreaker = hasUnfinishedRuns
    ? evaluateCircuitBreaker(circuitBaselineOutcomes)
    : { trip: false as const };
  if (recoveredCircuitBreaker.trip) {
    manifest.status = "CIRCUIT_OPEN";
    manifest.circuitBreaker = recoveredCircuitBreaker;
    delete manifest.haltReason;
    manifest.updatedAt = now().toISOString();
    validateManifestStatusInvariants(manifest);
    await assertManifestPhysicalPathsSafe(manifest, paths);
    await writeJsonAtomic(paths.manifestPath, manifest);
    await options.onCircuitBreaker?.(recoveredCircuitBreaker);
    const outcomes = getManifestOutcomes(manifest);
    return {
      campaignId,
      roundId,
      roundNumber,
      manifestPath: paths.manifestPath,
      status: manifest.status,
      concurrency,
      childTimeoutMs,
      scenarioCount: scenarios.length,
      startedThisInvocation: 0,
      skippedCompleted: completedBeforeInvocation,
      pendingForResume: countSafelyResumableRuns(manifest),
      auditRequiredRuns: 0,
      aggregate: aggregateCampaignRuns(outcomes),
      circuitBreaker: manifest.circuitBreaker,
    };
  }

  const initialTimeBudget = getCampaignTimeBudgetDecision({
    campaignStartedAt,
    now: now(),
    requestedChildTimeoutMs: childTimeoutMs,
  });
  if (
    hasUnfinishedRuns &&
    !options.allowTimeBudgetOverride &&
    !initialTimeBudget.canStartNewWork
  ) {
    manifest.status = "INCOMPLETE";
    manifest.haltReason = "CAMPAIGN_TIME_BUDGET_EXHAUSTED";
    delete manifest.circuitBreaker;
    manifest.updatedAt = now().toISOString();
    validateManifestStatusInvariants(manifest);
    await assertManifestPhysicalPathsSafe(manifest, paths);
    await writeJsonAtomic(paths.manifestPath, manifest);
    const outcomes = getManifestOutcomes(manifest);
    return {
      campaignId,
      roundId,
      roundNumber,
      manifestPath: paths.manifestPath,
      status: manifest.status,
      concurrency,
      childTimeoutMs,
      scenarioCount: scenarios.length,
      startedThisInvocation: 0,
      skippedCompleted: completedBeforeInvocation,
      pendingForResume: countSafelyResumableRuns(manifest),
      auditRequiredRuns: 0,
      aggregate: aggregateCampaignRuns(outcomes),
      haltReason: manifest.haltReason,
    };
  }

  manifest.status = "RUNNING";
  manifest.updatedAt = now().toISOString();
  delete manifest.circuitBreaker;
  delete manifest.haltReason;

  const executionCountBeforeInvocation = sumExecutionCounts(manifest.runs);

  let manifestWriteQueue = Promise.resolve();
  const persistManifest = (): Promise<void> => {
    manifestWriteQueue = manifestWriteQueue.then(async () => {
      manifest.updatedAt = now().toISOString();
      await writeJsonAtomic(paths.manifestPath, manifest);
    });
    return manifestWriteQueue;
  };
  await persistManifest();

  const eligibleRecords = scenarioIds
    .map((scenarioId) => manifest.runs[scenarioId])
    .filter((record): record is CampaignRunRecord =>
      Boolean(
        record &&
          (record.status === "PENDING" || record.status === "PRE_ENGINE_FAILURE"),
      ),
    );
  const executor: SingleRunExecutor = options.executor
    ? options.executor
    : async (request) => {
        const budget = getCampaignTimeBudgetDecision({
          campaignStartedAt,
          now: now(),
          requestedChildTimeoutMs: childTimeoutMs,
        });
        return await createNodeSingleRunExecutor({
          singleRunScript,
          serverRoot,
          env: runtimeEnv,
          childTimeoutMs: options.allowTimeBudgetOverride
            ? childTimeoutMs
            : budget.effectiveChildTimeoutMs,
        })(request);
      };
  const invocationOutcomes: ClassifiedCampaignRun[] = [];
  let auditRequired = false;
  let timeBudgetExhausted = false;
  const shouldStopForTimeBudget = (): boolean => {
    if (options.allowTimeBudgetOverride) return false;
    const exhausted = !getCampaignTimeBudgetDecision({
      campaignStartedAt,
      now: now(),
      requestedChildTimeoutMs: childTimeoutMs,
    }).canStartNewWork;
    if (exhausted) timeBudgetExhausted = true;
    return exhausted;
  };

  const circuitBreaker = await executeWithConcurrency({
    records: eligibleRecords,
    concurrency,
    execute: async (record) => {
      const scenario = scenarioById.get(record.scenarioId);
      if (!scenario) throw new Error(`Missing scenario definition: ${record.scenarioId}`);

      record.status = "RUNNING";
      record.executionCount += 1;
      record.startedAt = now().toISOString();
      delete record.completedAt;
      delete record.childExitCode;
      delete record.childStderr;
      delete record.report;
      delete record.outcome;
      await persistManifest();

      const execution = await executeSingleRunSafely(executor, {
        campaignId,
        roundId,
        runId: record.runId,
        scenario,
        artifactDir: record.artifactDir,
        lifecycleFile: record.lifecycleFile,
      });
      const report = await resolveChildReport(
        execution,
        campaignId,
        roundId,
        scenario.id,
        record.runId,
        record.artifactDir,
        record.lifecycleFile,
      );
      const outcome = classifyCampaignRun(report, scenario);
      invocationOutcomes.push(outcome);

      record.childExitCode = execution.exitCode;
      record.childStderr = execution.stderr;
      record.report = report;
      record.outcome = outcome;
      record.completedAt = now().toISOString();
      if (isAuditRequiredReport(report)) {
        record.status = "AUDIT_REQUIRED";
        auditRequired = true;
      } else {
        record.status = outcome.engineStarted ? "COMPLETED" : "PRE_ENGINE_FAILURE";
      }
      try {
        await assertCurrentRunPhysicalPathsSafe(manifest, paths, record);
      } catch (error) {
        const artifactReport = createLifecycleAuditReport({
          scenarioId: record.scenarioId,
          lifecycleFile: record.lifecycleFile,
          errorCode: "TEST_ARTIFACT_WRITE_FAILURE",
          message: "Child artifacts failed campaign durability validation",
          detail: toErrorMessage(error),
          processStarted: report.processStarted,
        });
        const artifactOutcome = classifyCampaignRun(artifactReport, scenario);
        invocationOutcomes.pop();
        invocationOutcomes.push(artifactOutcome);
        record.report = artifactReport;
        record.outcome = artifactOutcome;
        record.status = report.processStarted
          ? "AUDIT_REQUIRED"
          : "PRE_ENGINE_FAILURE";
        auditRequired = true;
      }
      await persistManifest();
    },
    getCircuitBreakerDecision: () =>
      evaluateCircuitBreaker([...circuitBaselineOutcomes, ...invocationOutcomes]),
    shouldStop: () => auditRequired || shouldStopForTimeBudget(),
  });

  if (auditRequired || countAuditBlockingRuns(manifest) > 0) {
    manifest.status = "AUDIT_REQUIRED";
  } else if (circuitBreaker?.trip) {
    manifest.status = "CIRCUIT_OPEN";
    manifest.circuitBreaker = circuitBreaker;
    await options.onCircuitBreaker?.(circuitBreaker);
  } else if (Object.values(manifest.runs).every((run) => run.status === "COMPLETED")) {
    manifest.status = "COMPLETED";
  } else {
    manifest.status = "INCOMPLETE";
    if (timeBudgetExhausted) {
      manifest.haltReason = "CAMPAIGN_TIME_BUDGET_EXHAUSTED";
    }
  }
  validateManifestStatusInvariants(manifest);
  await assertManifestPhysicalPathsSafe(manifest, paths);
  await persistManifest();
  await manifestWriteQueue;

  const outcomes = getManifestOutcomes(manifest);
  const pendingForResume = countSafelyResumableRuns(manifest);
  const auditRequiredRuns = countAuditBlockingRuns(manifest);

  return {
    campaignId,
    roundId,
    roundNumber,
    manifestPath: paths.manifestPath,
    status: manifest.status,
    concurrency,
    childTimeoutMs,
    scenarioCount: scenarios.length,
    startedThisInvocation: sumExecutionCounts(manifest.runs) - executionCountBeforeInvocation,
    skippedCompleted: completedBeforeInvocation,
    pendingForResume,
    auditRequiredRuns,
    aggregate: aggregateCampaignRuns(outcomes),
    circuitBreaker: manifest.circuitBreaker,
    haltReason: manifest.haltReason,
  };
  } finally {
    await releaseCampaignRoundLock(paths, roundLock);
  }
};

export const preflightCampaignRound = async ({
  paths,
  singleRunScript,
  serverRoot,
  env,
  credentialRequirements,
  skipCredentialPreflight,
}: {
  paths: CampaignRoundPaths;
  singleRunScript: string;
  serverRoot: string;
  env: NodeJS.ProcessEnv;
  credentialRequirements: readonly CredentialRequirement[];
  skipCredentialPreflight: boolean;
}): Promise<void> => {
  await preflightCampaignInputs({
    singleRunScript,
    serverRoot,
    env,
    credentialRequirements,
    skipCredentialPreflight,
  });
  await assertExistingManagedPathsSafe(paths);
};

const preflightCampaignInputs = async ({
  singleRunScript,
  serverRoot,
  env,
  credentialRequirements,
  skipCredentialPreflight,
}: Omit<Parameters<typeof preflightCampaignRound>[0], "paths">): Promise<void> => {
  assertCampaignFixturesValid();
  await assertRegularFile(singleRunScript, "Single-run CLI");
  await assertDirectory(serverRoot, "Server working directory");
  if (!skipCredentialPreflight) assertCredentials(env, credentialRequirements);
};

const prepareCampaignRoundDirectories = async (
  paths: CampaignRoundPaths,
): Promise<void> => {
  await mkdir(paths.runsDir, { recursive: true });
  await access(paths.roundDir, fsConstants.R_OK | fsConstants.W_OK);
};

export const createNodeSingleRunExecutor = ({
  singleRunScript = DEFAULT_SINGLE_RUN_SCRIPT,
  serverRoot = defaultServerRoot,
  env = process.env,
  childTimeoutMs = DEFAULT_CHILD_TIMEOUT_MS,
}: {
  singleRunScript?: string;
  serverRoot?: string;
  env?: NodeJS.ProcessEnv;
  childTimeoutMs?: number;
} = {}): SingleRunExecutor =>
  async (request) => {
    const args = [
      "--env-file-if-exists=.env",
      "--import",
      "tsx",
      resolve(singleRunScript),
      `--scenario=${request.scenario.id}`,
      `--campaign-id=${request.campaignId}`,
      `--round=${request.roundId}`,
      `--run-id=${request.runId}`,
      `--artifact-dir=${request.artifactDir}`,
      "--json",
    ];
    if (request.scenario.expected.kind === "UNSUPPORTED") {
      args.push(`--expect-error=${UNSUPPORTED_RECOMMENDATION_ERROR_CODE}`);
    }

    return await spawnSingleRun(
      process.execPath,
      args,
      resolve(serverRoot),
      env,
      parsePositiveDuration(childTimeoutMs, "childTimeoutMs"),
    );
  };

export const createCampaignId = (date = new Date()): string => {
  const timestamp = date.toISOString().replaceAll(/[-:.TZ]/g, "").slice(0, 14);
  return `place-regression-${timestamp}-${randomUUID().slice(0, 8)}`;
};

export const getCampaignTimeBudgetDecision = ({
  campaignStartedAt,
  now,
  requestedChildTimeoutMs,
}: {
  campaignStartedAt: string;
  now: Date;
  requestedChildTimeoutMs: number;
}): {
  canStartNewWork: boolean;
  elapsedMs: number;
  remainingMs: number;
  effectiveChildTimeoutMs: number;
} => {
  if (!isIsoTimestamp(campaignStartedAt) || !Number.isFinite(now.getTime())) {
    throw new Error("Campaign time budget requires valid timestamps");
  }
  const requested = parsePositiveDuration(requestedChildTimeoutMs, "requestedChildTimeoutMs");
  const elapsedMs = Math.max(0, now.getTime() - Date.parse(campaignStartedAt));
  const remainingMs = Math.max(0, CAMPAIGN_MAX_DURATION_MS - elapsedMs);
  const timeoutBudgetMs = Math.max(
    1,
    remainingMs - CAMPAIGN_CHILD_TERMINATION_GRACE_MS,
  );
  return {
    canStartNewWork: elapsedMs < CAMPAIGN_NEW_WORK_CUTOFF_MS && remainingMs > 0,
    elapsedMs,
    remainingMs,
    effectiveChildTimeoutMs: Math.max(1, Math.min(requested, timeoutBudgetMs)),
  };
};

export const createRelevantSourceFingerprint = async (
  roots: readonly string[],
): Promise<string> => {
  const files = [
    ...new Set((await Promise.all(roots.map(collectTypeScriptSourceFiles))).flat()),
  ].sort(compareStrings);
  if (files.length === 0) throw new Error("No TypeScript source files found to fingerprint");

  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(relative(repositoryRoot, file));
    hash.update("\0");
    hash.update(await readFile(file));
    hash.update("\0");
  }
  return hash.digest("hex");
};

export const runCampaignFinalValidation = async (
  options: Omit<RunCampaignRoundOptions, "roundNumber" | "finalStats"> & {
    stats?: readonly ScenarioCampaignStats[];
  },
): Promise<CampaignRoundResult> => {
  const { stats, ...roundOptions } = options;
  return await runCampaignRound({
    ...roundOptions,
    roundNumber: 11,
    finalStats: stats,
  });
};

const resolveRoundScenarios = (
  options: RunCampaignRoundOptions,
  roundNumber: number,
): CampaignScenario[] => {
  if (options.scenarios) return options.scenarios;
  if (roundNumber <= 10) return getRoundScenarios(roundNumber);
  if (!options.finalStats) {
    throw new Error("Final validation requires campaign scenario stats");
  }
  assertScenarioCampaignStats(options.finalStats);
  return getFinalValidationScenarios(options.finalStats);
};

const verifyCompletedCampaignHistory = async ({
  artifactsRoot,
  campaignId,
  throughRoundNumber,
  suppliedStats,
}: {
  artifactsRoot: string;
  campaignId: string;
  throughRoundNumber: number;
  suppliedStats: readonly ScenarioCampaignStats[] | undefined;
}): Promise<{
  stats: ScenarioCampaignStats[];
  outcomes: ClassifiedCampaignRun[];
  campaignStartedAt: string;
  nextRoundConcurrency: number;
  lastRoundCreatedAt: string;
}> => {
  if (
    !Number.isInteger(throughRoundNumber) ||
    throughRoundNumber < 1 ||
    throughRoundNumber > 10
  ) {
    throw new Error(`Campaign history range is invalid: ${throughRoundNumber}`);
  }
  const outcomes: ClassifiedCampaignRun[] = [];
  let previousCreatedAt: string | undefined;
  let campaignStartedAt: string | undefined;
  let expectedRoundConcurrency = CAMPAIGN_INITIAL_CONCURRENCY;

  for (let roundNumber = 1; roundNumber <= throughRoundNumber; roundNumber += 1) {
    const roundId = formatRoundId(roundNumber);
    const paths = createCampaignRoundPaths(artifactsRoot, campaignId, roundId);
    await assertExistingManagedPathsSafe(paths);
    const scenarios = getRoundScenarios(roundNumber);
    const manifest = await readManifestIfPresent(paths, {
      campaignId,
      roundId,
      roundNumber,
      scenarioFingerprint: createScenarioFingerprint(
        scenarios.map((scenario) => scenario.id),
      ),
      scenarios,
    });
    if (!manifest) {
      throw new Error(`Campaign round requires completed predecessor manifest ${roundId}`);
    }
    if (manifest.status !== "COMPLETED") {
      throw new Error(`Campaign round requires ${roundId} to be COMPLETED`);
    }
    if (manifest.initialConcurrency !== expectedRoundConcurrency) {
      throw new Error(
        `Campaign history initial concurrency is invalid in ${roundId}: expected ${expectedRoundConcurrency}, received ${manifest.initialConcurrency}`,
      );
    }
    if (previousCreatedAt && manifest.createdAt < previousCreatedAt) {
      throw new Error("Campaign round creation timestamps are not monotonic");
    }
    campaignStartedAt ??= manifest.createdAt;
    previousCreatedAt = manifest.createdAt;

    const roundOutcomes = getManifestOutcomes(manifest);
    if (
      roundOutcomes.length !== CAMPAIGN_ROUND_SIZE ||
      roundOutcomes.some((outcome) => !outcome.engineStarted)
    ) {
      throw new Error(
        `Campaign history requires exactly 10 process-started outcomes in ${roundId}`,
      );
    }
    expectedRoundConcurrency = getNextRoundInitialConcurrency(manifest);
    outcomes.push(...roundOutcomes);
  }

  if (outcomes.length !== throughRoundNumber * CAMPAIGN_ROUND_SIZE) {
    throw new Error(
      `Campaign history requires exactly ${throughRoundNumber * CAMPAIGN_ROUND_SIZE} prior engine calls`,
    );
  }
  const derived = aggregateScenarioCampaignStats(outcomes);
  if (!campaignStartedAt || !previousCreatedAt) {
    throw new Error("Campaign history has no start timestamp");
  }
  if (!suppliedStats) {
    return {
      stats: derived,
      outcomes,
      campaignStartedAt,
      nextRoundConcurrency: expectedRoundConcurrency,
      lastRoundCreatedAt: previousCreatedAt,
    };
  }

  assertScenarioCampaignStats(suppliedStats);
  const suppliedIds = suppliedStats.map((item) => item.scenarioId);
  if (new Set(suppliedIds).size !== suppliedIds.length) {
    throw new Error("Final-validation stats contain duplicate scenario IDs");
  }
  const derivedById = new Map(derived.map((item) => [item.scenarioId, item]));
  const suppliedById = new Map(suppliedStats.map((item) => [item.scenarioId, item]));
  if (suppliedById.size !== derivedById.size) {
    throw new Error("Final-validation stats must contain every campaign scenario exactly once");
  }
  for (const scenarioId of derivedById.keys()) {
    if (!suppliedById.has(scenarioId)) {
      throw new Error(`Final-validation stats are missing ${scenarioId}`);
    }
  }
  for (const item of suppliedStats) {
    const actual = derivedById.get(item.scenarioId);
    if (
      !actual ||
      actual.totalRuns !== item.totalRuns ||
      actual.failedRuns !== item.failedRuns
    ) {
      throw new Error(
        `Final-validation stats do not match campaign manifests for ${item.scenarioId}`,
      );
    }
  }
  return {
    stats: derived.map((item) => ({
      ...item,
      manualQualityScore:
        suppliedById.get(item.scenarioId)?.manualQualityScore ?? item.manualQualityScore,
    })),
    outcomes,
    campaignStartedAt,
    nextRoundConcurrency: expectedRoundConcurrency,
    lastRoundCreatedAt: previousCreatedAt,
  };
};

const collectTypeScriptSourceFiles = async (path: string): Promise<string[]> => {
  const info = await stat(path);
  if (info.isFile()) return extname(path) === ".ts" ? [resolve(path)] : [];
  if (!info.isDirectory()) return [];

  const entries = await readdir(path, { withFileTypes: true });
  const nested = await Promise.all(
    entries
      .filter(
        (entry) =>
          !entry.isSymbolicLink() &&
          entry.name !== "node_modules" &&
          entry.name !== ".log",
      )
      .map((entry) => collectTypeScriptSourceFiles(join(path, entry.name))),
  );
  return nested.flat();
};

const loadOrCreateManifest = async ({
  paths,
  campaignId,
  roundId,
  roundNumber,
  scenarioFingerprint,
  sourceFingerprint,
  initialConcurrency,
  childTimeoutMs,
  minimumCreatedAt,
  scenarios,
  now,
}: {
  paths: CampaignRoundPaths;
  campaignId: string;
  roundId: string;
  roundNumber: number;
  scenarioFingerprint: string;
  sourceFingerprint: string;
  initialConcurrency: number;
  childTimeoutMs: number;
  minimumCreatedAt?: string;
  scenarios: CampaignScenario[];
  now: () => Date;
}): Promise<CampaignRoundManifest> => {
  const existing = await readManifestIfPresent(paths, {
    campaignId,
    roundId,
    roundNumber,
    scenarioFingerprint,
    sourceFingerprint,
    initialConcurrency,
    childTimeoutMs,
    minimumCreatedAt,
    scenarios,
  });
  if (existing) {
    return existing;
  }

  const createdAt = now().toISOString();
  if (minimumCreatedAt && createdAt < minimumCreatedAt) {
    throw new Error("Campaign round creation time predates its predecessor");
  }
  const runs = Object.fromEntries(
    scenarios.map((scenario) => {
      const runId = createRunId(campaignId, roundNumber, scenario.id);
      const artifactDir = join(paths.runsDir, runId);
      return [
        scenario.id,
        {
          runId,
          scenarioId: scenario.id,
          artifactDir,
          lifecycleFile: join(artifactDir, `${runId}.lifecycle.json`),
          status: "PENDING",
          executionCount: 0,
        } satisfies CampaignRunRecord,
      ];
    }),
  );

  const manifest: CampaignRoundManifest = {
    schemaVersion: 1,
    artifactType: "recommendation-engine-campaign-round",
    campaignId,
    roundId,
    roundNumber,
    scenarioFingerprint,
    sourceFingerprint,
    initialConcurrency,
    concurrency: initialConcurrency,
    circuitAcknowledgedRunIds: [],
    childTimeoutMs,
    status: "INCOMPLETE",
    createdAt,
    updatedAt: createdAt,
    scenarioIds: scenarios.map((scenario) => scenario.id),
    runs,
  };
  await writeJsonAtomic(paths.manifestPath, manifest);
  return manifest;
};

const executeSingleRunSafely = async (
  executor: SingleRunExecutor,
  request: SingleRunExecutionRequest,
): Promise<SingleRunChildExecution> => {
  try {
    return await executor(request);
  } catch (error) {
    return {
      exitCode: null,
      stdout: "",
      stderr: `CHILD_SPAWN_FAILURE: ${toErrorMessage(error)}`,
    };
  }
};

const resolveChildReport = async (
  execution: SingleRunChildExecution,
  campaignId: string,
  roundId: string,
  scenarioId: TestScenarioName,
  runId: string,
  artifactDir: string,
  lifecycleFile: string,
): Promise<SingleRunPublicReport> => {
  const lifecycleExpectation: LifecycleExpectation = {
    campaignId,
    roundId,
    runId,
    scenarioId,
    artifactDir,
    lifecycleFile,
  };
  try {
    const report = parseSingleRunJson(execution.stdout).run;
    if (report.scenario !== scenarioId) {
      throw new Error(
        `Single-run report scenario mismatch: expected ${scenarioId}, received ${report.scenario}`,
      );
    }
    const identityMismatch = validateChildReportIdentity(report, lifecycleExpectation);
    if (identityMismatch) return identityMismatch;
    let lifecycle: SingleRunLifecycle | undefined;
    try {
      lifecycle = await readLifecycleIfPresent(lifecycleFile, lifecycleExpectation);
    } catch (lifecycleError) {
      return createLifecycleAuditReport({
        scenarioId,
        lifecycleFile,
        errorCode: "CAMPAIGN_STALE_LIFECYCLE_INVALID",
        message: "Lifecycle marker could not be verified",
        detail: toErrorMessage(lifecycleError),
        processStarted: report.processStarted,
      });
    }
    if (lifecycle) {
      const mismatch = validateLifecycleAgainstReport({
        lifecycle,
        report,
        scenarioId,
        runId,
        lifecycleFile,
      });
      if (mismatch) return mismatch;
    } else if (report.processStarted) {
      return createLifecycleAuditReport({
        scenarioId,
        lifecycleFile,
        errorCode: "CAMPAIGN_STALE_LIFECYCLE_INVALID",
        message: "Process-started child report is missing its lifecycle marker",
        detail: "No lifecycle file was present for a counted child report",
      });
    }
    return reconcileChildExit(execution, report, lifecycleFile);
  } catch (error) {
    let lifecycle: SingleRunLifecycle | undefined;
    try {
      lifecycle = await readLifecycleIfPresent(lifecycleFile, lifecycleExpectation);
    } catch (lifecycleError) {
      return {
        status: "FAIL",
        scenario: scenarioId,
        processStarted: true,
        engineStatus: "ERROR",
        errorCode: "CAMPAIGN_STALE_LIFECYCLE_INVALID",
        engineErrorMessage: "Lifecycle marker could not be verified",
        recommendationCount: 0,
        selectedItemIds: [],
        lifecycleFile,
        error: toErrorMessage(lifecycleError),
      };
    }
    if (lifecycle && (lifecycle.runId !== runId || lifecycle.scenario !== scenarioId)) {
      return createLifecycleAuditReport({
        scenarioId,
        lifecycleFile,
        errorCode: "CAMPAIGN_STALE_LIFECYCLE_INVALID",
        message: "Lifecycle identity does not match the campaign run",
        detail: "Lifecycle marker identity mismatch",
      });
    }
    if (lifecycle?.state === "COMPLETED" && lifecycle.publicRun) {
      const recovered = parseLifecyclePublicRun(lifecycle.publicRun, scenarioId);
      const mismatch = validateLifecycleAgainstReport({
        lifecycle,
        report: recovered,
        scenarioId,
        runId,
        lifecycleFile,
      });
      if (mismatch) return mismatch;
      return reconcileChildExit(execution, { ...recovered, lifecycleFile }, lifecycleFile);
    }
    if (lifecycle?.state === "ENGINE_PROCESS_STARTED") {
      return createInterruptedEngineReport({
        scenarioId,
        lifecycleFile,
        timedOut: execution.timedOut ?? false,
        detail: `${toErrorMessage(error)}; ${execution.stderr}`.slice(
          -maximumCapturedOutputCharacters,
        ),
      });
    }
    return {
      status: "FAIL",
      scenario: scenarioId,
      processStarted: false,
      engineStatus: "ERROR",
      errorCode: "CAMPAIGN_CHILD_PROTOCOL_FAILURE",
      recommendationCount: 0,
      selectedItemIds: [],
      lifecycleFile,
      error: `${toErrorMessage(error)}; childExitCode=${String(execution.exitCode)}`,
    };
  }
};

const validateChildReportIdentity = (
  report: SingleRunPublicReport,
  expected: LifecycleExpectation,
): SingleRunPublicReport | undefined => {
  if (
    report.campaignId !== expected.campaignId ||
    report.roundId !== expected.roundId ||
    report.runId !== expected.runId
  ) {
    if (!report.processStarted) {
      return {
        ...report,
        status: "FAIL",
        errorCode: "CAMPAIGN_CHILD_PROTOCOL_FAILURE",
        error: "Pre-engine child report identity does not match the requested run",
      };
    }
    return createLifecycleAuditReport({
      scenarioId: expected.scenarioId,
      lifecycleFile: expected.lifecycleFile,
      errorCode: "CAMPAIGN_CHILD_PROTOCOL_FAILURE",
      message: "Child report identity does not match the requested run",
      detail: "campaignId, roundId, runId, or lifecycleFile mismatch",
    });
  }
  if (!report.processStarted) return undefined;
  if (report.lifecycleFile !== expected.lifecycleFile) {
    return createLifecycleAuditReport({
      scenarioId: expected.scenarioId,
      lifecycleFile: expected.lifecycleFile,
      errorCode: "CAMPAIGN_CHILD_PROTOCOL_FAILURE",
      message: "Child report lifecycle path does not match the requested run",
      detail: "lifecycleFile mismatch",
    });
  }
  for (const [key, path] of [
    ["resultFile", report.resultFile],
    ["logFile", report.logFile],
    ["eventsFile", report.eventsFile],
  ] as const) {
    if (
      path === undefined ||
      !isAbsolute(path) ||
      dirname(resolve(path)) !== resolve(expected.artifactDir)
    ) {
      return createLifecycleAuditReport({
        scenarioId: expected.scenarioId,
        lifecycleFile: expected.lifecycleFile,
        errorCode: "CAMPAIGN_CHILD_PROTOCOL_FAILURE",
        message: "Child report artifact paths do not match the requested run",
        detail: `${key} is missing or outside the run artifact directory`,
      });
    }
  }
  return undefined;
};

const validateLifecycleAgainstReport = ({
  lifecycle,
  report,
  scenarioId,
  runId,
  lifecycleFile,
}: {
  lifecycle: SingleRunLifecycle;
  report: SingleRunPublicReport;
  scenarioId: TestScenarioName;
  runId: string;
  lifecycleFile: string;
}): SingleRunPublicReport | undefined => {
  if (
    lifecycle.runId !== runId ||
    lifecycle.scenario !== scenarioId ||
    resolve(lifecycle.lifecycleFile) !== resolve(lifecycleFile)
  ) {
    return createLifecycleAuditReport({
      scenarioId,
      lifecycleFile,
      errorCode: "CAMPAIGN_STALE_LIFECYCLE_INVALID",
      message: "Lifecycle identity does not match the campaign run",
      detail: "Lifecycle marker identity mismatch",
    });
  }
  if (!lifecycle.processStarted && !report.processStarted) {
    return undefined;
  }
  if (
    lifecycle.state !== "COMPLETED" ||
    !lifecycle.publicRun ||
    lifecycle.processStarted !== report.processStarted
  ) {
    return createLifecycleAuditReport({
      scenarioId,
      lifecycleFile,
      errorCode: "CAMPAIGN_LIFECYCLE_REPORT_MISMATCH",
      message: "Lifecycle state conflicts with the child report",
      detail: `marker=${lifecycle.state}/${String(lifecycle.processStarted)} report=${report.status}/${String(report.processStarted)}`,
    });
  }
  const markerReport = parseLifecyclePublicRun(lifecycle.publicRun, scenarioId);
  if (!jsonEqual(markerReport, report)) {
    return createLifecycleAuditReport({
      scenarioId,
      lifecycleFile,
      errorCode: "CAMPAIGN_LIFECYCLE_REPORT_MISMATCH",
      message: "Lifecycle public report conflicts with stdout",
      detail: "Completed lifecycle and stdout reports differ",
    });
  }
  return undefined;
};

const reconcileChildExit = (
  execution: SingleRunChildExecution,
  report: SingleRunPublicReport,
  lifecycleFile: string,
): SingleRunPublicReport => {
  if (execution.timedOut) {
    if (!report.processStarted) return report;
    return createInterruptedEngineReport({
      scenarioId: report.scenario,
      lifecycleFile,
      timedOut: true,
      detail: "Child timeout elapsed even though a terminal report was recovered",
    });
  }
  const exitMatchesEnvelope =
    (report.status === "PASS" && execution.exitCode === 0) ||
    (report.status === "FAIL" && execution.exitCode !== null && execution.exitCode !== 0);
  if (exitMatchesEnvelope) return report;
  if (!report.processStarted) {
    return {
      ...report,
      status: "FAIL",
      errorCode: report.errorCode ?? "CAMPAIGN_CHILD_PROTOCOL_FAILURE",
      error: `Pre-engine child exit code ${String(execution.exitCode)} conflicts with ${report.status} envelope`,
    };
  }
  return createLifecycleAuditReport({
    scenarioId: report.scenario,
    lifecycleFile,
    errorCode: "CAMPAIGN_CHILD_EXIT_MISMATCH",
    message: "Child exit code conflicts with its report envelope",
    detail: `Child exit code ${String(execution.exitCode)} conflicts with ${report.status} envelope`,
  });
};

const createLifecycleAuditReport = ({
  scenarioId,
  lifecycleFile,
  errorCode,
  message,
  detail,
  processStarted = true,
}: {
  scenarioId: TestScenarioName;
  lifecycleFile: string;
  errorCode: string;
  message: string;
  detail: string;
  processStarted?: boolean;
}): SingleRunPublicReport => ({
  status: "FAIL",
  scenario: scenarioId,
  processStarted,
  engineStatus: "ERROR",
  errorCode,
  engineErrorMessage: message,
  recommendationCount: 0,
  selectedItemIds: [],
  lifecycleFile,
  error: detail,
});

const parseLifecyclePublicRun = (
  publicRun: SingleRunPublicReport,
  scenarioId: TestScenarioName,
): SingleRunPublicReport => {
  const envelope = parseSingleRunJson(
    JSON.stringify({ status: publicRun.status, selected: [], run: publicRun }),
  );
  if (envelope.run.scenario !== scenarioId) {
    throw new Error(
      `Lifecycle scenario mismatch: expected ${scenarioId}, received ${envelope.run.scenario}`,
    );
  }
  return envelope.run;
};

const createInterruptedEngineReport = ({
  scenarioId,
  lifecycleFile,
  timedOut,
  detail,
}: {
  scenarioId: TestScenarioName;
  lifecycleFile: string;
  timedOut: boolean;
  detail: string;
}): SingleRunPublicReport => ({
  status: "FAIL",
  scenario: scenarioId,
  processStarted: true,
  engineStatus: "ERROR",
  errorCode: timedOut
    ? "CAMPAIGN_CHILD_TIMEOUT_AFTER_ENGINE_START"
    : "CAMPAIGN_CHILD_CRASH_AFTER_ENGINE_START",
  engineErrorMessage: timedOut
    ? "Single-run child timed out after the engine process started"
    : "Single-run child stopped after the engine process started",
  recommendationCount: 0,
  selectedItemIds: [],
  lifecycleFile,
  error: detail,
});

const isAuditRequiredReport = (report: SingleRunPublicReport): boolean =>
  report.processStarted &&
  (report.errorCode === "CAMPAIGN_CHILD_TIMEOUT_AFTER_ENGINE_START" ||
    report.errorCode === "CAMPAIGN_CHILD_CRASH_AFTER_ENGINE_START" ||
    report.errorCode === "CAMPAIGN_STALE_LIFECYCLE_INVALID" ||
    report.errorCode === "CAMPAIGN_LIFECYCLE_REPORT_MISMATCH" ||
    report.errorCode === "CAMPAIGN_CHILD_EXIT_MISMATCH" ||
    report.errorCode === "CAMPAIGN_CHILD_PROTOCOL_FAILURE" ||
    report.errorCode === "TEST_ARTIFACT_WRITE_FAILURE");

const executeWithConcurrency = async ({
  records,
  concurrency,
  execute,
  getCircuitBreakerDecision,
  shouldStop,
}: {
  records: CampaignRunRecord[];
  concurrency: number;
  execute: (record: CampaignRunRecord) => Promise<void>;
  getCircuitBreakerDecision: () => CircuitBreakerDecision;
  shouldStop: () => boolean;
}): Promise<Exclude<CircuitBreakerDecision, { trip: false }> | undefined> => {
  let nextIndex = 0;
  let activeCount = 0;
  let breaker: Exclude<CircuitBreakerDecision, { trip: false }> | undefined;

  let fatalError: unknown;

  await new Promise<void>((resolvePromise, rejectPromise) => {
    const settle = (): void => {
      if (activeCount !== 0) return;
      if (fatalError) rejectPromise(toError(fatalError));
      else resolvePromise();
    };

    const schedule = (): void => {
      while (
        !breaker &&
        !fatalError &&
        !shouldStop() &&
        activeCount < concurrency &&
        nextIndex < records.length
      ) {
        const record = records[nextIndex];
        nextIndex += 1;
        if (!record) continue;
        activeCount += 1;
        void execute(record)
          .catch((error: unknown) => {
            fatalError = error;
          })
          .finally(() => {
            activeCount -= 1;
            const decision = getCircuitBreakerDecision();
            if (decision.trip) breaker = decision;
            if (
              (breaker || fatalError || shouldStop() || nextIndex >= records.length) &&
              activeCount === 0
            ) {
              settle();
              return;
            }
            schedule();
          });
      }

      if (
        (breaker || fatalError || shouldStop() || nextIndex >= records.length) &&
        activeCount === 0
      ) {
        settle();
      }
    };
    schedule();
  });

  return breaker;
};

const spawnSingleRun = async (
  executable: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  timeoutMs: number,
): Promise<SingleRunChildExecution> =>
  await new Promise<SingleRunChildExecution>((resolvePromise, reject) => {
    const child = spawn(executable, args, {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let forceKillTimer: NodeJS.Timeout | undefined;
    const timeout = setTimeout(() => {
      timedOut = true;
      stderr = appendCapturedOutput(
        stderr,
        `\nCAMPAIGN_CHILD_TIMEOUT after ${timeoutMs}ms`,
      );
      child.kill("SIGTERM");
      forceKillTimer = setTimeout(
        () => child.kill("SIGKILL"),
        CAMPAIGN_CHILD_TERMINATION_GRACE_MS,
      );
      forceKillTimer.unref();
    }, timeoutMs);
    timeout.unref();
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout = appendCapturedOutput(stdout, chunk);
    });
    child.stderr.on("data", (chunk: string) => {
      stderr = appendCapturedOutput(stderr, chunk);
    });
    child.once("error", (error) => {
      clearTimeout(timeout);
      if (forceKillTimer) clearTimeout(forceKillTimer);
      reject(error);
    });
    child.once("close", (exitCode) => {
      clearTimeout(timeout);
      if (forceKillTimer) clearTimeout(forceKillTimer);
      resolvePromise({ exitCode, stdout, stderr, timedOut });
    });
  });

const appendCapturedOutput = (current: string, chunk: string): string =>
  `${current}${chunk}`.slice(-maximumCapturedOutputCharacters);

const createCampaignRoundPaths = (
  artifactsRoot: string,
  campaignId: string,
  roundId: string,
): CampaignRoundPaths => {
  const campaignDir = join(artifactsRoot, campaignId);
  const roundDir = join(campaignDir, roundId);
  return {
    campaignDir,
    roundDir,
    runsDir: join(roundDir, "runs"),
    manifestPath: join(roundDir, manifestFileName),
    lockPath: join(campaignDir, "runner.lock.json"),
  };
};

const createRunId = (
  campaignId: string,
  roundNumber: number,
  scenarioId: TestScenarioName,
): string => `${campaignId}.r${String(roundNumber).padStart(2, "0")}.${scenarioId}`;

const sumExecutionCounts = (runs: Record<string, CampaignRunRecord>): number =>
  Object.values(runs).reduce((total, run) => total + run.executionCount, 0);

const formatRoundId = (roundNumber: number): string =>
  roundNumber === 11 ? "final" : `round-${String(roundNumber).padStart(2, "0")}`;

const parseCampaignIdentifier = (value: string, label: string): string => {
  if (!identifierPattern.test(value)) {
    throw new Error(
      `${label} must be a filesystem-safe identifier containing at most 48 characters`,
    );
  }
  return value;
};

const parseRoundNumber = (value: number): number => {
  if (!Number.isInteger(value) || value < 1 || value > 11) {
    throw new Error(`Round number must be an integer from 1 to 11: ${value}`);
  }
  return value;
};

const parseConcurrency = (value: number): number => {
  if (!Number.isInteger(value) || value < 1 || value > CAMPAIGN_MAX_CONCURRENCY) {
    throw new Error(`Concurrency must be an integer from 1 to ${CAMPAIGN_MAX_CONCURRENCY}`);
  }
  return value;
};

const parsePositiveDuration = (value: number, label: string): number => {
  if (!Number.isInteger(value) || value <= 0 || value > 24 * 60 * 60 * 1_000) {
    throw new Error(`${label} must be a positive integer no greater than 24 hours`);
  }
  return value;
};

const countSafelyResumableRuns = (manifest: CampaignRoundManifest): number =>
  Object.values(manifest.runs).filter(
    (run) =>
      run.status === "PENDING" ||
      (run.status === "PRE_ENGINE_FAILURE" && !isPreEngineArtifactAuditRun(run)),
  ).length;

const countAuditBlockingRuns = (manifest: CampaignRoundManifest): number =>
  Object.values(manifest.runs).filter(
    (run) => run.status === "AUDIT_REQUIRED" || isPreEngineArtifactAuditRun(run),
  ).length;

const isPreEngineArtifactAuditRun = (record: CampaignRunRecord): boolean =>
  record.status === "PRE_ENGINE_FAILURE" &&
  record.report?.processStarted === false &&
  record.report.errorCode === "TEST_ARTIFACT_WRITE_FAILURE";

const getInvocationConcurrency = (
  manifest: CampaignRoundManifest | undefined,
  initialConcurrency: number,
): number => {
  if (!manifest) return initialConcurrency;
  if (manifest.initialConcurrency !== initialConcurrency) {
    throw new Error(
      `Campaign initial concurrency violates the adaptive policy: expected ${initialConcurrency}, received ${manifest.initialConcurrency}`,
    );
  }
  return manifest.status === "CIRCUIT_OPEN"
    ? getNextCampaignConcurrency(manifest.concurrency, 1)
    : manifest.concurrency;
};

const assertRequestedConcurrency = (
  requestedConcurrency: number | undefined,
  expectedConcurrency: number,
): void => {
  if (
    requestedConcurrency !== undefined &&
    requestedConcurrency !== expectedConcurrency
  ) {
    throw new Error(
      `Campaign concurrency must follow the adaptive policy: expected ${expectedConcurrency}, received ${requestedConcurrency}`,
    );
  }
};

const getManifestOutcomeRunIds = (manifest: CampaignRoundManifest): string[] =>
  Object.values(manifest.runs)
    .filter((record) => record.outcome !== undefined)
    .map((record) => record.runId);

const getUnacknowledgedManifestOutcomes = (
  manifest: CampaignRoundManifest,
): ClassifiedCampaignRun[] => {
  const acknowledged = new Set(manifest.circuitAcknowledgedRunIds);
  return Object.values(manifest.runs)
    .filter((record) => !acknowledged.has(record.runId))
    .map((record) => record.outcome)
    .filter((outcome): outcome is ClassifiedCampaignRun => Boolean(outcome));
};

const getNextRoundInitialConcurrency = (
  manifest: CampaignRoundManifest,
): number => {
  const unacknowledgedInfrastructureAffectedRuns = aggregateCampaignRuns(
    getUnacknowledgedManifestOutcomes(manifest),
  ).infrastructureAffectedRuns;
  if (
    manifest.circuitAcknowledgedRunIds.length > 0 &&
    unacknowledgedInfrastructureAffectedRuns === 0
  ) {
    return manifest.concurrency;
  }
  return getNextCampaignConcurrency(
    manifest.concurrency,
    unacknowledgedInfrastructureAffectedRuns,
  );
};

const getManifestOutcomes = (
  manifest: CampaignRoundManifest,
): ClassifiedCampaignRun[] =>
  Object.values(manifest.runs)
    .map((run) => run.outcome)
    .filter((outcome): outcome is ClassifiedCampaignRun => Boolean(outcome));

const assertRoundScenarios = (scenarios: CampaignScenario[]): void => {
  if (scenarios.length !== CAMPAIGN_ROUND_SIZE) {
    throw new Error(
      `A campaign round must contain exactly ${CAMPAIGN_ROUND_SIZE} scenarios`,
    );
  }
  const ids = new Set(scenarios.map((scenario) => scenario.id));
  if (ids.size !== scenarios.length) throw new Error("Campaign round scenarios must be unique");
};

const assertScenarioCampaignStats = (
  stats: readonly ScenarioCampaignStats[],
): void => {
  for (const item of stats) {
    if (
      !Number.isInteger(item.totalRuns) ||
      item.totalRuns < 0 ||
      !Number.isInteger(item.failedRuns) ||
      item.failedRuns < 0 ||
      item.failedRuns > item.totalRuns ||
      (item.manualQualityScore !== undefined &&
        (!Number.isFinite(item.manualQualityScore) || item.manualQualityScore < 0))
    ) {
      throw new Error(`Invalid final-validation stats for ${item.scenarioId}`);
    }
  }
};

const assertCredentials = (
  env: NodeJS.ProcessEnv,
  requirements: readonly CredentialRequirement[],
): void => {
  const missing = requirements
    .filter((requirement) =>
      requirement.alternatives.every((name) => !env[name]?.trim()),
    )
    .map(
      (requirement) =>
        `${requirement.label} (${requirement.alternatives.join(" or ")})`,
    );
  if (missing.length > 0) {
    throw new Error(`Campaign credential preflight failed: ${missing.join(", ")}`);
  }
};

const loadCampaignEnvironment = async (serverRoot: string): Promise<NodeJS.ProcessEnv> => {
  const envFile = join(serverRoot, ".env");
  try {
    const fromFile = parseEnv(await readFile(envFile, "utf8"));
    return { ...fromFile, ...process.env };
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return { ...process.env };
    throw new Error(`Could not load campaign environment from ${envFile}: ${toErrorMessage(error)}`);
  }
};

const assertRegularFile = async (path: string, label: string): Promise<void> => {
  const info = await stat(path);
  if (!info.isFile()) throw new Error(`${label} is not a regular file: ${path}`);
  await access(path, fsConstants.R_OK);
};

const assertDirectory = async (path: string, label: string): Promise<void> => {
  const info = await stat(path);
  if (!info.isDirectory()) throw new Error(`${label} is not a directory: ${path}`);
  await access(path, fsConstants.R_OK | fsConstants.X_OK);
};

const validateExistingRoundBeforeMutation = async ({
  paths,
  campaignId,
  roundId,
  roundNumber,
  scenarioFingerprint,
  sourceFingerprint,
  initialConcurrency,
  childTimeoutMs,
  minimumCreatedAt,
  scenarios,
}: ManifestValidationExpectation & {
  paths: CampaignRoundPaths;
}): Promise<CampaignRoundManifest | undefined> => {
  await assertExistingManagedPathsSafe(paths);
  return await readManifestIfPresent(paths, {
    campaignId,
    roundId,
    roundNumber,
    scenarioFingerprint,
    sourceFingerprint,
    initialConcurrency,
    childTimeoutMs,
    minimumCreatedAt,
    scenarios,
  });
};

const prepareCampaignDirectoryForLock = async (
  paths: CampaignRoundPaths,
): Promise<void> => {
  await assertExistingManagedPathsSafe(paths);
  const artifactsRoot = dirname(paths.campaignDir);
  const rootInfo = await lstatIfPresent(artifactsRoot);
  if (rootInfo && (rootInfo.isSymbolicLink() || !rootInfo.isDirectory())) {
    throw new Error(`Campaign artifacts root must be a non-symlink directory: ${artifactsRoot}`);
  }
  if (!rootInfo) await mkdir(artifactsRoot, { recursive: true });
  const verifiedRoot = await lstat(artifactsRoot);
  if (verifiedRoot.isSymbolicLink() || !verifiedRoot.isDirectory()) {
    throw new Error(`Campaign artifacts root must be a non-symlink directory: ${artifactsRoot}`);
  }
  await mkdir(paths.campaignDir).catch((error: unknown) => {
    if (!isNodeError(error) || error.code !== "EEXIST") throw error;
  });
  const campaignInfo = await lstat(paths.campaignDir);
  if (campaignInfo.isSymbolicLink() || !campaignInfo.isDirectory()) {
    throw new Error(`Managed campaign directory must not be a symlink: ${paths.campaignDir}`);
  }
};

const assertExistingManagedPathsSafe = async (paths: CampaignRoundPaths): Promise<void> => {
  for (const directory of [paths.campaignDir, paths.roundDir, paths.runsDir]) {
    const info = await lstatIfPresent(directory);
    if (info && (info.isSymbolicLink() || !info.isDirectory())) {
      throw new Error(`Managed campaign directory must not be a symlink: ${directory}`);
    }
  }
  for (const file of [paths.manifestPath, paths.lockPath]) {
    const info = await lstatIfPresent(file);
    if (info && (info.isSymbolicLink() || !info.isFile())) {
      throw new Error(`Managed campaign file must be a regular non-symlink file: ${file}`);
    }
  }
};

const assertManifestPhysicalPathsSafe = async (
  manifest: CampaignRoundManifest,
  paths: CampaignRoundPaths,
): Promise<void> => {
  await assertExistingManagedPathsSafe(paths);
  const physicalRunsDir = await realpath(paths.runsDir);
  for (const record of Object.values(manifest.runs)) {
    await assertRunRecordPhysicalPathsSafe(manifest, record, physicalRunsDir);
  }
};

const assertCurrentRunPhysicalPathsSafe = async (
  manifest: CampaignRoundManifest,
  paths: CampaignRoundPaths,
  record: CampaignRunRecord,
): Promise<void> => {
  await assertExistingManagedPathsSafe(paths);
  const physicalRunsDir = await realpath(paths.runsDir);
  await assertRunRecordPhysicalPathsSafe(manifest, record, physicalRunsDir);
};

const assertRunRecordPhysicalPathsSafe = async (
  manifest: CampaignRoundManifest,
  record: CampaignRunRecord,
  physicalRunsDir: string,
): Promise<void> => {
  const artifactInfo = await lstatIfPresent(record.artifactDir);
  if (!artifactInfo) {
    if (record.status === "COMPLETED" || record.status === "AUDIT_REQUIRED") {
      throw new Error(`Terminal run artifact directory is missing: ${record.artifactDir}`);
    }
    return;
  }
  if (artifactInfo.isSymbolicLink() || !artifactInfo.isDirectory()) {
    throw new Error(`Run artifact directory must not be a symlink: ${record.artifactDir}`);
  }
  const physicalArtifactDir = await realpath(record.artifactDir);
  if (
    dirname(physicalArtifactDir) !== physicalRunsDir ||
    !isPhysicalChildPath(physicalRunsDir, physicalArtifactDir)
  ) {
    throw new Error(`Run artifact directory escapes the round runs directory: ${record.artifactDir}`);
  }
  const completed = record.status === "COMPLETED";
  if (
    record.status === "AUDIT_REQUIRED" ||
    record.status === "RUNNING" ||
    isPreEngineArtifactAuditRun(record)
  ) return;
  await assertArtifactFileSafe(record.lifecycleFile, physicalArtifactDir, completed);
  let completedLifecycle: SingleRunLifecycle | undefined;
  if (completed) {
    const lifecycle = await readLifecycleIfPresent(record.lifecycleFile, {
      campaignId: manifest.campaignId,
      roundId: manifest.roundId,
      runId: record.runId,
      scenarioId: record.scenarioId,
      artifactDir: record.artifactDir,
      lifecycleFile: record.lifecycleFile,
    });
    if (!lifecycle) {
      throw new Error(`Required lifecycle marker is missing: ${record.lifecycleFile}`);
    }
    if (
      lifecycle.state !== "COMPLETED" ||
      !lifecycle.processStarted ||
      !lifecycle.publicRun?.processStarted
    ) {
      throw new Error(`Completed run lacks a counted completed lifecycle: ${record.runId}`);
    }
    if (!jsonEqual(lifecycle.publicRun, record.report)) {
      throw new Error(
        `Completed lifecycle public report does not match its manifest record: ${record.runId}`,
      );
    }
    for (const path of [
      lifecycle.lifecycleFile,
      lifecycle.resultFile,
      lifecycle.logFile,
      lifecycle.eventsFile,
    ]) {
      if (dirname(resolve(path)) !== record.artifactDir) {
        throw new Error(`Lifecycle artifact escapes its run directory: ${path}`);
      }
      await assertArtifactFileSafe(path, physicalArtifactDir, true);
    }
    completedLifecycle = lifecycle;
  }
  if (record.report) {
    for (const key of ["resultFile", "logFile", "eventsFile", "lifecycleFile"] as const) {
      const file = record.report[key];
      if (file === undefined) continue;
      if (dirname(resolve(file)) !== record.artifactDir) {
        throw new Error(`Run report ${key} escapes its artifact directory: ${file}`);
      }
      await assertArtifactFileSafe(file, physicalArtifactDir, completed);
    }
  }
  if (completedLifecycle) {
    await validateCompletedArtifactContents(record, completedLifecycle);
  }
};

const validateCompletedArtifactContents = async (
  record: CampaignRunRecord,
  lifecycle: SingleRunLifecycle,
): Promise<void> => {
  if (!record.report || lifecycle.state !== "COMPLETED") {
    throw new Error(`Completed run artifacts are incomplete: ${record.runId}`);
  }
  const artifactPaths = [
    lifecycle.lifecycleFile,
    lifecycle.resultFile,
    lifecycle.logFile,
    lifecycle.eventsFile,
  ];
  if (new Set(artifactPaths.map((path) => resolve(path))).size !== artifactPaths.length) {
    throw new Error(`Completed run artifact paths must be distinct: ${record.runId}`);
  }
  const fileStats = await Promise.all(artifactPaths.map((path) => lstat(path)));
  if (new Set(fileStats.map((info) => `${info.dev}:${info.ino}`)).size !== artifactPaths.length) {
    throw new Error(`Completed run artifacts must not alias one file: ${record.runId}`);
  }

  const result = parseJsonArtifact(await readFile(lifecycle.resultFile, "utf8"), "result");
  const log = parseJsonArtifact(await readFile(lifecycle.logFile, "utf8"), "log");
  const eventLines = (await readFile(lifecycle.eventsFile, "utf8"))
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);
  const events = eventLines.map((line) => parseJsonArtifact(line, "event JSONL line"));
  for (const event of events) {
    if (
      !isRecord(event.context) ||
      event.context.campaignId !== record.report.campaignId ||
      event.context.roundId !== record.report.roundId ||
      event.context.runId !== record.runId
    ) {
      throw new Error(`Completed event context is inconsistent: ${record.runId}`);
    }
  }

  if (
    log.schemaVersion !== 1 ||
    log.artifactType !== "recommendation-engine-test-log" ||
    log.scenario !== record.scenarioId ||
    log.campaignId !== record.report.campaignId ||
    log.roundId !== record.report.roundId ||
    log.runId !== record.runId ||
    log.status !== record.report.status ||
    log.processStarted !== record.report.processStarted ||
    log.engineStatus !== record.report.engineStatus ||
    log.recommendationCount !== record.report.recommendationCount ||
    !jsonEqual(log.selectedItemIds, record.report.selectedItemIds) ||
    log.resultFile !== lifecycle.resultFile ||
    log.logFile !== lifecycle.logFile ||
    log.eventsFile !== lifecycle.eventsFile ||
    log.lifecycleFile !== lifecycle.lifecycleFile ||
    !Number.isInteger(log.eventCount) ||
    !isRecord(log.trace) ||
    !jsonEqual(log.trace, record.report.trace) ||
    log.trace.eventCount !== log.eventCount ||
    log.eventCount !== eventLines.length
  ) {
    throw new Error(`Completed run log/event artifacts are inconsistent: ${record.runId}`);
  }
  if (record.report.engineStatus === "SUCCESS") {
    if (
      result.status !== "SUCCESS" ||
      !isRecord(result.userOutput) ||
      !Array.isArray(result.userOutput.recommendations) ||
      !jsonEqual(
        result.userOutput.recommendations.map((item) =>
          isRecord(item) && typeof item.id === "string" ? item.id : undefined,
        ),
        record.report.selectedItemIds,
      )
    ) {
      throw new Error(`Completed SUCCESS result does not match its report: ${record.runId}`);
    }
  } else if (
    result.status !== "ERROR" ||
    !isRecord(result.error) ||
    result.error.code !== record.report.errorCode ||
    result.error.message !== record.report.engineErrorMessage
  ) {
    throw new Error(`Completed ERROR result does not match its report: ${record.runId}`);
  }
};

const parseJsonArtifact = (
  source: string,
  label: string,
): Record<string, unknown> => {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch (error) {
    throw new Error(`Invalid ${label} artifact JSON: ${toErrorMessage(error)}`);
  }
  if (!isRecord(value)) throw new Error(`${label} artifact must contain a JSON object`);
  return value;
};

const prepareRunArtifactDirectories = async (
  manifest: CampaignRoundManifest,
  paths: CampaignRoundPaths,
): Promise<void> => {
  const physicalRunsDir = await realpath(paths.runsDir);
  for (const record of Object.values(manifest.runs)) {
    await mkdir(record.artifactDir, { recursive: false }).catch((error: unknown) => {
      if (!isNodeError(error) || error.code !== "EEXIST") throw error;
    });
    const info = await lstat(record.artifactDir);
    if (info.isSymbolicLink() || !info.isDirectory()) {
      throw new Error(`Run artifact directory must not be a symlink: ${record.artifactDir}`);
    }
    const physicalArtifactDir = await realpath(record.artifactDir);
    if (
      dirname(physicalArtifactDir) !== physicalRunsDir ||
      !isPhysicalChildPath(physicalRunsDir, physicalArtifactDir)
    ) {
      throw new Error(`Run artifact directory escapes the round runs directory: ${record.artifactDir}`);
    }
  }
};

const assertArtifactFileSafe = async (
  file: string,
  physicalArtifactDir: string,
  required: boolean,
): Promise<void> => {
  const info = await lstatIfPresent(file);
  if (!info) {
    if (required) throw new Error(`Required run artifact is missing: ${file}`);
    return;
  }
  if (info.isSymbolicLink() || !info.isFile()) {
    throw new Error(`Run artifact must be a regular non-symlink file: ${file}`);
  }
  const physicalFile = await realpath(file);
  if (dirname(physicalFile) !== physicalArtifactDir) {
    throw new Error(`Run artifact escapes its artifact directory: ${file}`);
  }
};

const isPhysicalChildPath = (parent: string, child: string): boolean => {
  const pathFromParent = relative(parent, child);
  return pathFromParent.length > 0 &&
    pathFromParent !== ".." &&
    !pathFromParent.startsWith(`..${sep}`) &&
    !isAbsolute(pathFromParent);
};

const lstatIfPresent = async (path: string): Promise<Awaited<ReturnType<typeof lstat>> | undefined> => {
  try {
    return await lstat(path);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return undefined;
    throw error;
  }
};

const acquireCampaignRoundLock = async (
  paths: CampaignRoundPaths,
  campaignId: string,
  roundId: string,
  now: () => Date,
): Promise<CampaignRoundLock> => {
  const lock: CampaignRoundLock = {
    schemaVersion: 1,
    artifactType: "recommendation-engine-campaign-lock",
    campaignId,
    roundId,
    ownerProcessId: process.pid,
    invocationId: randomUUID(),
    createdAt: now().toISOString(),
  };
  let handle;
  let created = false;
  try {
    handle = await open(paths.lockPath, "wx", 0o600);
    created = true;
    await handle.writeFile(`${JSON.stringify(lock, null, 2)}\n`, "utf8");
    await handle.sync();
    await handle.close();
    return lock;
  } catch (error) {
    await handle?.close().catch(() => undefined);
    if (isNodeError(error) && error.code === "EEXIST") {
      const existing = await readCampaignRoundLockIfPresent(paths.lockPath);
      throw new Error(
        existing
          ? `Campaign is locked for ${existing.roundId} by process ${existing.ownerProcessId}; stale locks require manual audit`
          : "Campaign lock exists but is invalid; manual audit is required",
      );
    }
    if (created) await unlink(paths.lockPath).catch(() => undefined);
    throw error;
  }
};

const releaseCampaignRoundLock = async (
  paths: CampaignRoundPaths,
  ownedLock: CampaignRoundLock,
): Promise<void> => {
  const current = await readCampaignRoundLockIfPresent(paths.lockPath);
  if (!current || current.invocationId !== ownedLock.invocationId) {
    throw new Error("Campaign lock ownership changed; manual audit is required");
  }
  await unlink(paths.lockPath);
};

const readCampaignRoundLockIfPresent = async (
  lockPath: string,
): Promise<CampaignRoundLock | undefined> => {
  const info = await lstatIfPresent(lockPath);
  if (!info) return undefined;
  if (info.isSymbolicLink() || !info.isFile()) {
    throw new Error(`Campaign lock must be a regular non-symlink file: ${lockPath}`);
  }
  const value: unknown = JSON.parse(await readFile(lockPath, "utf8"));
  if (
    !isRecord(value) ||
    !hasExactKeys(
      value,
      [
        "schemaVersion",
        "artifactType",
        "campaignId",
        "roundId",
        "ownerProcessId",
        "invocationId",
        "createdAt",
      ],
      [],
    ) ||
    value.schemaVersion !== 1 ||
    value.artifactType !== "recommendation-engine-campaign-lock" ||
    typeof value.campaignId !== "string" ||
    typeof value.roundId !== "string" ||
    !Number.isInteger(value.ownerProcessId) ||
    (value.ownerProcessId as number) <= 0 ||
    typeof value.invocationId !== "string" ||
    !isIsoTimestamp(value.createdAt)
  ) {
    throw new Error(`Campaign lock is invalid: ${lockPath}`);
  }
  return value as CampaignRoundLock;
};

type ManifestValidationExpectation = {
  campaignId: string;
  roundId: string;
  roundNumber: number;
  scenarioFingerprint: string;
  sourceFingerprint?: string;
  initialConcurrency?: number;
  childTimeoutMs?: number;
  minimumCreatedAt?: string;
  scenarios: CampaignScenario[];
};

const readManifestIfPresent = async (
  paths: CampaignRoundPaths,
  expected: ManifestValidationExpectation,
): Promise<CampaignRoundManifest | undefined> => {
  try {
    const manifestInfo = await lstat(paths.manifestPath);
    if (manifestInfo.isSymbolicLink() || !manifestInfo.isFile()) {
      throw new Error(`Campaign manifest must be a regular non-symlink file: ${paths.manifestPath}`);
    }
    const parsed: unknown = JSON.parse(await readFile(paths.manifestPath, "utf8"));
    const manifest = validateCampaignRoundManifest(parsed, paths, expected);
    await assertManifestPhysicalPathsSafe(manifest, paths);
    return manifest;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return undefined;
    throw error;
  }
};

const reconcileStaleRunRecords = async (
  manifest: CampaignRoundManifest,
  scenarioById: ReadonlyMap<TestScenarioName, CampaignScenario>,
  now: () => Date,
): Promise<void> => {
  for (const record of Object.values(manifest.runs)) {
    const originalStatus = record.status;
    if (
      (originalStatus !== "RUNNING" &&
        originalStatus !== "PENDING" &&
        originalStatus !== "PRE_ENGINE_FAILURE") ||
      isPreEngineArtifactAuditRun(record)
    ) continue;
    const scenario = scenarioById.get(record.scenarioId);
    if (!scenario) throw new Error(`Missing scenario definition: ${record.scenarioId}`);

    let lifecycle: SingleRunLifecycle | undefined;
    try {
      lifecycle = await readLifecycleIfPresent(record.lifecycleFile, {
        campaignId: manifest.campaignId,
        roundId: manifest.roundId,
        runId: record.runId,
        scenarioId: record.scenarioId,
        artifactDir: record.artifactDir,
        lifecycleFile: record.lifecycleFile,
      });
    } catch (error) {
      const report = createInvalidLifecycleReport(record, error);
      ensureRunHasExecutionEvidence(record, undefined, now);
      record.report = report;
      record.outcome = classifyCampaignRun(report, scenario);
      record.status = "AUDIT_REQUIRED";
      record.completedAt = now().toISOString();
      continue;
    }

    if (!lifecycle) {
      if (originalStatus !== "RUNNING") continue;
      const report: SingleRunPublicReport = {
        status: "FAIL",
        scenario: record.scenarioId,
        processStarted: false,
        engineStatus: "ERROR",
        errorCode: "CAMPAIGN_PRE_ENGINE_INTERRUPTION",
        recommendationCount: 0,
        selectedItemIds: [],
        lifecycleFile: record.lifecycleFile,
        error: "Stale RUNNING record has no engine lifecycle marker",
      };
      record.report = report;
      record.outcome = classifyCampaignRun(report, scenario);
      record.status = "PRE_ENGINE_FAILURE";
      record.completedAt = now().toISOString();
      continue;
    }
    if (lifecycle.scenario !== record.scenarioId || lifecycle.runId !== record.runId) {
      const report = createInvalidLifecycleReport(
        record,
        new Error("Lifecycle identity does not match its campaign run"),
      );
      record.report = report;
      record.outcome = classifyCampaignRun(report, scenario);
      record.status = "AUDIT_REQUIRED";
      record.completedAt = now().toISOString();
      continue;
    }
    if (lifecycle.state === "COMPLETED" && lifecycle.publicRun) {
      const report = parseLifecyclePublicRun(lifecycle.publicRun, record.scenarioId);
      if (lifecycle.processStarted && report.processStarted) {
        ensureRunHasExecutionEvidence(record, lifecycle, now);
        record.report = report;
        record.outcome = classifyCampaignRun(report, scenario);
        record.status = isAuditRequiredReport(report) ? "AUDIT_REQUIRED" : "COMPLETED";
        record.completedAt = now().toISOString();
      } else if (originalStatus === "RUNNING") {
        record.report = report;
        record.outcome = classifyCampaignRun(report, scenario);
        record.status = "PRE_ENGINE_FAILURE";
        record.completedAt = now().toISOString();
      }
      continue;
    }

    ensureRunHasExecutionEvidence(record, lifecycle, now);
    const report = createInterruptedEngineReport({
      scenarioId: record.scenarioId,
      lifecycleFile: record.lifecycleFile,
      timedOut: false,
      detail: "Stale campaign manifest found an engine-started lifecycle marker",
    });
    record.report = report;
    record.outcome = classifyCampaignRun(report, scenario);
    record.status = "AUDIT_REQUIRED";
    record.completedAt = now().toISOString();
  }
};

const ensureRunHasExecutionEvidence = (
  record: CampaignRunRecord,
  lifecycle: SingleRunLifecycle | undefined,
  now: () => Date,
): void => {
  record.executionCount = Math.max(1, record.executionCount);
  record.startedAt ??=
    lifecycle?.engineProcessStartedAt ?? lifecycle?.updatedAt ?? now().toISOString();
};

const createInvalidLifecycleReport = (
  record: CampaignRunRecord,
  error: unknown,
): SingleRunPublicReport => ({
  status: "FAIL",
  scenario: record.scenarioId,
  processStarted: true,
  engineStatus: "ERROR",
  errorCode: "CAMPAIGN_STALE_LIFECYCLE_INVALID",
  engineErrorMessage: "Stale lifecycle marker could not be verified",
  recommendationCount: 0,
  selectedItemIds: [],
  lifecycleFile: record.lifecycleFile,
  error: toErrorMessage(error),
});

const readLifecycleIfPresent = async (
  lifecycleFile: string,
  expected?: LifecycleExpectation,
): Promise<SingleRunLifecycle | undefined> => {
  try {
    const info = await lstatIfPresent(lifecycleFile);
    if (!info) return undefined;
    if (info.isSymbolicLink() || !info.isFile()) {
      throw new Error(`Lifecycle marker must be a regular non-symlink file: ${lifecycleFile}`);
    }
    const value: unknown = JSON.parse(await readFile(lifecycleFile, "utf8"));
    return validateSingleRunLifecycle(value, lifecycleFile, expected);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return undefined;
    throw error;
  }
};

const validateSingleRunLifecycle = (
  value: unknown,
  lifecycleFile: string,
  expected?: LifecycleExpectation,
): SingleRunLifecycle => {
  if (!isRecord(value)) {
    throw new Error(`Invalid single-run lifecycle marker: ${lifecycleFile}`);
  }
  const commonKeys = [
    "schemaVersion",
    "artifactType",
    "campaignId",
    "roundId",
    "runId",
    "scenario",
    "processId",
    "processStarted",
    "lifecycleFile",
    "resultFile",
    "logFile",
    "eventsFile",
    "updatedAt",
    "state",
  ] as const;
  if (value.state === "ENGINE_PROCESS_STARTED") {
    assertExactKeys(value, [...commonKeys, "engineProcessStartedAt"], [], "lifecycle marker");
  } else if (value.state === "COMPLETED") {
    assertExactKeys(value, [...commonKeys, "completedAt", "publicRun"], [], "lifecycle marker");
  } else {
    throw new Error(`Invalid lifecycle state: ${String(value.state)}`);
  }
  if (
    value.schemaVersion !== 1 ||
    value.artifactType !== "recommendation-engine-test-lifecycle" ||
    typeof value.campaignId !== "string" ||
    typeof value.roundId !== "string" ||
    typeof value.runId !== "string" ||
    typeof value.scenario !== "string" ||
    !Number.isInteger(value.processId) ||
    (value.processId as number) <= 0 ||
    typeof value.processStarted !== "boolean" ||
    typeof value.lifecycleFile !== "string" ||
    typeof value.resultFile !== "string" ||
    typeof value.logFile !== "string" ||
    typeof value.eventsFile !== "string" ||
    !isIsoTimestamp(value.updatedAt)
  ) {
    throw new Error(`Invalid single-run lifecycle marker: ${lifecycleFile}`);
  }
  const scenario = parseTestScenarioName(value.scenario);
  if (expected) {
    if (
      value.campaignId !== expected.campaignId ||
      value.roundId !== expected.roundId ||
      value.runId !== expected.runId ||
      scenario !== expected.scenarioId ||
      resolve(value.lifecycleFile) !== resolve(expected.lifecycleFile)
    ) {
      throw new Error(`Lifecycle identity mismatch: ${lifecycleFile}`);
    }
    for (const path of [value.resultFile, value.logFile, value.eventsFile]) {
      if (!isAbsolute(path) || dirname(resolve(path)) !== resolve(expected.artifactDir)) {
        throw new Error(`Lifecycle artifact path escapes its run directory: ${path}`);
      }
    }
  }
  if (value.state === "ENGINE_PROCESS_STARTED") {
    if (value.processStarted !== true || !isIsoTimestamp(value.engineProcessStartedAt)) {
      throw new Error(`Engine-start lifecycle state is inconsistent: ${lifecycleFile}`);
    }
    return value as SingleRunLifecycle;
  }
  if (!isIsoTimestamp(value.completedAt) || !isRecord(value.publicRun)) {
    throw new Error(`Completed lifecycle state is incomplete: ${lifecycleFile}`);
  }
  const report = parseLifecyclePublicRun(
    value.publicRun as SingleRunPublicReport,
    scenario,
  );
  const reportRecord = report as SingleRunPublicReport & Record<string, unknown>;
  if (
    report.processStarted !== value.processStarted ||
    reportRecord.campaignId !== value.campaignId ||
    reportRecord.roundId !== value.roundId ||
    reportRecord.runId !== value.runId ||
    report.resultFile !== value.resultFile ||
    report.logFile !== value.logFile ||
    report.eventsFile !== value.eventsFile ||
    report.lifecycleFile !== value.lifecycleFile
  ) {
    throw new Error(`Completed lifecycle public report is inconsistent: ${lifecycleFile}`);
  }
  return value as SingleRunLifecycle;
};

const validateCampaignRoundManifest = (
  value: unknown,
  paths: CampaignRoundPaths,
  expected: ManifestValidationExpectation,
): CampaignRoundManifest => {
  if (!isRecord(value)) throw new Error(`Invalid campaign manifest: ${paths.manifestPath}`);
  assertExactKeys(
    value,
    [
      "schemaVersion",
      "artifactType",
      "campaignId",
      "roundId",
      "roundNumber",
      "scenarioFingerprint",
      "sourceFingerprint",
      "initialConcurrency",
      "concurrency",
      "circuitAcknowledgedRunIds",
      "childTimeoutMs",
      "status",
      "createdAt",
      "updatedAt",
      "scenarioIds",
      "runs",
    ],
    ["circuitBreaker", "haltReason"],
    "campaign manifest",
  );
  if (
    value.schemaVersion !== 1 ||
    value.artifactType !== "recommendation-engine-campaign-round" ||
    value.campaignId !== expected.campaignId ||
    value.roundId !== expected.roundId ||
    value.roundNumber !== expected.roundNumber ||
    value.scenarioFingerprint !== expected.scenarioFingerprint ||
    (expected.sourceFingerprint !== undefined &&
      value.sourceFingerprint !== expected.sourceFingerprint) ||
    (expected.initialConcurrency !== undefined &&
      value.initialConcurrency !== expected.initialConcurrency) ||
    (expected.childTimeoutMs !== undefined &&
      value.childTimeoutMs !== expected.childTimeoutMs) ||
    (expected.minimumCreatedAt !== undefined &&
      (typeof value.createdAt !== "string" ||
        value.createdAt < expected.minimumCreatedAt)) ||
    typeof value.sourceFingerprint !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.sourceFingerprint) ||
    !isCampaignRoundStatus(value.status) ||
    (value.haltReason !== undefined &&
      value.haltReason !== "CAMPAIGN_TIME_BUDGET_EXHAUSTED") ||
    !isIsoTimestamp(value.createdAt) ||
    !isIsoTimestamp(value.updatedAt) ||
    Date.parse(value.updatedAt) < Date.parse(value.createdAt)
  ) {
    throw new Error(`Campaign manifest identity or metadata is invalid: ${paths.manifestPath}`);
  }
  const initialConcurrency = parseConcurrency(
    asNumber(value.initialConcurrency, "manifest initialConcurrency"),
  );
  const concurrency = parseConcurrency(asNumber(value.concurrency, "manifest concurrency"));
  if (concurrency > initialConcurrency) {
    throw new Error("Campaign concurrency cannot exceed its round initial concurrency");
  }
  parsePositiveDuration(asNumber(value.childTimeoutMs, "manifest childTimeoutMs"), "childTimeoutMs");

  if (!Array.isArray(value.scenarioIds) || value.scenarioIds.length !== CAMPAIGN_ROUND_SIZE) {
    throw new Error("Campaign manifest must contain exactly 10 scenario IDs");
  }
  const scenarioIds = value.scenarioIds.map((item) => {
    if (typeof item !== "string") throw new Error("Campaign scenario ID must be a string");
    return parseTestScenarioName(item);
  });
  if (new Set(scenarioIds).size !== CAMPAIGN_ROUND_SIZE) {
    throw new Error("Campaign manifest scenario IDs must be unique");
  }
  const expectedIds = expected.scenarios.map((scenario) => scenario.id);
  if (!jsonEqual(scenarioIds, expectedIds)) {
    throw new Error("Campaign manifest scenarios do not match the requested round");
  }
  if (!isRecord(value.runs)) throw new Error("Campaign manifest runs must be an object");
  assertExactKeySet(value.runs, scenarioIds, "campaign manifest runs");

  const scenarioById = new Map(expected.scenarios.map((scenario) => [scenario.id, scenario]));
  const runs: Record<string, CampaignRunRecord> = {};
  for (const scenarioId of scenarioIds) {
    const scenario = scenarioById.get(scenarioId);
    if (!scenario) throw new Error(`Missing scenario definition: ${scenarioId}`);
    runs[scenarioId] = validateCampaignRunRecord(
      value.runs[scenarioId],
      scenario,
      expected.campaignId,
      expected.roundNumber,
      paths,
    );
  }

  if (
    !Array.isArray(value.circuitAcknowledgedRunIds) ||
    !value.circuitAcknowledgedRunIds.every((runId) => typeof runId === "string") ||
    new Set(value.circuitAcknowledgedRunIds).size !==
      value.circuitAcknowledgedRunIds.length
  ) {
    throw new Error("Campaign circuit acknowledgement run IDs are invalid");
  }
  const recordsByRunId = new Map(Object.values(runs).map((record) => [record.runId, record]));
  for (const runId of value.circuitAcknowledgedRunIds) {
    const record = recordsByRunId.get(runId);
    if (!record?.outcome) {
      throw new Error(`Campaign circuit acknowledgement references no outcome: ${String(runId)}`);
    }
  }

  const manifest = value as CampaignRoundManifest;
  manifest.scenarioIds = scenarioIds;
  manifest.runs = runs;
  validateManifestStatusInvariants(manifest);
  return manifest;
};

const validateCampaignRunRecord = (
  value: unknown,
  scenario: CampaignScenario,
  campaignId: string,
  roundNumber: number,
  paths: CampaignRoundPaths,
): CampaignRunRecord => {
  if (!isRecord(value)) throw new Error(`Invalid run record for ${scenario.id}`);
  assertExactKeys(
    value,
    ["runId", "scenarioId", "artifactDir", "lifecycleFile", "status", "executionCount"],
    [
      "startedAt",
      "completedAt",
      "childExitCode",
      "childStderr",
      "report",
      "outcome",
    ],
    `run record ${scenario.id}`,
  );
  const expectedRunId = createRunId(campaignId, roundNumber, scenario.id);
  const expectedArtifactDir = join(paths.runsDir, expectedRunId);
  const expectedLifecycleFile = join(
    expectedArtifactDir,
    `${expectedRunId}.lifecycle.json`,
  );
  if (
    value.runId !== expectedRunId ||
    value.scenarioId !== scenario.id ||
    value.artifactDir !== expectedArtifactDir ||
    value.lifecycleFile !== expectedLifecycleFile ||
    !isCampaignRunStatus(value.status) ||
    !Number.isInteger(value.executionCount) ||
    (value.executionCount as number) < 0
  ) {
    throw new Error(`Run record identity or path is invalid for ${scenario.id}`);
  }
  if (value.startedAt !== undefined && !isIsoTimestamp(value.startedAt)) {
    throw new Error(`Run record startedAt is invalid for ${scenario.id}`);
  }
  if (value.completedAt !== undefined && !isIsoTimestamp(value.completedAt)) {
    throw new Error(`Run record completedAt is invalid for ${scenario.id}`);
  }
  if (
    value.childExitCode !== undefined &&
    value.childExitCode !== null &&
    !Number.isInteger(value.childExitCode)
  ) {
    throw new Error(`Run record childExitCode is invalid for ${scenario.id}`);
  }
  if (value.childStderr !== undefined && typeof value.childStderr !== "string") {
    throw new Error(`Run record childStderr is invalid for ${scenario.id}`);
  }

  const status = value.status;
  const executionCount = value.executionCount as number;
  const hasExecution = executionCount > 0 && typeof value.startedAt === "string";
  if (status === "PENDING") {
    if (
      executionCount !== 0 ||
      value.startedAt !== undefined ||
      value.completedAt !== undefined ||
      value.report !== undefined ||
      value.outcome !== undefined
    ) {
      throw new Error(`Pending run record contains execution state for ${scenario.id}`);
    }
    return value as CampaignRunRecord;
  }
  if (!hasExecution) throw new Error(`Executed run record is incomplete for ${scenario.id}`);
  if (status === "RUNNING") {
    if (
      value.completedAt !== undefined ||
      value.report !== undefined ||
      value.outcome !== undefined
    ) {
      throw new Error(`Running record contains terminal state for ${scenario.id}`);
    }
    return value as CampaignRunRecord;
  }

  if (!isIsoTimestamp(value.completedAt) || value.report === undefined || value.outcome === undefined) {
    throw new Error(`Terminal run record is incomplete for ${scenario.id}`);
  }
  const report = validateStoredRunReport(value.report, scenario, expectedLifecycleFile);
  const outcome = validateStoredRunOutcome(value.outcome, report, scenario);
  if (
    status === "COMPLETED" &&
    validateChildReportIdentity(report, {
      campaignId,
      roundId: formatRoundId(roundNumber),
      runId: expectedRunId,
      scenarioId: scenario.id,
      artifactDir: expectedArtifactDir,
      lifecycleFile: expectedLifecycleFile,
    })
  ) {
    throw new Error(`Completed run report identity is invalid for ${scenario.id}`);
  }
  if (
    status === "PRE_ENGINE_FAILURE" &&
    (report.processStarted || outcome.engineStarted || outcome.classification !== "NOT_COUNTED")
  ) {
    throw new Error(`Pre-engine failure was incorrectly counted for ${scenario.id}`);
  }
  if (
    status === "COMPLETED" &&
    (!report.processStarted || !outcome.engineStarted || isAuditRequiredReport(report))
  ) {
    throw new Error(`Completed run is not a verified process-started outcome for ${scenario.id}`);
  }
  if (
    status === "AUDIT_REQUIRED" &&
    (!report.processStarted || !outcome.engineStarted || !isAuditRequiredReport(report))
  ) {
    throw new Error(`Audit-required run is missing counted ambiguity for ${scenario.id}`);
  }
  return value as CampaignRunRecord;
};

const validateStoredRunReport = (
  value: unknown,
  scenario: CampaignScenario,
  expectedLifecycleFile: string,
): SingleRunPublicReport => {
  if (!isRecord(value)) throw new Error(`Stored report is invalid for ${scenario.id}`);
  assertExactKeys(
    value,
    ["status", "scenario", "processStarted"],
    [
      "name",
      "campaignId",
      "roundId",
      "runId",
      "engineStatus",
      "errorCode",
      "unsupportedReason",
      "engineErrorMessage",
      "recommendationCount",
      "selectedItemIds",
      "infrastructureProvider",
      "explicitQuotaFailure",
      "infrastructureSignals",
      "durationMs",
      "expectedErrorCode",
      "trace",
      "error",
      "resultFile",
      "logFile",
      "eventsFile",
      "lifecycleFile",
    ],
    `stored report ${scenario.id}`,
  );
  const report = parseSingleRunJson(
    JSON.stringify({ status: value.status, selected: [], run: value }),
  ).run;
  if (
    report.scenario !== scenario.id ||
    (report.lifecycleFile !== undefined && report.lifecycleFile !== expectedLifecycleFile)
  ) {
    throw new Error(`Stored report identity is invalid for ${scenario.id}`);
  }
  for (const key of ["resultFile", "logFile", "eventsFile", "lifecycleFile"] as const) {
    const file = report[key];
    if (file !== undefined && !isAbsolute(file)) {
      throw new Error(`Stored report ${key} must be absolute for ${scenario.id}`);
    }
  }
  return report;
};

const validateStoredRunOutcome = (
  value: unknown,
  report: SingleRunPublicReport,
  scenario: CampaignScenario,
): ClassifiedCampaignRun => {
  if (!isRecord(value)) throw new Error(`Stored outcome is invalid for ${scenario.id}`);
  assertExactKeys(
    value,
    [
      "scenarioId",
      "expected",
      "classification",
      "engineStarted",
      "explicitQuotaFailure",
      "infrastructureSignals",
      "report",
    ],
    ["provider"],
    `stored outcome ${scenario.id}`,
  );
  const recomputed = classifyCampaignRun(report, scenario);
  if (
    value.scenarioId !== scenario.id ||
    value.classification !== recomputed.classification ||
    value.engineStarted !== recomputed.engineStarted ||
    value.explicitQuotaFailure !== recomputed.explicitQuotaFailure ||
    !jsonEqual(value.infrastructureSignals, recomputed.infrastructureSignals) ||
    value.provider !== recomputed.provider ||
    !jsonEqual(value.expected, scenario.expected) ||
    !jsonEqual(value.report, report)
  ) {
    throw new Error(`Stored outcome does not match its report for ${scenario.id}`);
  }
  return value as ClassifiedCampaignRun;
};

const validateManifestStatusInvariants = (manifest: CampaignRoundManifest): void => {
  const records = Object.values(manifest.runs);
  if (manifest.status === "COMPLETED" && records.some((run) => run.status !== "COMPLETED")) {
    throw new Error("Completed campaign manifest contains non-completed runs");
  }
  if (
    manifest.status === "AUDIT_REQUIRED" &&
    records.every(
      (run) => run.status !== "AUDIT_REQUIRED" && !isPreEngineArtifactAuditRun(run),
    )
  ) {
    throw new Error("Audit-required campaign manifest has no audit-required run");
  }
  if (manifest.status === "CIRCUIT_OPEN") {
    if (!isCircuitBreakerDecision(manifest.circuitBreaker)) {
      throw new Error("Circuit-open manifest is missing a valid circuit-breaker decision");
    }
  } else if (manifest.circuitBreaker !== undefined) {
    throw new Error("Only a circuit-open manifest may retain a circuit-breaker decision");
  }
  if (
    manifest.haltReason !== undefined &&
    manifest.status !== "INCOMPLETE"
  ) {
    throw new Error("Only an incomplete manifest may retain a halt reason");
  }
};

const isCircuitBreakerDecision = (
  value: unknown,
): value is Exclude<CircuitBreakerDecision, { trip: false }> =>
  isRecord(value) &&
  hasExactKeys(value, ["trip", "reason", "provider"], []) &&
  value.trip === true &&
  (value.reason === "EXPLICIT_QUOTA_FAILURE" ||
    value.reason === "REPEATED_PROVIDER_FAILURE") &&
  typeof value.provider === "string" &&
  value.provider.length > 0;

const isCampaignRoundStatus = (value: unknown): value is CampaignRoundStatus =>
  value === "RUNNING" ||
  value === "COMPLETED" ||
  value === "INCOMPLETE" ||
  value === "CIRCUIT_OPEN" ||
  value === "AUDIT_REQUIRED";

const isCampaignRunStatus = (value: unknown): value is CampaignRunStatus =>
  value === "PENDING" ||
  value === "RUNNING" ||
  value === "COMPLETED" ||
  value === "PRE_ENGINE_FAILURE" ||
  value === "AUDIT_REQUIRED";

const isIsoTimestamp = (value: unknown): value is string =>
  typeof value === "string" &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString() === value;

const asNumber = (value: unknown, label: string): number => {
  if (typeof value !== "number") throw new Error(`${label} must be a number`);
  return value;
};

const jsonEqual = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

const assertExactKeys = (
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[],
  label: string,
): void => {
  if (!hasExactKeys(value, required, optional)) {
    throw new Error(`${label} contains missing or unknown fields`);
  }
};

const hasExactKeys = (
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[],
): boolean => {
  const keys = Object.keys(value);
  const allowed = new Set([...required, ...optional]);
  return required.every((key) => Object.prototype.hasOwnProperty.call(value, key)) &&
    keys.every((key) => allowed.has(key));
};

const assertExactKeySet = (
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
  label: string,
): void => {
  const actual = Object.keys(value).sort(compareStrings);
  const expected = [...expectedKeys].sort(compareStrings);
  if (!jsonEqual(actual, expected)) throw new Error(`${label} keys do not match scenarios`);
};

const writeJsonAtomic = async (path: string, value: unknown): Promise<void> => {
  const parentDirectory = dirname(path);
  await mkdir(parentDirectory, { recursive: true });
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  let renamed = false;
  try {
    const temporaryFile = await open(temporaryPath, "wx", 0o600);
    try {
      await temporaryFile.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
      await temporaryFile.sync();
    } finally {
      await temporaryFile.close();
    }
    await rename(temporaryPath, path);
    renamed = true;

    await syncParentDirectory(parentDirectory);
  } finally {
    if (!renamed) await unlink(temporaryPath).catch(() => undefined);
  }
};

/**
 * rename까지 디스크에 내려가도록 부모 디렉터리를 sync한다.
 *
 * 내구성을 조금 더 챙기려는 부가 단계이지 없으면 안 되는 것이 아니다. 지원하지
 * 않는 플랫폼에서는 조용히 건너뛴다.
 *
 * 윈도우는 디렉터리 핸들 플러시를 지원하지 않아 **EPERM**을 준다(실측: 같은
 * 디렉터리에서 파일 sync는 성공하고 디렉터리 sync만 EPERM). 예전에는 이 예외를
 * 전혀 걸러내지 않아 윈도우에서 캠페인 실행이 통째로 죽었다.
 */
const syncParentDirectory = async (directory: string): Promise<void> => {
  let parentHandle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    parentHandle = await open(directory, "r");
    await parentHandle.sync();
  } catch (error) {
    if (!isUnsupportedDirectorySync(error)) throw error;
  } finally {
    await parentHandle?.close().catch(() => undefined);
  }
};

const isUnsupportedDirectorySync = (error: unknown): boolean =>
  isRecord(error) &&
  (error.code === "EINVAL" ||
    error.code === "ENOTSUP" ||
    error.code === "EISDIR" ||
    error.code === "EPERM" ||
    error.code === "EACCES");

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isNodeError = (value: unknown): value is NodeJS.ErrnoException =>
  value instanceof Error && "code" in value;

const toErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const toError = (error: unknown): Error =>
  error instanceof Error ? error : new Error(String(error));

const compareStrings = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

type CampaignCliOptions = {
  campaignId: string;
  roundNumber: number;
  concurrency?: number;
  childTimeoutMs: number;
  artifactsRoot: string;
  statsFile?: string;
  allowTimeBudgetOverride: boolean;
  json: boolean;
};

export const parseCampaignCliOptions = (args: string[]): CampaignCliOptions => {
  const separatorCount = args.filter((arg) => arg === "--").length;
  if (separatorCount > 1) throw new Error("Duplicate campaign argument separator: --");
  const normalizedArgs = args.filter((arg) => arg !== "--");
  const knownPrefixes = [
    "--campaign-id=",
    "--round=",
    "--concurrency=",
    "--artifacts-root=",
    "--stats-file=",
    "--child-timeout-ms=",
  ];
  const unknown = normalizedArgs.filter(
    (arg) =>
      arg !== "--json" &&
      arg !== "--allow-time-budget-override" &&
      !knownPrefixes.some((prefix) => arg.startsWith(prefix)),
  );
  if (unknown.length > 0) throw new Error(`Unknown campaign option: ${unknown.join(", ")}`);

  const campaignId = readCliValue(normalizedArgs, "--campaign-id") ?? createCampaignId();
  const roundValue = readCliValue(normalizedArgs, "--round") ?? "1";
  const roundNumber = roundValue === "final" ? 11 : Number(roundValue);
  const concurrencyValue = readCliValue(normalizedArgs, "--concurrency");
  const childTimeoutMs = Number(
    readCliValue(normalizedArgs, "--child-timeout-ms") ?? String(DEFAULT_CHILD_TIMEOUT_MS),
  );
  return {
    campaignId: parseCampaignIdentifier(campaignId, "campaignId"),
    roundNumber: parseRoundNumber(roundNumber),
    concurrency:
      concurrencyValue === undefined
        ? undefined
        : parseConcurrency(Number(concurrencyValue)),
    childTimeoutMs: parsePositiveDuration(childTimeoutMs, "childTimeoutMs"),
    artifactsRoot: resolve(
      readCliValue(normalizedArgs, "--artifacts-root") ?? DEFAULT_CAMPAIGN_ARTIFACTS_ROOT,
    ),
    statsFile: readCliValue(normalizedArgs, "--stats-file"),
    allowTimeBudgetOverride: normalizedArgs.includes("--allow-time-budget-override"),
    json: normalizedArgs.includes("--json"),
  };
};

const readCliValue = (args: string[], name: string): string | undefined => {
  const prefix = `${name}=`;
  const matches = args.filter((arg) => arg.startsWith(prefix));
  if (matches.length > 1) throw new Error(`Duplicate campaign option: ${name}`);
  const value = matches[0]?.slice(prefix.length).trim();
  if (matches.length === 1 && !value) throw new Error(`Campaign option requires a value: ${name}`);
  return value;
};

export const runCampaignCli = async (args = process.argv.slice(2)): Promise<void> => {
  const jsonRequested = args.includes("--json");
  try {
    const options = parseCampaignCliOptions(args);
    const finalStats = options.statsFile
      ? parseScenarioCampaignStats(
          JSON.parse(await readFile(resolve(options.statsFile), "utf8")) as unknown,
        )
      : undefined;
    const result = await runCampaignRound({
      campaignId: options.campaignId,
      roundNumber: options.roundNumber,
      concurrency: options.concurrency,
      childTimeoutMs: options.childTimeoutMs,
      artifactsRoot: options.artifactsRoot,
      finalStats,
      allowTimeBudgetOverride: options.allowTimeBudgetOverride,
    });
    const { status: roundStatus, ...roundResult } = result;
    const output = {
      status: roundStatus === "COMPLETED" ? "PASS" : "FAIL",
      roundStatus,
      ...roundResult,
    };
    process.stdout.write(`${JSON.stringify(output, null, options.json ? undefined : 2)}\n`);
    if (result.status !== "COMPLETED") process.exitCode = 1;
  } catch (error) {
    const output = { status: "FAIL", error: toErrorMessage(error) };
    if (jsonRequested) process.stdout.write(`${JSON.stringify(output)}\n`);
    else console.error(output.error);
    process.exitCode = 1;
  }
};

export const parseScenarioCampaignStats = (value: unknown): ScenarioCampaignStats[] => {
  if (!Array.isArray(value)) throw new Error("Final-validation stats file must be a JSON array");
  const stats = value.map((item) => {
    if (
      !isRecord(item) ||
      typeof item.scenarioId !== "string" ||
      typeof item.totalRuns !== "number" ||
      typeof item.failedRuns !== "number" ||
      (item.manualQualityScore !== undefined &&
        typeof item.manualQualityScore !== "number")
    ) {
      throw new Error("Final-validation stats contain an invalid item");
    }
    return {
      scenarioId: parseTestScenarioName(item.scenarioId),
      totalRuns: item.totalRuns,
      failedRuns: item.failedRuns,
      ...(item.manualQualityScore === undefined
        ? {}
        : { manualQualityScore: item.manualQualityScore }),
    };
  });
  assertScenarioCampaignStats(stats);
  return stats;
};

const isMainModule =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMainModule) void runCampaignCli();
