import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
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
import { testMonitor, type TestTraceSummary } from "./test/monitoring.js";

const logDir = join(dirname(fileURLToPath(import.meta.url)), ".log");
const testName = "test";

type TestExecution = {
  result: EngineOutput;
  log: Record<string, unknown>;
};

type TestRun = {
  name: string;
  scenario: TestScenarioName;
  status: "PASS" | "FAIL";
  durationMs: number;
  result: EngineOutput;
  log: Record<string, unknown>;
  trace: TestTraceSummary;
  resultFile: string;
  logFile: string;
  eventsFile: string;
  error?: string;
};

const runCli = async (args = process.argv.slice(2)): Promise<void> => {
  const json = args.includes("--json");
  validateArgs(args);
  const scenarioName = parseScenarioName(args);
  const input = UserInputSchema.parse(getTestScenarioInput(scenarioName));
  await mkdir(logDir, { recursive: true });

  const run = await runEngineTest(scenarioName, input, args.includes("--verbose"));
  await writeRunFiles(run);
  printRun(run);

  if (json) {
    console.log(
      JSON.stringify(
        {
          status: run.status,
          selected: [run.name],
          run: toPublicRun(run),
        },
        null,
        2,
      ),
    );
  }
  if (run.status === "FAIL") process.exitCode = 1;
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
};

const parseScenarioName = (args: string[]): TestScenarioName => {
  const scenarioArg = args.find((arg) => arg.startsWith("--scenario="));
  if (!scenarioArg) return defaultTestScenarioName;
  return parseTestScenarioName(scenarioArg.slice("--scenario=".length));
};

const runEngineTest = async (
  scenarioName: TestScenarioName,
  input: UserInput,
  verbose: boolean,
): Promise<TestRun> => {
  const runName =
    scenarioName === defaultTestScenarioName ? testName : `${testName}-${scenarioName}`;
  testMonitor.startCheck(runName);
  const start = performance.now();
  const artifactPrefix = `${formatDatePrefix(new Date())}.${runName}`;
  const resultFile = join(logDir, `${artifactPrefix}.result.json`);
  const logFile = join(logDir, `${artifactPrefix}.log.json`);
  const eventsFile = join(logDir, `${artifactPrefix}.events.jsonl`);

  // 이벤트를 발생 즉시 파일로 흘려보낸다. 요약 파일(`.log.json`)은 실행이 끝나야
  // 쓰이므로, 중간에 끊거나 크래시하면 예전에는 터미널 말고 남는 게 없었다.
  testMonitor.configure({ eventsFile, verbose });
  console.log(`EVENTS ${eventsFile}`);

  try {
    const execution = await executeEngineTest(input, scenarioName);
    return toRun(execution, runName, scenarioName, start, resultFile, logFile, eventsFile);
  } catch (error) {
    return toFailedRun(
      error,
      runName,
      scenarioName,
      input,
      start,
      resultFile,
      logFile,
      eventsFile,
    );
  }
};

const executeEngineTest = async (
  input: UserInput,
  scenarioName: TestScenarioName,
): Promise<TestExecution> => {
  const engine = new RecommendationEngine(input, testConfig, {
    logger: testMonitor.logger,
    secrets: getRecommendationEngineSecretsFromEnv(),
  });
  const result = EngineOutputSchema.parse(await engine.process());

  if (result.status !== "SUCCESS") {
    throw createTestFailure("engine process should succeed", result);
  }
  const log = {
    scenario: scenarioName,
    input,
    config: testConfig,
    parameterSource: testParameterSource,
    status: result.status,
    recommendationCount: result.userOutput.recommendations.length,
    selectedItemIds: result.userOutput.recommendations.map((item) => item.id),
    topItem: result.userOutput.recommendations[0]?.name,
  };

  assertTest(
    result.userOutput.recommendations.length === testConfig.targetCount,
    "target recommendation count mismatch",
    result,
    log,
  );

  return {
    result,
    log,
  };
};

const toRun = (
  execution: TestExecution,
  name: string,
  scenario: TestScenarioName,
  start: number,
  resultFile: string,
  logFile: string,
  eventsFile: string,
): TestRun => ({
  name,
  scenario,
  status: "PASS",
  durationMs: Math.round(performance.now() - start),
  result: execution.result,
  log: execution.log,
  trace: testMonitor.getSummary(),
  resultFile,
  logFile,
  eventsFile,
});

const toFailedRun = (
  error: unknown,
  name: string,
  scenario: TestScenarioName,
  input: UserInput,
  start: number,
  resultFile: string,
  logFile: string,
  eventsFile: string,
): TestRun => ({
  name,
  scenario,
  status: "FAIL",
  durationMs: Math.round(performance.now() - start),
  result: getErrorResult(error, input),
  log: getErrorLog(error),
  trace: testMonitor.getSummary(),
  resultFile,
  logFile,
  eventsFile,
  error: error instanceof Error ? error.message : String(error),
});

const writeRunFiles = async (run: TestRun): Promise<void> => {
  await Promise.all([
    writeJson(run.resultFile, run.result),
    writeJson(run.logFile, {
      schemaVersion: 1,
      artifactType: "recommendation-engine-test-log",
      name: run.name,
      status: run.status,
      durationMs: run.durationMs,
      generatedAt: new Date().toISOString(),
      log: run.log,
      trace: run.trace,
      // 전체 이벤트는 실행 중에 `.events.jsonl`로 스트리밍된다. 여기 또 담으면
      // 같은 내용이 두 벌이 되고 파일이 수 MB로 불어난다.
      eventCount: testMonitor.getEvents().length,
      error: run.error,
      resultFile: run.resultFile,
      logFile: run.logFile,
      eventsFile: run.eventsFile,
    }),
  ]);
};

const writeJson = async (filePath: string, value: unknown): Promise<void> => {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
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

const toPublicRun = ({
  result: _result,
  log: _log,
  ...run
}: TestRun): Omit<TestRun, "result" | "log"> => run;

const getErrorResult = (error: unknown, input: UserInput): EngineOutput => {
  if (isRecord(error) && isEngineOutput(error.testResult)) {
    return error.testResult;
  }
  return {
    status: "ERROR",
    userInput: input,
    error: {
      code: "TEST_SCRIPT_FAILURE",
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

runCli().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : error);
  process.exitCode = 1;
});
