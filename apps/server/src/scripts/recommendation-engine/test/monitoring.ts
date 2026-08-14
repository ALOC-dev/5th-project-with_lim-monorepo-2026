import {
  createJsonlFileSink,
  createLogger,
  type FlushableLogSink,
  type LogEvent,
  type Logger,
} from "@monorepo/recommendation-engine";

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

export type InfrastructureProvider =
  | "OPENAI"
  | "TMAP"
  | "KAKAO"
  | "NAVER"
  | "BROWSER"
  | "UNKNOWN_PROVIDER";

export type InfrastructureSignalCategory = "TRANSPORT" | "AUTH" | "QUOTA" | "RESOURCE";

export type TestInfrastructureSignal = {
  provider: InfrastructureProvider;
  category: InfrastructureSignalCategory;
  explicitQuotaFailure: boolean;
  phase: string;
  dedupKey: string;
  message: string;
  occurrenceCount: number;
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
  infrastructureSignals: TestInfrastructureSignal[];
  lastFailure?: FailureTrace;
  unsupportedReason?: UnsupportedRequestReason;
};

export type UnsupportedRequestReason = "NONSENSE" | "NON_PLACE_REQUEST" | "CONTRADICTORY_REQUEST";

type TraceEvent = LogEvent & {
  checkName?: string;
};

/**
 * 터미널에 항상 보여줄 이벤트.
 *
 * 예전에는 모든 이벤트를 stderr로 쏟아내서 실제 진행 상황이 파묻혔다. 전체 이벤트는
 * 파일로 흘려보내고 터미널에는 단계 경계와 문제만 남긴다. `--verbose`로 되돌릴 수 있다.
 */
const isProgressEvent = (event: LogEvent): boolean =>
  event.level === "warn" ||
  event.level === "error" ||
  event.phase.endsWith(".success") ||
  event.phase.endsWith(".start");

export type TestMonitorContext = {
  campaignId?: string;
  roundId?: string;
  runId?: string;
};

export class TestMonitor {
  private checkName: string | undefined;
  private readonly events: TraceEvent[] = [];
  private eventContext: Record<string, string> = {};
  private fileSink: FlushableLogSink | undefined;
  private verbose = false;

  readonly logger: Logger = createLogger((event) => {
    const traceEvent: TraceEvent = {
      ...event,
      ...(Object.keys(this.eventContext).length > 0
        ? { context: { ...(event.context ?? {}), ...this.eventContext } }
        : {}),
      ...(this.checkName ? { checkName: this.checkName } : {}),
    };
    this.events.push(traceEvent);
    // 파일에는 항상 전체 이벤트를 남긴다. 발생 즉시 append하므로 중간에 끊기거나
    // 크래시해도 그때까지의 기록이 보존된다.
    this.fileSink?.(traceEvent);
    if (this.verbose || isProgressEvent(event)) {
      console.error(JSON.stringify(toLiveTraceLine(traceEvent)));
    }
  });

  /** 실행마다 이벤트 스트림 파일과 터미널 상세도를 설정한다. */
  configure({
    eventsFile,
    verbose,
    context,
  }: {
    eventsFile?: string;
    verbose?: boolean;
    context?: TestMonitorContext;
  }): void {
    this.fileSink = eventsFile ? createJsonlFileSink(eventsFile) : undefined;
    this.verbose = verbose ?? false;
    this.eventContext = Object.fromEntries(
      Object.entries(context ?? {}).filter((entry): entry is [string, string] => {
        return typeof entry[1] === "string";
      }),
    );
  }

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

  /** 짧게 실행되는 CLI가 종료되기 전에 파일 쓰기 큐를 비운다. */
  async flush(): Promise<void> {
    await this.fileSink?.flush();
  }

  async drain(): Promise<void> {
    await this.flush();
  }
}

export const createTestMonitor = (): TestMonitor => new TestMonitor();
export const testMonitor = new TestMonitor();
export const testLogger = testMonitor.logger;

const pushUnknownArrayItems = (target: unknown[], value: unknown) => {
  if (!Array.isArray(value)) {
    return;
  }

  target.push(...(value as unknown[]));
};

