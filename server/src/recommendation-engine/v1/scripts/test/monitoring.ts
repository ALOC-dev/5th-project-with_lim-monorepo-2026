import {
  createLogger,
  type LogEvent,
  type Logger,
} from "../../observability/logger.js";

type CandidateTrace = {
  attemptNo?: number;
  candidateId: string;
  name?: string;
  category?: string;
  roadAddress?: string;
  address?: string;
};

type FailureTrace = {
  ts: string;
  level: LogEvent["level"];
  phase: string;
  attemptNo?: number;
  retryNo?: number;
  data?: Record<string, unknown>;
  error?: LogEvent["error"];
};

export type TestTraceSummary = {
  eventCount: number;
  phases: Record<string, number>;
  generatedCandidates: CandidateTrace[];
  enrichmentVerifications: unknown[];
  rejectedCandidates: unknown[];
  selectedCandidateIds: string[];
  needsMoreSeeds: unknown[];
  failures: FailureTrace[];
  lastFailure?: FailureTrace;
};

type TraceEvent = LogEvent & {
  checkName?: string;
};

class TestMonitor {
  private checkName: string | undefined;
  private readonly events: TraceEvent[] = [];

  readonly logger: Logger = createLogger((event) => {
    this.events.push({
      ...event,
      ...(this.checkName ? { checkName: this.checkName } : {}),
    });
    console.error(JSON.stringify(toLiveTraceLine(event)));
  });

  startCheck(checkName: string): void {
    this.checkName = checkName;
    this.events.length = 0;
  }

  getEvents(): TraceEvent[] {
    return [...this.events];
  }

  getSummary(): TestTraceSummary {
    return summarizeTrace(this.events);
  }
}

export const testMonitor = new TestMonitor();
export const testLogger = testMonitor.logger;

const summarizeTrace = (events: TraceEvent[]): TestTraceSummary => {
  const phases: Record<string, number> = {};
  const generatedCandidates: CandidateTrace[] = [];
  const enrichmentVerifications: unknown[] = [];
  const rejectedCandidates: unknown[] = [];
  const selectedCandidateIds: string[] = [];
  const needsMoreSeeds: unknown[] = [];
  const failures: FailureTrace[] = [];

  for (const event of events) {
    phases[event.phase] = (phases[event.phase] ?? 0) + 1;

    if (event.phase === "discoverSeeds.discover.result") {
      generatedCandidates.push(...extractCandidates(event));
    }

    if (event.phase === "evaluateSeeds.enrichment.success") {
      const verifications = event.data?.verifications;
      if (Array.isArray(verifications)) {
        enrichmentVerifications.push(...verifications);
      }
      const rejected = event.data?.rejected;
      if (Array.isArray(rejected)) rejectedCandidates.push(...rejected);
    }

    if (event.phase === "evaluateSeeds.semantic_gate.filtered") {
      const rejected = event.data?.rejected;
      if (Array.isArray(rejected)) rejectedCandidates.push(...rejected);
    }

    if (event.phase === "evaluateSeeds.ranking.selected") {
      const ids = event.data?.selectedCandidateIds;
      if (Array.isArray(ids)) {
        selectedCandidateIds.push(...ids.filter(isString));
      }
    }

    if (event.phase.includes("needs_more_seeds")) {
      needsMoreSeeds.push({
        phase: event.phase,
        attemptNo: event.attemptNo,
        data: event.data,
      });
    }

    if (
      event.level === "error" ||
      event.phase.includes("failure") ||
      event.phase.includes("needs_more_seeds")
    ) {
      failures.push(toFailureTrace(event));
    }
  }

  return {
    eventCount: events.length,
    phases,
    generatedCandidates,
    enrichmentVerifications,
    rejectedCandidates,
    selectedCandidateIds,
    needsMoreSeeds,
    failures,
    lastFailure: failures[failures.length - 1],
  };
};

const extractCandidates = (event: TraceEvent): CandidateTrace[] => {
  const output = event.data?.output;
  if (!isRecord(output)) return [];

  const seeds = output.seeds;
  const seedKeys = output.seedKeys;
  if (!Array.isArray(seeds)) return [];

  return seeds.filter(isRecord).map((seed, index) => ({
    attemptNo: event.attemptNo,
    candidateId:
      Array.isArray(seedKeys) && isString(seedKeys[index])
        ? seedKeys[index]
        : `seed-${index}`,
    name: isString(seed.name) ? seed.name : undefined,
    category: isString(seed.category) ? seed.category : undefined,
    roadAddress: isString(seed.roadAddress) ? seed.roadAddress : undefined,
    address: isString(seed.address) ? seed.address : undefined,
  }));
};

const toFailureTrace = (event: TraceEvent): FailureTrace => ({
  ts: event.ts,
  level: event.level,
  phase: event.phase,
  attemptNo: event.attemptNo,
  retryNo: event.retryNo,
  data: event.data,
  error: event.error,
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isString = (value: unknown): value is string =>
  typeof value === "string";

const toLiveTraceLine = (event: LogEvent): Record<string, unknown> => ({
  ts: event.ts,
  level: event.level,
  phase: event.phase,
  attemptNo: event.attemptNo,
  retryNo: event.retryNo,
  durationMs: event.durationMs,
  data: summarizeLiveData(event.data),
  error: event.error,
});

const summarizeLiveData = (
  data: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined => {
  if (!data) return undefined;
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [key, summarizeLiveValue(value)]),
  );
};

const summarizeLiveValue = (value: unknown): unknown => {
  if (typeof value === "string") return value.slice(0, 300);
  if (Array.isArray(value)) return value.slice(0, 8).map(summarizeLiveValue);
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 12)
        .map(([key, child]) => [key, summarizeLiveValue(child)]),
    );
  }
  return value;
};
