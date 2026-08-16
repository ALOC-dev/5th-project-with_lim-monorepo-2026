import { randomUUID } from "node:crypto";
import {
  closeSync,
  fsyncSync,
  openSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { lstat, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  RecommendationEngine,
  type RecommendationEngineSecrets,
} from "@monorepo/recommendation-engine";
import {
  type EngineOutput,
  EngineOutputSchema,
  type UserInput,
  UserInputSchema,
} from "@monorepo/recommendation-engine/v1/contracts";

import {
  defaultTestScenarioName,
  getTestScenarioInput,
  parseTestScenarioName,
  testConfig,
  testParameterSource,
  type TestScenarioName,
} from "./test/fixtures.js";
import {
  createTestMonitor,
  type TestMonitor,
  type TestTraceSummary,
  type UnsupportedRequestReason,
} from "./test/monitoring.js";

const logDir = join(dirname(fileURLToPath(import.meta.url)), ".log");
const testName = "test";
const testScriptFailureCode = "TEST_SCRIPT_FAILURE";
const testPreflightFailureCode = "TEST_SCRIPT_PREFLIGHT_FAILURE";
const artifactWriteFailureCode = "TEST_ARTIFACT_WRITE_FAILURE";

type TestExecution = {
  result: EngineOutput;
  log: Record<string, unknown>;
};

export type TestCliOptions = {
  json: boolean;
  verbose: boolean;
  scenario: TestScenarioName;
  campaignId?: string;
  roundId?: string;
  runId?: string;
  artifactDir: string;
  expectedErrorCode?: string;
};

export type RunInvocationState = {
  processStarted: boolean;
};

export type TestRun = {
  name: string;
  scenario: TestScenarioName;
  campaignId?: string;
  roundId?: string;
  runId?: string;
  status: "PASS" | "FAIL";
  processStarted: boolean;
  engineStatus: EngineOutput["status"];
  errorCode?: string;
  engineErrorMessage?: string;
  recommendationCount: number;
  selectedItemIds: string[];
  unsupportedReason?: UnsupportedRequestReason;
  expectedErrorCode?: string;
  durationMs: number;
  result: EngineOutput;
  log: Record<string, unknown>;
  trace: TestTraceSummary;
  resultFile: string;
  logFile: string;
  eventsFile: string;
  lifecycleFile: string;
  error?: string;
};

export type TestRunPublicReport = Omit<TestRun, "result" | "log">;

type LifecycleCommon = {
  schemaVersion: 1;
  artifactType: "recommendation-engine-test-lifecycle";
  campaignId?: string;
  roundId?: string;
  runId?: string;
  scenario: TestScenarioName;
  processId: number;
  lifecycleFile: string;
  resultFile: string;
  logFile: string;
  eventsFile: string;
  updatedAt: string;
};

export type TestRunLifecycleMarker =
  | (LifecycleCommon & {
      state: "ENGINE_PROCESS_STARTED";
      processStarted: true;
      engineProcessStartedAt: string;
    })
  | (LifecycleCommon & {
      state: "COMPLETED";
      processStarted: boolean;
      completedAt: string;
      publicRun: TestRunPublicReport;
    });

export type TestArtifactPaths = Pick<
  TestRun,
  "resultFile" | "logFile" | "eventsFile" | "lifecycleFile"
>;

export type LifecycleMarkerContext = {
  campaignId?: string;
  roundId?: string;
  runId?: string;
  scenario: TestScenarioName;
  paths: TestArtifactPaths;
  processId?: number;
};

export type LifecycleStartContext = {
  options: TestCliOptions;
  paths: TestArtifactPaths;
};

export type LifecycleStartWriter = (context: LifecycleStartContext) => void;

export const runCli = async (args = process.argv.slice(2)): Promise<TestRun> => {
  const options = parseTestCliOptions(args);
  const input = UserInputSchema.parse(getTestScenarioInput(options.scenario));
  await mkdir(options.artifactDir, { recursive: true });

  let run = await runEngineTest(options, input);
  try {
    await writeRunFiles(run);
  } catch (error) {
    run = toArtifactFailureRun(run, error);
  }
  try {
    await writeCompletedLifecycleMarker(run);
  } catch (error) {
    run = toArtifactFailureRun(run, error);
  }

  if (options.json) {
    if (run.error) console.error(run.error);
    writeJsonStdout(toCliJsonEnvelope(run));
  } else {
    printRun(run);
  }

  if (run.status === "FAIL") process.exitCode = 1;
  return run;
};

export const parseTestCliOptions = (args: string[]): TestCliOptions => {
  validateArgs(args);
  return {
    json: args.includes("--json"),
    verbose: args.includes("--verbose"),
    scenario: parseScenarioName(args),
    campaignId: parseIdentifierFlag(args, "--campaign-id"),
    roundId: parseIdentifierFlag(args, "--round"),
    runId: parseIdentifierFlag(args, "--run-id"),
    artifactDir: resolve(parseValueFlag(args, "--artifact-dir") ?? logDir),
    expectedErrorCode: parseErrorCodeFlag(args),
  };
};

const validateArgs = (args: string[]): void => {
  const targets = args.filter((arg) => !arg.startsWith("--") && arg !== "--");
  const unknown = targets.filter(
    (target) => target !== "all" && target !== "engine" && target !== testName,
  );
  if (unknown.length > 0) {
    throw new Error(
      `Unknown test target: ${unknown.join(", ")}. The test script now runs the full engine process only.`,
    );
  }

  const knownBooleanFlags = new Set(["--json", "--verbose", "--"]);
  const knownValueFlagPrefixes = [
    "--scenario=",
    "--campaign-id=",
    "--round=",
    "--run-id=",
    "--artifact-dir=",
    "--expect-error=",
  ];
  const unknownFlags = args.filter(
    (arg) =>
      arg.startsWith("--") &&
      !knownBooleanFlags.has(arg) &&
      !knownValueFlagPrefixes.some((prefix) => arg.startsWith(prefix)),
  );
  if (unknownFlags.length > 0) {
    throw new Error(`Unknown test option: ${unknownFlags.join(", ")}`);
  }
};

const parseScenarioName = (args: string[]): TestScenarioName => {
  const scenario = parseValueFlag(args, "--scenario");
  return scenario ? parseTestScenarioName(scenario) : defaultTestScenarioName;
};

const parseValueFlag = (args: string[], name: string): string | undefined => {
  const prefix = `${name}=`;
  const values = args.filter((arg) => arg.startsWith(prefix));
  if (values.length > 1) throw new Error(`Duplicate test option: ${name}`);
  const value = values[0]?.slice(prefix.length).trim();
  if (values.length === 1 && !value) throw new Error(`Test option requires a value: ${name}`);
  return value;
};

const parseIdentifierFlag = (args: string[], name: string): string | undefined => {
  const value = parseValueFlag(args, name);
  if (value === undefined) return undefined;
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value)) {
    throw new Error(`${name} must be a filesystem-safe identifier of at most 128 characters`);
  }
  return value;
};

