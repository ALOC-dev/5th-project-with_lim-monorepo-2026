import { createHash } from "node:crypto";

import { UserInputSchema } from "@monorepo/recommendation-engine/v1/contracts";

import {
  type CampaignScenarioDefinition,
  campaignScenarioDefinitions,
  edgeValidScenarioNames,
  fixedValidScenarioNames,
  getScenarioDefinition,
  SERVICE_RECOMMENDATION_TARGET,
  type TestScenarioName,
  unsupportedScenarioNames,
} from "./test/fixtures.js";

export const CAMPAIGN_ROUND_SIZE = 10;
export const CAMPAIGN_INITIAL_CONCURRENCY = 3;
export const CAMPAIGN_MAX_CONCURRENCY = 10;

export type InfrastructureProvider =
  | "OPENAI"
  | "TMAP"
  | "KAKAO"
  | "NAVER"
  | "BROWSER"
  | "UNKNOWN_PROVIDER"
  | "HARNESS";

export type CampaignInfrastructureSignal = {
  provider: Exclude<InfrastructureProvider, "HARNESS">;
  category: "TRANSPORT" | "AUTH" | "QUOTA" | "RESOURCE";
  explicitQuotaFailure: boolean;
  phase: string;
  dedupKey: string;
  message: string;
  occurrenceCount: number;
};

export type CampaignScenario = CampaignScenarioDefinition & {
  id: TestScenarioName;
};

export type SingleRunPublicReport = {
  name?: string;
  status: "PASS" | "FAIL";
  scenario: TestScenarioName;
  campaignId?: string;
  roundId?: string;
  runId?: string;
  processStarted: boolean;
  engineStatus?: "SUCCESS" | "ERROR";
  errorCode?: string;
  unsupportedReason?: "NONSENSE" | "NON_PLACE_REQUEST" | "CONTRADICTORY_REQUEST";
  engineErrorMessage?: string;
  recommendationCount?: number;
  selectedItemIds?: string[];
  infrastructureProvider?: string;
  explicitQuotaFailure?: boolean;
  infrastructureSignals?: CampaignInfrastructureSignal[];
  trace?: {
    infrastructureSignals?: CampaignInfrastructureSignal[];
    [key: string]: unknown;
  };
  durationMs?: number;
  expectedErrorCode?: string;
  error?: string;
  resultFile?: string;
  logFile?: string;
  eventsFile?: string;
  lifecycleFile?: string;
};

export type SingleRunJsonEnvelope = {
  status: "PASS" | "FAIL";
  selected: string[];
  run: SingleRunPublicReport;
};

export type RunClassification =
  | "NORMAL_SUCCESS"
  | "EXPECTED_REJECTION"
  | "PRODUCT_FAILURE"
  | "INFRA_FAILURE"
  | "NOT_COUNTED";

export type ClassifiedCampaignRun = {
  scenarioId: TestScenarioName;
  expected: CampaignScenarioDefinition["expected"];
  classification: RunClassification;
  engineStarted: boolean;
  provider?: string;
  explicitQuotaFailure: boolean;
  infrastructureSignals: CampaignInfrastructureSignal[];
  report: SingleRunPublicReport;
};

export type ManualQualityGrade = "PASS" | "WARN" | "FAIL";

export type ManualRunReview = {
  scenarioId: TestScenarioName;
  itemGrades: ManualQualityGrade[];
  hardDefectItemCount: number;
  topThreeHardDefectCount: number;
  manualQualityScore: number;
};

export type CampaignAggregate = {
  scheduledRuns: number;
  engineStartedRuns: number;
  notCountedRuns: number;
  normalExpectedRuns: number;
  normalSuccesses: number;
  expectedUnsupportedRuns: number;
  expectedRejections: number;
  productFailures: number;
  infrastructureFailures: number;
  infrastructureAffectedRuns: number;
  infrastructureAffectedRate: number | null;
  infrastructureProviderRunCounts: Record<string, number>;
  normalSuccessRate: number | null;
  unsupportedRejectionRate: number | null;
  infrastructureFailureRate: number | null;
  reviewedItems: number;
  qualityPassItems: number;
  qualityWarnItems: number;
  qualityFailItems: number;
  qualityPassRate: number | null;
  hardDefectItems: number;
  topThreeHardDefects: number;
};