const summarizeTrace = (events: TraceEvent[]): TestTraceSummary => {
  const phases: Record<string, number> = {};
  const generatedCandidates: CandidateTrace[] = [];
  const enrichmentVerifications: unknown[] = [];
  const rejectedCandidates: unknown[] = [];
  const selectedCandidateIds: string[] = [];
  const needsMoreSeeds: unknown[] = [];
  const failures: FailureTrace[] = [];
  const infrastructureSignals = new Map<string, TestInfrastructureSignal>();
  const dedicatedInfrastructureProviders = new Set<InfrastructureProvider>();
  let unsupportedReason: UnsupportedRequestReason | undefined;

  for (const event of events) {
    phases[event.phase] = (phases[event.phase] ?? 0) + 1;

    if (event.phase === "discoverSeeds.discover.result") {
      generatedCandidates.push(...extractCandidates(event));
    }

    if (event.phase === "evaluateSeeds.enrichment.success") {
      pushUnknownArrayItems(enrichmentVerifications, event.data?.verifications);
      pushUnknownArrayItems(rejectedCandidates, event.data?.rejected);
    }

    if (event.phase === "evaluateSeeds.semantic_gate.filtered") {
      pushUnknownArrayItems(rejectedCandidates, event.data?.rejected);
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

    if (event.phase === "engine.unsupported_request") {
      const reason = event.data?.reason;
      if (isUnsupportedRequestReason(reason)) unsupportedReason = reason;
    }

    if (
      event.level === "error" ||
      event.phase.includes("failure") ||
      event.phase.includes("needs_more_seeds")
    ) {
      failures.push(toFailureTrace(event));
    }

    for (const signal of extractInfrastructureSignals(event)) {
      // A provider/tool event is the root occurrence. Its later step-level catch
      // is propagation of the same error and must not inflate occurrenceCount.
      if (
        isPropagatedInfrastructurePhase(event.phase) &&
        dedicatedInfrastructureProviders.has(signal.provider)
      ) {
        continue;
      }
      if (isDedicatedInfrastructurePhase(event.phase)) {
        dedicatedInfrastructureProviders.add(signal.provider);
      }

      const existing = infrastructureSignals.get(signal.dedupKey);
      if (existing) {
        infrastructureSignals.set(signal.dedupKey, {
          ...existing,
          explicitQuotaFailure: existing.explicitQuotaFailure || signal.explicitQuotaFailure,
          occurrenceCount: existing.occurrenceCount + signal.occurrenceCount,
        });
      } else {
        infrastructureSignals.set(signal.dedupKey, signal);
      }
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
    infrastructureSignals: [...infrastructureSignals.values()],
    lastFailure: failures[failures.length - 1],
    unsupportedReason,
  };
};

const extractInfrastructureSignals = (event: TraceEvent): TestInfrastructureSignal[] => {
  if (!isInfrastructureEventPhase(event)) return [];

  const rawMessages = extractInfrastructureMessages(event);
  const providerErrorCode = event.data?.errorCode === "DISCOVER_SEEDS_PROVIDER_ERROR";
  const explicitlyRejectedProviderCall =
    event.phase === "discoverSeeds.provider.partial_failure" ||
    event.phase === "discoverSeeds.provider.total_failure" ||
    providerErrorCode;

  // Provider query rejection itself is a structured transport signal. Other
  // failure events must still carry a recognisable infrastructure signature so
  // malformed model output and ordinary missing evidence do not inflate infra.
  if (rawMessages.length === 0 && !explicitlyRejectedProviderCall) return [];

  const messages = rawMessages.length > 0 ? rawMessages : ["TMAP provider request rejected"];
  return messages.flatMap((rawMessage) => {
    const provider = inferInfrastructureProvider(event, rawMessage);
    const category = classifyInfrastructureCategory(rawMessage, provider);
    const effectiveCategory =
      category ?? (explicitlyRejectedProviderCall ? "TRANSPORT" : undefined);
    if (!effectiveCategory) return [];

    const explicitQuotaFailure = hasExplicitQuotaSignal(rawMessage);
    const message = sanitizeInfrastructureMessage(rawMessage);
    const dedupKey = buildInfrastructureDedupKey(provider, effectiveCategory);
    return [
      {
        provider,
        category: effectiveCategory,
        explicitQuotaFailure,
        phase: event.phase,
        dedupKey,
        message,
        occurrenceCount: 1,
      },
    ];
  });
};

const isDedicatedInfrastructurePhase = (phase: string): boolean =>
  phase.startsWith("discoverSeeds.provider.") ||
  /^evaluateSeeds\.enrichment\.tool\.[^.]+\.failure$/u.test(phase) ||
  phase === "evaluateSeeds.enrichment.agentic_candidate.failure" ||
  phase === "evaluateSeeds.enrichment.operation_hours_llm.failure";

const isPropagatedInfrastructurePhase = (phase: string): boolean =>
  phase === "discoverSeeds.discover.failure" || phase === "evaluateSeeds.enrichment.failure";

const isInfrastructureEventPhase = (event: TraceEvent): boolean => {
  if (
    event.phase === "discoverSeeds.provider.partial_failure" ||
    event.phase === "discoverSeeds.provider.total_failure" ||
    event.phase === "discoverSeeds.discover.failure" ||
    event.phase === "evaluateSeeds.enrichment.agentic_candidate.failure" ||
    event.phase === "evaluateSeeds.enrichment.operation_hours_llm.failure" ||
    event.phase === "evaluateSeeds.enrichment.failure" ||
    event.phase === "evaluateSeeds.llm_scoring.failure"
  ) {
    return true;
  }

  return /^evaluateSeeds\.enrichment\.tool\.[^.]+\.failure$/u.test(event.phase);
};

const extractInfrastructureMessages = (event: TraceEvent): string[] => {
  const messages: string[] = [];
  if (event.error) messages.push(`${event.error.name}: ${event.error.message}`);

  for (const key of ["message", "errorMessage", "errorReason"] as const) {
    const value = event.data?.[key];
    if (isString(value)) messages.push(value);
  }

  const errors = event.data?.errors;
  if (Array.isArray(errors)) {
    for (const error of errors) {
      if (isString(error)) messages.push(error);
      else if (isRecord(error) && isString(error.message)) {
        messages.push(isString(error.name) ? `${error.name}: ${error.message}` : error.message);
      }
    }
  }

  return [...new Set(messages)];
};

const inferInfrastructureProvider = (
  event: TraceEvent,
  message: string,
): InfrastructureProvider => {
  // A browser launch/crash/resource signature identifies the failing system more
  // precisely than the Kakao/Naver tool that happened to request the page.
  if (hasBrowserInfrastructureSignal(message)) return "BROWSER";

  const explicitProvider = event.data?.provider;
  if (isInfrastructureProvider(explicitProvider)) return explicitProvider;

  if (event.phase.startsWith("discoverSeeds.provider.") || /\btmap\b/iu.test(message)) {
    return "TMAP";
  }
  if (event.phase.includes("tool.kakao-local") || /\bkakao\b|\uce74\uce74\uc624/iu.test(message)) {
    return "KAKAO";
  }
  if (event.phase.includes("tool.naver-map")) return "NAVER";
  if (event.phase.includes("tool.naver-search") || /\bnaver\b|\ub124\uc774\ubc84/iu.test(message)) {
    return "NAVER";
  }
  if (
    event.phase.includes("agentic_candidate") ||
    event.phase.includes("operation_hours_llm") ||
    event.phase.includes("llm_scoring") ||
    /\bopenai\b|\bai[_ -]?sdk\b/iu.test(message)
  ) {
    return "OPENAI";
  }
  if (event.phase === "discoverSeeds.discover.failure") return "TMAP";
  return "UNKNOWN_PROVIDER";
};

const classifyInfrastructureCategory = (
  message: string,
  provider: InfrastructureProvider,
): InfrastructureSignalCategory | undefined => {
  if (hasExplicitQuotaSignal(message)) return "QUOTA";
  if (hasAuthSignal(message)) return "AUTH";
  if (provider === "BROWSER" && hasBrowserResourceSignal(message)) return "RESOURCE";
  if (hasTransportSignal(message)) return "TRANSPORT";
  return undefined;
};

const hasExplicitQuotaSignal = (message: string): boolean =>
  /\b429\b|rate[_ -]?limit|too many requests|insufficient[_ -]?quota|quota(?:\s+)?(?:exceeded|exhausted)|resource[_ -]?exhausted/iu.test(
    message,
  );

const hasAuthSignal = (message: string): boolean =>
  /\b(?:401|403)\b|unauthori[sz]ed|forbidden|authentication|invalid[_ -]?(?:api[_ -]?)?key|(?:api[_ -]?)?key (?:is )?required|credentials? (?:were )?not configured/iu.test(
    message,
  );

const hasBrowserResourceSignal = (message: string): boolean =>
  /playwright is required|browserType\.launch|chromium.*(?:launch|crash|closed|disconnected|binar|executable)|browser (?:process )?(?:launch|crash|closed|disconnected)|browser .*closed|target .*closed|page .*closed|missing browser binaries|spawn .*\bEAGAIN\b|\bENOMEM\b|\bEMFILE\b|\bENFILE\b|too many open files/iu.test(
    message,
  );

const hasBrowserInfrastructureSignal = (message: string): boolean =>
  hasBrowserResourceSignal(message) ||
  /browser .*(?:timed? ?out|timeout|network|transport)|frame .*timed? ?out|page\.goto.*(?:timed? ?out|timeout|net::ERR_)/iu.test(
    message,
  );

const hasTransportSignal = (message: string): boolean =>
  /timed? ?out|timeout|AbortError|aborted|\bECONN(?:RESET|REFUSED|ABORTED)\b|\bEAI_AGAIN\b|\bENOTFOUND\b|net::ERR_|fetch failed|network(?: request)? (?:failed|error)|socket|\bDNS\b|\bTLS\b|request failed|service unavailable|bad gateway|gateway timeout|\b5\d\d\b/iu.test(
    message,
  );

const sanitizeInfrastructureMessage = (message: string): string =>
  message
    .replace(/https?:\/\/[^\s"']+/giu, (url) => {
      try {
        const parsed = new URL(url);
        return `${parsed.origin}${parsed.pathname}`;
      } catch {
        return "[URL_REDACTED]";
      }
    })
    .replace(/\b(Bearer|KakaoAK)\s+[A-Za-z0-9._~-]+/giu, "$1 [REDACTED]")
    .replace(
      /\b(api[_ -]?key|authorization|client[_ -]?secret|access[_ -]?token)\s*[:=]\s*[^\s,;]+/giu,
      "$1=[REDACTED]",
    )
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 300);

const buildInfrastructureDedupKey = (
  provider: InfrastructureProvider,
  category: InfrastructureSignalCategory,
): string => `${provider}:${category}`;

const isInfrastructureProvider = (value: unknown): value is InfrastructureProvider =>
  value === "OPENAI" ||
  value === "TMAP" ||
  value === "KAKAO" ||
  value === "NAVER" ||
  value === "BROWSER" ||
  value === "UNKNOWN_PROVIDER";

const extractCandidates = (event: TraceEvent): CandidateTrace[] => {
  const output = event.data?.output;
  if (!isRecord(output)) return [];

  const seeds = output.seeds;
  const seedKeys = output.seedKeys;
  if (!Array.isArray(seeds)) return [];

  return seeds.filter(isRecord).map((seed, index) => ({
    attemptNo: event.attemptNo,
    candidateId:
      Array.isArray(seedKeys) && isString(seedKeys[index]) ? seedKeys[index] : `seed-${index}`,
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

const isString = (value: unknown): value is string => typeof value === "string";

const isUnsupportedRequestReason = (value: unknown): value is UnsupportedRequestReason =>
  value === "NONSENSE" || value === "NON_PLACE_REQUEST" || value === "CONTRADICTORY_REQUEST";

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
