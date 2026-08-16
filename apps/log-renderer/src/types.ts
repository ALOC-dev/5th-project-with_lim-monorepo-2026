export type JsonRecord = Record<string, unknown>;

export type LogLevel = "debug" | "info" | "warn" | "error" | "unknown";

export type LogEvent = JsonRecord & {
  ts?: string;
  level: LogLevel;
  phase: string;
  attemptNo?: number;
  retryNo?: number;
  durationMs?: number;
  context?: JsonRecord;
  data?: JsonRecord;
  error?: JsonRecord;
};

export type RunStatus = "PASS" | "FAIL" | "RUNNING" | "UNKNOWN";

export type RunSummary = {
  id: string;
  name: string;
  scenario?: string;
  runId?: string;
  status: RunStatus;
  engineStatus?: string;
  durationMs?: number;
  recommendationCount?: number;
  generatedAt?: string;
  modifiedAt: string;
  relativeDirectory: string;
  hasLog: boolean;
  hasResult: boolean;
  hasEvents: boolean;
};

export type ArtifactIssue = {
  artifact: "log" | "result" | "events";
  code: string;
  message: string;
  line?: number;
};

export type RunSnapshot = {
  summary: RunSummary;
  log: unknown;
  result: unknown;
  artifactNames: {
    log?: string;
    result?: string;
    events?: string;
  };
  issues: ArtifactIssue[];
};

export type EventsChunk = {
  events: LogEvent[];
  rawLines: string[];
  issues: ArtifactIssue[];
  nextOffset: number;
  nextLine: number;
  fileToken: string;
  reset: boolean;
  complete: boolean;
};