export type ScenarioCampaignStats = {
  scenarioId: TestScenarioName;
  totalRuns: number;
  failedRuns: number;
  manualQualityScore?: number;
};

export type CircuitBreakerDecision =
  | { trip: false }
  | {
      trip: true;
      reason: "EXPLICIT_QUOTA_FAILURE" | "REPEATED_PROVIDER_FAILURE";
      provider: string;
    };

export const getRoundScenarioNames = (roundNumber: number): TestScenarioName[] => {
  if (!Number.isInteger(roundNumber) || roundNumber < 1 || roundNumber > 10) {
    throw new Error(`Campaign round must be an integer from 1 to 10: ${roundNumber}`);
  }

  const pairSlot = (((roundNumber - 1) % 5) + 1) as 1 | 2 | 3 | 4 | 5;
  const edgeNames = edgeValidScenarioNames.filter(
    (name) => getScenarioDefinition(name).pairSlot === pairSlot,
  );
  const unsupportedNames = unsupportedScenarioNames.filter(
    (name) => getScenarioDefinition(name).pairSlot === pairSlot,
  );
  const selected = [...fixedValidScenarioNames, ...edgeNames, ...unsupportedNames];

  if (edgeNames.length !== 2 || unsupportedNames.length !== 2 || selected.length !== 10) {
    throw new Error(
      `Campaign pair slot ${pairSlot} must contain 6 fixed, 2 edge-valid, and 2 unsupported scenarios`,
    );
  }

  return selected;
};

export const getRoundScenarios = (roundNumber: number): CampaignScenario[] =>
  getRoundScenarioNames(roundNumber).map(toCampaignScenario);

export const getFinalValidationScenarioNames = (
  stats: readonly ScenarioCampaignStats[],
): TestScenarioName[] => [
  ...fixedValidScenarioNames,
  ...selectWorstScenarioNames(edgeValidScenarioNames, stats, 2),
  ...selectWorstScenarioNames(unsupportedScenarioNames, stats, 2),
];

export const getFinalValidationScenarios = (
  stats: readonly ScenarioCampaignStats[],
): CampaignScenario[] => getFinalValidationScenarioNames(stats).map(toCampaignScenario);

export const getNextCampaignConcurrency = (
  currentConcurrency: number,
  infrastructureFailureCount: number,
): number => {
  const current = normalizeConcurrency(currentConcurrency);
  return infrastructureFailureCount > 0
    ? Math.max(1, Math.floor(current / 2))
    : Math.min(CAMPAIGN_MAX_CONCURRENCY, current + 1);
};

export const classifyCampaignRun = (
  report: SingleRunPublicReport,
  scenario: CampaignScenario,
): ClassifiedCampaignRun => {
  const infrastructureSignals = getReportInfrastructureSignals(report);
  if (!report.processStarted) {
    return {
      scenarioId: scenario.id,
      expected: scenario.expected,
      classification: "NOT_COUNTED",
      engineStarted: false,
      explicitQuotaFailure: false,
      infrastructureSignals: [],
      report,
    };
  }

  if (
    scenario.expected.kind === "SUCCESS" &&
    report.status === "PASS" &&
    report.engineStatus === "SUCCESS" &&
    report.recommendationCount === scenario.expected.recommendationCount &&
    hasExpectedUniqueItemIds(report.selectedItemIds, scenario.expected.recommendationCount)
  ) {
    return {
      scenarioId: scenario.id,
      expected: scenario.expected,
      classification: "NORMAL_SUCCESS",
      engineStarted: true,
      explicitQuotaFailure: infrastructureSignals.some(
        (signal) => signal.explicitQuotaFailure,
      ),
      infrastructureSignals,
      report,
    };
  }

  if (
    scenario.expected.kind === "UNSUPPORTED" &&
    report.status === "PASS" &&
    report.engineStatus === "ERROR" &&
    report.errorCode === scenario.expected.errorCode &&
    report.unsupportedReason === scenario.expected.reason
  ) {
    return {
      scenarioId: scenario.id,
      expected: scenario.expected,
      classification: "EXPECTED_REJECTION",
      engineStarted: true,
      explicitQuotaFailure: infrastructureSignals.some(
        (signal) => signal.explicitQuotaFailure,
      ),
      infrastructureSignals,
      report,
    };
  }

  const evidence = `${report.errorCode ?? ""} ${report.engineErrorMessage ?? ""} ${report.error ?? ""}`;
  const provider = detectInfrastructureProvider(evidence, report.infrastructureProvider);
  const explicitQuotaFailure =
    Boolean(report.explicitQuotaFailure) ||
    infrastructureSignals.some((signal) => signal.explicitQuotaFailure) ||
    hasExplicitQuotaSignal(evidence);
  if (provider) {
    return {
      scenarioId: scenario.id,
      expected: scenario.expected,
      classification: "INFRA_FAILURE",
      engineStarted: true,
      provider,
      explicitQuotaFailure,
      infrastructureSignals,
      report,
    };
  }

  return {
    scenarioId: scenario.id,
    expected: scenario.expected,
    classification: "PRODUCT_FAILURE",
    engineStarted: true,
    explicitQuotaFailure,
    infrastructureSignals,
    report,
  };
};