const parseErrorCodeFlag = (args: string[]): string | undefined => {
  const value = parseValueFlag(args, "--expect-error");
  if (value === undefined) return undefined;
  if (!/^[A-Z][A-Z0-9_]*$/.test(value)) {
    throw new Error("--expect-error must be an uppercase engine error code");
  }
  return value;
};

const runEngineTest = async (options: TestCliOptions, input: UserInput): Promise<TestRun> => {
  const { campaignId, expectedErrorCode, roundId, runId, scenario: scenarioName } = options;
  const runName =
    scenarioName === defaultTestScenarioName ? testName : `${testName}-${scenarioName}`;
  const monitor = createTestMonitor();
  const invocationState: RunInvocationState = { processStarted: false };
  monitor.startCheck(runName);
  const start = performance.now();
  const artifactPaths = createArtifactPaths({
    artifactDir: options.artifactDir,
    runName,
    campaignId,
    roundId,
    runId,
  });
  const { eventsFile, lifecycleFile, logFile, resultFile } = artifactPaths;

  // 이벤트를 발생 즉시 파일로 흘려보낸다. 요약 파일(`.log.json`)은 실행이 끝나야
  // 쓰이므로, 중간에 끊거나 크래시하면 예전에는 터미널 말고 남는 게 없었다.
  monitor.configure({
    eventsFile,
    verbose: options.verbose,
    context: { campaignId, roundId, runId },
  });
  if (options.json) console.error(`EVENTS ${eventsFile}`);
  else console.log(`EVENTS ${eventsFile}`);

  let run: TestRun;
  try {
    const execution = await executeEngineTest(
      input,
      scenarioName,
      monitor,
      invocationState,
      expectedErrorCode,
      { options, paths: artifactPaths },
    );
    run = toRun(
      execution,
      options,
      runName,
      invocationState.processStarted,
      start,
      resultFile,
      logFile,
      eventsFile,
      lifecycleFile,
      monitor,
    );
  } catch (error) {
    run = toFailedRun(
      error,
      options,
      runName,
      input,
      invocationState.processStarted,
      start,
      resultFile,
      logFile,
      eventsFile,
      lifecycleFile,
      monitor,
    );
  }

  return await finalizeEventArtifact(run, monitor);
};