export const aggregateCampaignRuns = (
  runs: readonly ClassifiedCampaignRun[],
  reviews: readonly ManualRunReview[] = [],
): CampaignAggregate => {
  const engineStartedRuns = count(runs, (run) => run.engineStarted);
  const normalExpectedRuns = count(
    runs,
    (run) => run.engineStarted && run.expected.kind === "SUCCESS",
  );
  const expectedUnsupportedRuns = count(
    runs,
    (run) => run.engineStarted && run.expected.kind === "UNSUPPORTED",
  );
  const itemGrades = reviews.flatMap((review) => review.itemGrades);
  const qualityPassItems = itemGrades.filter((grade) => grade === "PASS").length;
  const infrastructureAffected = runs.filter(
    (run) =>
      run.engineStarted &&
      (run.classification === "INFRA_FAILURE" || run.infrastructureSignals.length > 0),
  );
  const infrastructureProviderRunCounts: Record<string, number> = {};
  for (const run of infrastructureAffected) {
    const providers = new Set([
      ...(run.provider ? [run.provider] : []),
      ...run.infrastructureSignals.map((signal) => signal.provider),
    ]);
    for (const provider of providers) {
      infrastructureProviderRunCounts[provider] =
        (infrastructureProviderRunCounts[provider] ?? 0) + 1;
    }
  }

  return {
    scheduledRuns: runs.length,
    engineStartedRuns,
    notCountedRuns: runs.length - engineStartedRuns,
    normalExpectedRuns,
    normalSuccesses: count(runs, (run) => run.classification === "NORMAL_SUCCESS"),
    expectedUnsupportedRuns,
    expectedRejections: count(runs, (run) => run.classification === "EXPECTED_REJECTION"),
    productFailures: count(runs, (run) => run.classification === "PRODUCT_FAILURE"),
    infrastructureFailures: count(runs, (run) => run.classification === "INFRA_FAILURE"),
    infrastructureAffectedRuns: infrastructureAffected.length,
    infrastructureAffectedRate: ratio(infrastructureAffected.length, engineStartedRuns),
    infrastructureProviderRunCounts,
    normalSuccessRate: ratio(
      count(runs, (run) => run.classification === "NORMAL_SUCCESS"),
      normalExpectedRuns,
    ),
    unsupportedRejectionRate: ratio(
      count(runs, (run) => run.classification === "EXPECTED_REJECTION"),
      expectedUnsupportedRuns,
    ),
    infrastructureFailureRate: ratio(
      count(runs, (run) => run.classification === "INFRA_FAILURE"),
      engineStartedRuns,
    ),
    reviewedItems: itemGrades.length,
    qualityPassItems,
    qualityWarnItems: itemGrades.filter((grade) => grade === "WARN").length,
    qualityFailItems: itemGrades.filter((grade) => grade === "FAIL").length,
    qualityPassRate: ratio(qualityPassItems, itemGrades.length),
    hardDefectItems: sum(reviews.map((review) => review.hardDefectItemCount)),
    topThreeHardDefects: sum(reviews.map((review) => review.topThreeHardDefectCount)),
  };
};

export const aggregateScenarioCampaignStats = (
  runs: readonly ClassifiedCampaignRun[],
  reviews: readonly ManualRunReview[] = [],
): ScenarioCampaignStats[] => {
  const reviewsByScenario = new Map<TestScenarioName, ManualRunReview[]>();
  for (const review of reviews) {
    const existing = reviewsByScenario.get(review.scenarioId) ?? [];
    existing.push(review);
    reviewsByScenario.set(review.scenarioId, existing);
  }

  return (Object.keys(campaignScenarioDefinitions) as TestScenarioName[]).map(
    (scenarioId) => {
      const countedRuns = runs.filter(
        (run) => run.scenarioId === scenarioId && run.engineStarted,
      );
      const scenarioReviews = reviewsByScenario.get(scenarioId) ?? [];
      return {
        scenarioId,
        totalRuns: countedRuns.length,
        failedRuns: countedRuns.filter(
          (run) =>
            run.classification !== "NORMAL_SUCCESS" &&
            run.classification !== "EXPECTED_REJECTION",
        ).length,
        manualQualityScore:
          scenarioReviews.length === 0
            ? getScenarioDefinition(scenarioId).manualQualityScore
            : average(scenarioReviews.map((review) => review.manualQualityScore)),
      };
    },
  );
};

export const evaluateCircuitBreaker = (
  runs: readonly ClassifiedCampaignRun[],
): CircuitBreakerDecision => {
  const failureCounts = new Map<string, number>();
  for (const run of runs) {
    if (!run.engineStarted) continue;
    const providers = new Set<string>();
    if (run.classification === "INFRA_FAILURE" && run.provider) {
      providers.add(run.provider);
      if (run.explicitQuotaFailure) {
        return {
          trip: true,
          reason: "EXPLICIT_QUOTA_FAILURE",
          provider: run.provider,
        };
      }
    }
    for (const signal of run.infrastructureSignals) {
      providers.add(signal.provider);
      if (signal.explicitQuotaFailure) {
        return {
          trip: true,
          reason: "EXPLICIT_QUOTA_FAILURE",
          provider: signal.provider,
        };
      }
    }
    for (const provider of providers) {
      const nextCount = (failureCounts.get(provider) ?? 0) + 1;
      if (nextCount < 2) {
        failureCounts.set(provider, nextCount);
        continue;
      }
      return {
        trip: true,
        reason: "REPEATED_PROVIDER_FAILURE",
        provider,
      };
    }
  }

  return { trip: false };
};

export const parseSingleRunJson = (stdout: string): SingleRunJsonEnvelope => {
  const value: unknown = JSON.parse(stdout.trim());
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 3 ||
    !Object.prototype.hasOwnProperty.call(value, "status") ||
    !Object.prototype.hasOwnProperty.call(value, "selected") ||
    !Object.prototype.hasOwnProperty.call(value, "run") ||
    !isStatus(value.status) ||
    !Array.isArray(value.selected) ||
    !value.selected.every(isString)
  ) {
    throw new Error("Single-run CLI stdout is not a valid JSON envelope");
  }
  if (!isRecord(value.run) || !isSingleRunPublicReport(value.run)) {
    throw new Error("Single-run CLI JSON envelope does not contain a valid run report");
  }
  if (value.status !== value.run.status) {
    throw new Error("Single-run CLI envelope status does not match its run report");
  }
  return {
    status: value.status,
    selected: value.selected,
    run: value.run,
  };
};

export const createScenarioFingerprint = (
  scenarioNames: readonly TestScenarioName[],
): string => {
  const source = scenarioNames.map((name) => ({
    id: name,
    definition: campaignScenarioDefinitions[name],
  }));
  return createHash("sha256").update(JSON.stringify(source)).digest("hex");
};

/** @deprecated Prefer createScenarioFingerprint; source files are fingerprinted separately. */
export const createCampaignSourceFingerprint = createScenarioFingerprint;

const toCampaignScenario = (id: TestScenarioName): CampaignScenario => ({
  id,
  ...getScenarioDefinition(id),
});

const selectWorstScenarioNames = (
  candidates: readonly TestScenarioName[],
  stats: readonly ScenarioCampaignStats[],
  limit: number,
): TestScenarioName[] => {
  const statsById = new Map(stats.map((item) => [item.scenarioId, item]));
  return [...candidates]
    .sort((left, right) => {
      const leftDefinition = getScenarioDefinition(left);
      const rightDefinition = getScenarioDefinition(right);
      const leftStats = statsById.get(left);
      const rightStats = statsById.get(right);
      const failureRateDifference =
        getFailureRate(rightStats) - getFailureRate(leftStats);
      if (failureRateDifference !== 0) return failureRateDifference;

      const manualScoreDifference =
        (leftStats?.manualQualityScore ?? leftDefinition.manualQualityScore) -
        (rightStats?.manualQualityScore ?? rightDefinition.manualQualityScore);
      if (manualScoreDifference !== 0) return manualScoreDifference;
      return compareStableIds(left, right);
    })
    .slice(0, limit);
};