export const finalizeEventArtifact = async (
  run: TestRun,
  monitor: Pick<TestMonitor, "flush">,
): Promise<TestRun> => {
  try {
    await monitor.flush();
    await verifyEventsArtifact(run.eventsFile, run.trace.eventCount);
    return run;
  } catch (error) {
    // `process()` 호출 후의 관측 산출물 실패는 preflight가 아니다.
    // 시작 여부를 보존해 campaign이 같은 live 호출을 중복 실행하지 않게 한다.
    return toArtifactFailureRun(run, error);
  }
};

export const createEngineProcessStartHook = ({
  input,
  invocationState,
  lifecycle,
  writeStartedLifecycleMarker = writeEngineProcessStartedLifecycleMarkerSync,
}: {
  input: UserInput;
  invocationState: RunInvocationState;
  lifecycle?: LifecycleStartContext;
  writeStartedLifecycleMarker?: LifecycleStartWriter;
}): (() => void) =>
  () => {
    // This hook is the literal first statement in RecommendationEngine.process().
    // Set the in-memory boundary before any filesystem operation so marker I/O
    // failures remain counted harness failures rather than preflight failures.
    invocationState.processStarted = true;
    if (!lifecycle) return;
    try {
      writeStartedLifecycleMarker(lifecycle);
    } catch (error) {
      const message = `Failed to persist process-start lifecycle marker: ${toErrorMessage(error)}`;
      throw createTestFailure(message, {
        status: "ERROR",
        userInput: input,
        error: {
          code: artifactWriteFailureCode,
          message,
        },
      });
    }
  };

const executeEngineTest = async (
  input: UserInput,
  scenarioName: TestScenarioName,
  monitor: TestMonitor,
  invocationState: RunInvocationState,
  expectedErrorCode?: string,
  lifecycle?: LifecycleStartContext,
): Promise<TestExecution> => {
  const engine = new RecommendationEngine(input, testConfig, {
    logger: monitor.logger,
    secrets: getRecommendationEngineSecretsFromEnv(),
  });
  if (lifecycle) writeEngineProcessStartedLifecycleMarkerSync(lifecycle);
  invocationState.processStarted = true;
  const result = EngineOutputSchema.parse(await engine.process());
  const reportFields = getEngineReportFields(result);
  const log = {
    scenario: scenarioName,
    input,
    config: testConfig,
    parameterSource: testParameterSource,
    status: result.status,
    expectedErrorCode,
    recommendationCount: reportFields.recommendationCount,
    selectedItemIds: reportFields.selectedItemIds,
    topItem: result.status === "SUCCESS" ? result.userOutput.recommendations[0]?.name : undefined,
    errorCode: reportFields.errorCode,
    engineErrorMessage: reportFields.engineErrorMessage,
  };

  if (expectedErrorCode) {
    assertTest(
      result.status === "ERROR",
      `engine process should fail with ${expectedErrorCode}`,
      result,
      log,
    );
    assertTest(
      result.status === "ERROR" && result.error.code === expectedErrorCode,
      `expected engine error ${expectedErrorCode}`,
      result,
      log,
    );
  } else {
    assertTest(result.status === "SUCCESS", "engine process should succeed", result, log);
    assertTest(
      reportFields.recommendationCount === testConfig.targetCount,
      "target recommendation count mismatch",
      result,
      log,
    );
  }

  return {
    result,
    log,
  };
};