const getFailureRate = (stats: ScenarioCampaignStats | undefined): number => {
  if (!stats || stats.totalRuns <= 0) return 0;
  return stats.failedRuns / stats.totalRuns;
};

const detectInfrastructureProvider = (
  evidence: string,
  reportedProvider?: string,
): string | undefined => {
  const normalized = evidence.toUpperCase();
  if (
    /TEST_ARTIFACT_WRITE_FAILURE|CAMPAIGN_CHILD_(?:PROTOCOL_FAILURE|EXIT_MISMATCH|TIMEOUT_AFTER_ENGINE_START|CRASH_AFTER_ENGINE_START)|CAMPAIGN_(?:STALE_LIFECYCLE_INVALID|LIFECYCLE_REPORT_MISMATCH)/.test(
      normalized,
    )
  ) return "HARNESS";
  if (/DISCOVER_SEEDS_PROVIDER_ERROR/.test(normalized)) return "TMAP";

  const productDefect =
    /NO\s*OBJECT\s*GENERATED|NOOBJECTGENERATED|INVALID\s+(?:SCHEMA|INPUT)|VALIDATION|\bZOD\b|\bPARSE(?:R|D|\s|_)|CONTENT\s*FILTER|SCORING\s+PRODUCED\s+NO\s+USABLE\s+EVALUATION/.test(
      normalized,
    );
  if (productDefect) return undefined;

  const transportOrAuth =
    /\b429\b|QUOTA|RATE.?LIMIT|\b408\b|TIMEOUT|ETIMEDOUT|ECONN|ENOTFOUND|FETCH FAILED|\b401\b|\b403\b|\b5\d\d\b|SERVICE UNAVAILABLE|UNAUTHORIZED|AUTHENTICATION|API KEY/.test(
      normalized,
    );
  if (/(?:OPENAI|LLM|MODEL_PROVIDER|DISCOVER_SEEDS_(?:PLAN|INTENT))/.test(normalized)) {
    if (transportOrAuth) return "OPENAI";
    return undefined;
  }
  const namedProviderPatterns: readonly [InfrastructureProvider, RegExp][] = [
    ["TMAP", /TMAP/],
    ["KAKAO", /KAKAO/],
    ["NAVER", /NAVER/],
    ["BROWSER", /BROWSER|PLAYWRIGHT|CHROMIUM/],
  ];
  const matched = namedProviderPatterns.find(([, pattern]) => pattern.test(normalized));
  if (matched && transportOrAuth) return matched[0];
  if (reportedProvider && transportOrAuth) return reportedProvider;
  if (transportOrAuth || /PROVIDER|EXTERNAL_API/.test(normalized)) {
    return "UNKNOWN_PROVIDER";
  }
  return undefined;
};

const hasExplicitQuotaSignal = (evidence: string): boolean =>
  /\b429\b|QUOTA|RATE.?LIMIT/.test(evidence.toUpperCase());

const getReportInfrastructureSignals = (
  report: SingleRunPublicReport,
): CampaignInfrastructureSignal[] => {
  const candidates = report.infrastructureSignals ?? report.trace?.infrastructureSignals ?? [];
  const unique = new Map<string, CampaignInfrastructureSignal>();
  for (const signal of candidates) {
    if (!isCampaignInfrastructureSignal(signal)) continue;
    const key = `${signal.provider}\0${signal.category}\0${signal.dedupKey}`;
    if (!unique.has(key)) unique.set(key, signal);
  }
  return [...unique.values()];
};