export type EngineReportFields = Pick<
  TestRun,
  "engineStatus" | "errorCode" | "engineErrorMessage" | "recommendationCount" | "selectedItemIds"
>;

export const getEngineReportFields = (result: EngineOutput): EngineReportFields => {
  if (result.status === "ERROR") {
    return {
      engineStatus: result.status,
      errorCode: result.error.code,
      engineErrorMessage: result.error.message,
      recommendationCount: 0,
      selectedItemIds: [],
    };
  }

  return {
    engineStatus: result.status,
    recommendationCount: result.userOutput.recommendations.length,
    selectedItemIds: result.userOutput.recommendations.map((item) => item.id),
  };
};

const toRun = (
  execution: TestExecution,
  options: TestCliOptions,
  name: string,
  processStarted: boolean,
  start: number,
  resultFile: string,
  logFile: string,
  eventsFile: string,
  lifecycleFile: string,
  monitor: TestMonitor,
): TestRun => {
  const trace = monitor.getSummary();
  return {
    name,
    scenario: options.scenario,
    campaignId: options.campaignId,
    roundId: options.roundId,
    runId: options.runId,
    status: "PASS",
    processStarted,
    ...getEngineReportFields(execution.result),
    unsupportedReason: trace.unsupportedReason,
    expectedErrorCode: options.expectedErrorCode,
    durationMs: Math.round(performance.now() - start),
    result: execution.result,
    log: execution.log,
    trace,
    resultFile,
    logFile,
    eventsFile,
    lifecycleFile,
  };
};

const toFailedRun = (
  error: unknown,
  options: TestCliOptions,
  name: string,
  input: UserInput,
  processStarted: boolean,
  start: number,
  resultFile: string,
  logFile: string,
  eventsFile: string,
  lifecycleFile: string,
  monitor: TestMonitor,
): TestRun => {
  const result = getErrorResult(error, input);
  const trace = monitor.getSummary();
  return {
    name,
    scenario: options.scenario,
    campaignId: options.campaignId,
    roundId: options.roundId,
    runId: options.runId,
    status: "FAIL",
    processStarted,
    ...getEngineReportFields(result),
    unsupportedReason: trace.unsupportedReason,
    expectedErrorCode: options.expectedErrorCode,
    durationMs: Math.round(performance.now() - start),
    result,
    log: getErrorLog(error),
    trace,
    resultFile,
    logFile,
    eventsFile,
    lifecycleFile,
    error: toErrorMessage(error),
  };
};

const writeRunFiles = async (run: TestRun): Promise<void> => {
  await Promise.all([
    writeJson(run.resultFile, run.result),
    writeJson(run.logFile, {
      schemaVersion: 1,
      artifactType: "recommendation-engine-test-log",
      name: run.name,
      scenario: run.scenario,
      campaignId: run.campaignId,
      roundId: run.roundId,
      runId: run.runId,
      status: run.status,
      processStarted: run.processStarted,
      engineStatus: run.engineStatus,
      errorCode: run.errorCode,
      engineErrorMessage: run.engineErrorMessage,
      recommendationCount: run.recommendationCount,
      selectedItemIds: run.selectedItemIds,
      unsupportedReason: run.unsupportedReason,
      expectedErrorCode: run.expectedErrorCode,
      durationMs: run.durationMs,
      generatedAt: new Date().toISOString(),
      log: run.log,
      trace: run.trace,
      // 전체 이벤트는 실행 중에 `.events.jsonl`로 스트리밍된다. 여기 또 담으면
      // 같은 내용이 두 벌이 되고 파일이 수 MB로 불어난다.
      eventCount: run.trace.eventCount,
      error: run.error,
      resultFile: run.resultFile,
      logFile: run.logFile,
      eventsFile: run.eventsFile,
      lifecycleFile: run.lifecycleFile,
    }),
  ]);
};