const isCampaignInfrastructureSignal = (
  value: unknown,
): value is CampaignInfrastructureSignal =>
  isRecord(value) &&
  (value.provider === "OPENAI" ||
    value.provider === "TMAP" ||
    value.provider === "KAKAO" ||
    value.provider === "NAVER" ||
    value.provider === "BROWSER" ||
    value.provider === "UNKNOWN_PROVIDER") &&
  (value.category === "TRANSPORT" ||
    value.category === "AUTH" ||
    value.category === "QUOTA" ||
    value.category === "RESOURCE") &&
  typeof value.explicitQuotaFailure === "boolean" &&
  typeof value.phase === "string" &&
  typeof value.dedupKey === "string" &&
  typeof value.message === "string" &&
  Number.isInteger(value.occurrenceCount) &&
  (value.occurrenceCount as number) > 0;

const hasExpectedUniqueItemIds = (
  itemIds: string[] | undefined,
  expectedCount: number,
): boolean =>
  itemIds !== undefined &&
  itemIds.length === expectedCount &&
  new Set(itemIds).size === expectedCount &&
  itemIds.every((itemId) => itemId.trim().length > 0);

const normalizeConcurrency = (value: number): number => {
  if (!Number.isInteger(value) || value < 1 || value > CAMPAIGN_MAX_CONCURRENCY) {
    throw new Error(`Concurrency must be an integer from 1 to ${CAMPAIGN_MAX_CONCURRENCY}`);
  }
  return value;
};

const ratio = (numerator: number, denominator: number): number | null =>
  denominator === 0 ? null : numerator / denominator;

const count = <T>(items: readonly T[], predicate: (item: T) => boolean): number =>
  items.filter(predicate).length;

const sum = (values: readonly number[]): number =>
  values.reduce((total, value) => total + value, 0);

const average = (values: readonly number[]): number =>
  values.length === 0 ? 0 : sum(values) / values.length;

const compareStableIds = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isString = (value: unknown): value is string => typeof value === "string";

const isStatus = (value: unknown): value is "PASS" | "FAIL" =>
  value === "PASS" || value === "FAIL";

const isSingleRunPublicReport = (value: Record<string, unknown>): value is SingleRunPublicReport =>
  isStatus(value.status) &&
  typeof value.scenario === "string" &&
  Object.prototype.hasOwnProperty.call(campaignScenarioDefinitions, value.scenario) &&
  typeof value.processStarted === "boolean" &&
  (value.engineStatus === undefined ||
    value.engineStatus === "SUCCESS" ||
    value.engineStatus === "ERROR") &&
  (value.errorCode === undefined || typeof value.errorCode === "string") &&
  (value.unsupportedReason === undefined ||
    value.unsupportedReason === "NONSENSE" ||
    value.unsupportedReason === "NON_PLACE_REQUEST" ||
    value.unsupportedReason === "CONTRADICTORY_REQUEST") &&
  (value.engineErrorMessage === undefined ||
    typeof value.engineErrorMessage === "string") &&
  (value.recommendationCount === undefined || typeof value.recommendationCount === "number") &&
  (value.selectedItemIds === undefined ||
    (Array.isArray(value.selectedItemIds) && value.selectedItemIds.every(isString))) &&
  (value.infrastructureProvider === undefined ||
    typeof value.infrastructureProvider === "string") &&
  (value.explicitQuotaFailure === undefined ||
    typeof value.explicitQuotaFailure === "boolean") &&
  (value.infrastructureSignals === undefined ||
    (Array.isArray(value.infrastructureSignals) &&
      value.infrastructureSignals.every(isCampaignInfrastructureSignal))) &&
  (value.trace === undefined ||
    (isRecord(value.trace) &&
      (value.trace.infrastructureSignals === undefined ||
        (Array.isArray(value.trace.infrastructureSignals) &&
          value.trace.infrastructureSignals.every(isCampaignInfrastructureSignal)))));

export const assertCampaignFixturesValid = (): void => {
  for (const [name, definition] of Object.entries(campaignScenarioDefinitions)) {
    const result = UserInputSchema.safeParse(definition.input);
    if (!result.success) {
      throw new Error(`Invalid campaign fixture ${name}: ${result.error.message}`);
    }
  }
  for (let roundNumber = 1; roundNumber <= 10; roundNumber += 1) {
    getRoundScenarioNames(roundNumber);
  }
  if (SERVICE_RECOMMENDATION_TARGET !== 5) {
    throw new Error(
      `Campaign requires the service recommendation target to be 5, received ${SERVICE_RECOMMENDATION_TARGET}`,
    );
  }
};