const writeJson = async (filePath: string, value: unknown): Promise<void> => {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

export const createEngineProcessStartedLifecycleMarker = (
  context: LifecycleMarkerContext,
  engineProcessStartedAt = new Date().toISOString(),
): TestRunLifecycleMarker => ({
  ...toLifecycleCommon(context, engineProcessStartedAt),
  state: "ENGINE_PROCESS_STARTED",
  processStarted: true,
  engineProcessStartedAt,
});

export const createCompletedLifecycleMarker = (
  run: TestRun,
  completedAt = new Date().toISOString(),
): TestRunLifecycleMarker => ({
  ...toLifecycleCommon(
    {
      campaignId: run.campaignId,
      roundId: run.roundId,
      runId: run.runId,
      scenario: run.scenario,
      paths: run,
    },
    completedAt,
  ),
  state: "COMPLETED",
  processStarted: run.processStarted,
  completedAt,
  publicRun: toPublicRun(run),
});

export const writeLifecycleMarkerAtomic = async (
  lifecycleFile: string,
  marker: TestRunLifecycleMarker,
): Promise<void> => {
  await mkdir(dirname(lifecycleFile), { recursive: true });
  const temporaryFile = `${lifecycleFile}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporaryFile, `${JSON.stringify(marker, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  await rename(temporaryFile, lifecycleFile);
};

export const writeLifecycleMarkerAtomicSync = (
  lifecycleFile: string,
  marker: TestRunLifecycleMarker,
): void => {
  const temporaryFile = `${lifecycleFile}.${process.pid}.${randomUUID()}.tmp`;
  let renamed = false;
  try {
    const descriptor = openSync(temporaryFile, "wx", 0o600);
    try {
      writeFileSync(descriptor, `${JSON.stringify(marker, null, 2)}\n`, "utf8");
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
    renameSync(temporaryFile, lifecycleFile);
    renamed = true;
    fsyncParentDirectory(dirname(lifecycleFile));
  } finally {
    if (!renamed) {
      try {
        unlinkSync(temporaryFile);
      } catch {
        // The temp file may not have been created, or may already have been
        // removed. Preserve the original marker write error.
      }
    }
  }
};

const fsyncParentDirectory = (directory: string): void => {
  let descriptor: number | undefined;
  try {
    descriptor = openSync(directory, "r");
    fsyncSync(descriptor);
  } catch (error) {
    if (!isUnsupportedDirectoryFsync(error)) throw error;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
};

const isUnsupportedDirectoryFsync = (error: unknown): boolean =>
  isRecord(error) &&
  (error.code === "EINVAL" || error.code === "ENOTSUP" || error.code === "EISDIR");

export const writeEngineProcessStartedLifecycleMarkerSync = ({
  options,
  paths,
}: LifecycleStartContext): void => {
  const marker = createEngineProcessStartedLifecycleMarker({
    campaignId: options.campaignId,
    roundId: options.roundId,
    runId: options.runId,
    scenario: options.scenario,
    paths,
  });
  writeLifecycleMarkerAtomicSync(paths.lifecycleFile, marker);
};

const writeCompletedLifecycleMarker = async (run: TestRun): Promise<void> => {
  await writeLifecycleMarkerAtomic(run.lifecycleFile, createCompletedLifecycleMarker(run));
};

const toLifecycleCommon = (
  context: LifecycleMarkerContext,
  updatedAt: string,
): LifecycleCommon => ({
  schemaVersion: 1,
  artifactType: "recommendation-engine-test-lifecycle",
  campaignId: context.campaignId,
  roundId: context.roundId,
  runId: context.runId,
  scenario: context.scenario,
  processId: context.processId ?? process.pid,
  lifecycleFile: context.paths.lifecycleFile,
  resultFile: context.paths.resultFile,
  logFile: context.paths.logFile,
  eventsFile: context.paths.eventsFile,
  updatedAt,
});

export const verifyEventsArtifact = async (
  eventsFile: string,
  emittedEventCount: number,
): Promise<void> => {
  if (emittedEventCount === 0) return;

  let fileInfo;
  try {
    fileInfo = await lstat(eventsFile);
  } catch (error) {
    throw new Error(
      `Events artifact is missing after flush: ${eventsFile} (${toErrorMessage(error)})`,
    );
  }

  if (!fileInfo.isFile()) {
    throw new Error(`Events artifact is not a regular file after flush: ${eventsFile}`);
  }

  const persistedEventCount = (await readFile(eventsFile, "utf8"))
    .split("\n")
    .filter((line) => line.trim().length > 0).length;
  if (persistedEventCount !== emittedEventCount) {
    throw new Error(
      `Events artifact count mismatch after flush: emitted=${emittedEventCount}, persisted=${persistedEventCount}`,
    );
  }
};

export const toArtifactFailureRun = (run: TestRun, error: unknown): TestRun => ({
  ...run,
  status: "FAIL",
  errorCode: artifactWriteFailureCode,
  error: toErrorMessage(error),
});

export const createArtifactPaths = ({
  artifactDir,
  runName,
  campaignId,
  roundId,
  runId,
  now = new Date(),
  processId = process.pid,
}: {
  artifactDir: string;
  runName: string;
  campaignId?: string;
  roundId?: string;
  runId?: string;
  now?: Date;
  processId?: number;
}): TestArtifactPaths => {
  const identity = [campaignId, roundId && `round-${roundId}`, runId]
    .filter((value): value is string => Boolean(value))
    .join(".");
  const artifactPrefix = [`${formatDatePrefix(now)}-${processId}`, identity, runName]
    .filter(Boolean)
    .join(".");

  return {
    resultFile: join(artifactDir, `${artifactPrefix}.result.json`),
    logFile: join(artifactDir, `${artifactPrefix}.log.json`),
    eventsFile: join(artifactDir, `${artifactPrefix}.events.jsonl`),
    lifecycleFile: join(
      artifactDir,
      runId ? `${runId}.lifecycle.json` : `${artifactPrefix}.lifecycle.json`,
    ),
  };
};

const formatDatePrefix = (date: Date): string => {
  const pad = (value: number, length = 2): string => String(value).padStart(length, "0");
  return [
    [date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate())].join(""),
    [pad(date.getHours()), pad(date.getMinutes()), pad(date.getSeconds())].join(""),
    pad(date.getMilliseconds(), 3),
  ].join("-");
};

const printRun = (run: TestRun): void => {
  const marker = run.status === "PASS" ? "PASS" : "FAIL";
  console.log(`${marker} ${run.name} (${run.durationMs}ms) ${formatFlow(run)}`);
  console.log(`RESULT ${run.resultFile}`);
  console.log(`LOG ${run.logFile}`);
  console.log(`EVENTS ${run.eventsFile}`);
  console.log(`LIFECYCLE ${run.lifecycleFile}`);
  if (run.error) console.error(run.error);
};

const formatFlow = (run: TestRun): string => {
  const parts = [
    `candidates=${run.trace.generatedCandidates.length}`,
    `selected=${run.trace.selectedCandidateIds.length}`,
  ];
  appendNumber(parts, "recommendations", run.log.recommendationCount);
  if (typeof run.log.topItem === "string") parts.push(`top="${run.log.topItem}"`);
  if (run.trace.lastFailure) parts.push(`failure=${run.trace.lastFailure.phase}`);
  return parts.join(" ");
};

const appendNumber = (parts: string[], label: string, value: unknown): void => {
  if (typeof value === "number") parts.push(`${label}=${value}`);
};

const getRecommendationEngineSecretsFromEnv = (): RecommendationEngineSecrets => ({
  openAiApiKey: process.env.OPENAI_API_KEY,
  kakaoRestApiKey: process.env.KAKAO_REST_API_KEY,
  tmapAppKey: process.env.TMAP_APP_KEY,
  naverSearchClientId: process.env.NAVER_SEARCH_CLIENT_ID ?? process.env.NAVER_CLIENT_ID,
  naverSearchClientSecret:
    process.env.NAVER_SEARCH_CLIENT_SECRET ?? process.env.NAVER_CLIENT_SECRET,
});

export const toPublicRun = ({ result: _result, log: _log, ...run }: TestRun): TestRunPublicReport =>
  run;

export const toCliJsonEnvelope = (run: TestRun) => ({
  status: run.status,
  selected: [run.name],
  run: toPublicRun(run),
});

const writeJsonStdout = (value: unknown): void => {
  process.stdout.write(`${JSON.stringify(value)}\n`);
};

const getErrorResult = (error: unknown, input: UserInput): EngineOutput => {
  if (isRecord(error) && isEngineOutput(error.testResult)) {
    return error.testResult;
  }
  return {
    status: "ERROR",
    userInput: input,
    error: {
      code: testScriptFailureCode,
      message: error instanceof Error ? error.message : String(error),
    },
  };
};

const getErrorLog = (error: unknown): Record<string, unknown> => {
  if (isRecord(error) && isRecord(error.testLog)) return error.testLog;
  return {};
};

const createTestFailure = (
  message: string,
  result: EngineOutput,
  log: Record<string, unknown> = {},
): Error & { testResult: EngineOutput; testLog: Record<string, unknown> } => {
  const error = new Error(message) as Error & {
    testResult: EngineOutput;
    testLog: Record<string, unknown>;
  };
  error.testResult = result;
  error.testLog = log;
  return error;
};

const assertTest = (
  condition: unknown,
  message: string,
  result: EngineOutput,
  log: Record<string, unknown>,
): void => {
  if (!condition) throw createTestFailure(message, result, log);
};

const isEngineOutput = (value: unknown): value is EngineOutput =>
  EngineOutputSchema.safeParse(value).success;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const toErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export const createCliPreflightFailureEnvelope = (args: string[], error: unknown) => {
  const requestedScenario =
    args.find((arg) => arg.startsWith("--scenario="))?.slice("--scenario=".length) ??
    defaultTestScenarioName;
  const readRawValue = (name: string): string | undefined =>
    args.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1);

  return {
    status: "FAIL" as const,
    selected: [] as string[],
    run: {
      name:
        requestedScenario === defaultTestScenarioName
          ? testName
          : `${testName}-${requestedScenario}`,
      scenario: requestedScenario,
      campaignId: readRawValue("--campaign-id"),
      roundId: readRawValue("--round"),
      runId: readRawValue("--run-id"),
      status: "FAIL" as const,
      processStarted: false,
      engineStatus: "ERROR" as const,
      errorCode: testPreflightFailureCode,
      recommendationCount: 0,
      selectedItemIds: [] as string[],
      durationMs: 0,
      error: toErrorMessage(error),
    },
  };
};

const isMainModule = (): boolean => {
  const entryPoint = process.argv[1];
  return entryPoint !== undefined && resolve(entryPoint) === fileURLToPath(import.meta.url);
};

if (isMainModule()) {
  const args = process.argv.slice(2);
  void runCli(args).catch((error: unknown) => {
    console.error(error instanceof Error ? (error.stack ?? error.message) : error);
    if (args.includes("--json")) {
      writeJsonStdout(createCliPreflightFailureEnvelope(args, error));
    }
    process.exitCode = 1;
  });
}
