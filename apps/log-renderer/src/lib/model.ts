import type {
  ArtifactIssue,
  JsonRecord,
  LogEvent,
  RunSnapshot,
  RunStatus,
  RunSummary,
} from "../types";

export type CandidateStatus = "SELECTED" | "REJECTED" | "CANDIDATE";

export type CandidateView = {
  id: string;
  name?: string;
  category?: string;
  address?: string;
  status: CandidateStatus;
  recommendation?: JsonRecord;
  generated?: JsonRecord;
  rejected: unknown[];
  verifications: unknown[];
};

export type RunStats = {
  attempts: number;
  candidates: number;
  recommendations: number;
  failures: number;
  events: number;
};

export const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const asRecordArray = (value: unknown): JsonRecord[] =>
  Array.isArray(value) ? value.filter(isRecord) : [];

export const asString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

export const asNumber = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const uniqueStrings = (values: unknown[]): string[] => [
  ...new Set(
    values.filter((value): value is string => typeof value === "string" && value.length > 0),
  ),
];

export const getCandidateIdsForEvent = (event: LogEvent): string[] => {
  const context = isRecord(event.context) ? event.context : {};
  const data = isRecord(event.data) ? event.data : {};
  const values: unknown[] = [context.candidateId, data.candidateId];
  for (const key of [
    "candidateIds",
    "selectedCandidateIds",
    "prioritizedCandidateIds",
    "rejectedCandidateIds",
  ]) {
    const candidateIds = data[key];
    if (Array.isArray(candidateIds)) values.push(...(candidateIds as unknown[]));
  }
  return uniqueStrings(values);
};

const getResultRecord = (snapshot: RunSnapshot): JsonRecord =>
  isRecord(snapshot.result) ? snapshot.result : {};

const getLogRecord = (snapshot: RunSnapshot): JsonRecord =>
  isRecord(snapshot.log) ? snapshot.log : {};

export const getUserInput = (snapshot: RunSnapshot): JsonRecord | undefined => {
  const result = getResultRecord(snapshot);
  if (isRecord(result.userInput)) return result.userInput;
  const log = getLogRecord(snapshot);
  const detail = isRecord(log.log) ? log.log : {};
  return isRecord(detail.input) ? detail.input : undefined;
};

export const getRecommendations = (snapshot: RunSnapshot): JsonRecord[] => {
  const result = getResultRecord(snapshot);
  const userOutput = isRecord(result.userOutput) ? result.userOutput : {};
  return asRecordArray(userOutput.recommendations);
};

const getTrace = (snapshot: RunSnapshot): JsonRecord => {
  const log = getLogRecord(snapshot);
  return isRecord(log.trace) ? log.trace : {};
};

const collectTraceItemsByCandidateId = (value: unknown, target: Map<string, unknown[]>): void => {
  if (Array.isArray(value)) {
    value.forEach((item) => collectTraceItemsByCandidateId(item, target));
    return;
  }
  if (!isRecord(value)) return;
  const candidateId = asString(value.candidateId) ?? asString(value.id);
  if (candidateId) {
    const existing = target.get(candidateId) ?? [];
    existing.push(value);
    target.set(candidateId, existing);
  }
};

const candidateName = (record: JsonRecord): string | undefined =>
  asString(record.name) ?? asString(record.placeName);

const candidateCategory = (record: JsonRecord): string | undefined => {
  const category = asString(record.category);
  if (category) return category;
  return (
    [asString(record.mainCategory), asString(record.subCategory)].filter(Boolean).join(" · ") ||
    undefined
  );
};

const candidateAddress = (record: JsonRecord): string | undefined => {
  const location = isRecord(record.location) ? record.location : {};
  return (
    asString(record.roadAddress) ??
    asString(record.address) ??
    asString(location.roadAddressKo) ??
    asString(location.roadAddress) ??
    asString(location.placeName)
  );
};

export const buildCandidates = (snapshot: RunSnapshot): CandidateView[] => {
  const trace = getTrace(snapshot);
  const generated = asRecordArray(trace.generatedCandidates);
  const selectedIds = new Set(
    Array.isArray(trace.selectedCandidateIds)
      ? trace.selectedCandidateIds.filter((value): value is string => typeof value === "string")
      : [],
  );
  const rejectedById = new Map<string, unknown[]>();
  const verificationsById = new Map<string, unknown[]>();
  collectTraceItemsByCandidateId(trace.rejectedCandidates, rejectedById);
  collectTraceItemsByCandidateId(trace.enrichmentVerifications, verificationsById);
  const recommendations = getRecommendations(snapshot);

  const views = new Map<string, CandidateView>();
  const upsert = (id: string, record: JsonRecord, source: "generated" | "recommendation"): void => {
    const existing = views.get(id);
    const rejected = rejectedById.get(id) ?? [];
    const recommendation = source === "recommendation" ? record : existing?.recommendation;
    const generatedRecord = source === "generated" ? record : existing?.generated;
    const status: CandidateStatus =
      recommendation || selectedIds.has(id)
        ? "SELECTED"
        : rejected.length > 0
          ? "REJECTED"
          : "CANDIDATE";
    views.set(id, {
      id,
      name: candidateName(record) ?? existing?.name,
      category: candidateCategory(record) ?? existing?.category,
      address: candidateAddress(record) ?? existing?.address,
      status,
      recommendation,
      generated: generatedRecord,
      rejected,
      verifications: verificationsById.get(id) ?? [],
    });
  };

  generated.forEach((record) => {
    const id = asString(record.candidateId) ?? asString(record.id);
    if (id) upsert(id, record, "generated");
  });
  recommendations.forEach((record) => {
    const id = asString(record.id);
    if (id) upsert(id, record, "recommendation");
  });
  for (const id of new Set([...rejectedById.keys(), ...verificationsById.keys(), ...selectedIds])) {
    if (!views.has(id)) upsert(id, { candidateId: id }, "generated");
  }

  const order: Record<CandidateStatus, number> = { SELECTED: 0, REJECTED: 1, CANDIDATE: 2 };
  return [...views.values()].sort(
    (left, right) =>
      order[left.status] - order[right.status] ||
      (left.name ?? left.id).localeCompare(right.name ?? right.id),
  );
};

export const getRunStats = (
  snapshot: RunSnapshot,
  events: LogEvent[],
  candidates = buildCandidates(snapshot),
): RunStats => ({
  attempts: new Set(events.map((event) => event.attemptNo).filter((value) => value !== undefined))
    .size,
  candidates: candidates.length,
  recommendations: getRecommendations(snapshot).length,
  failures: events.filter(
    (event) =>
      event.level === "error" ||
      event.phase.includes("failure") ||
      event.phase.includes("needs_more_seeds"),
  ).length,
  events: events.length,
});

export const eventMatches = (
  event: LogEvent,
  filters: { level?: string; phase?: string; candidateId?: string; query?: string },
): boolean => {
  if (filters.level && filters.level !== "all" && event.level !== filters.level) return false;
  if (filters.phase && filters.phase !== "all" && !event.phase.startsWith(filters.phase))
    return false;
  if (filters.candidateId && !getCandidateIdsForEvent(event).includes(filters.candidateId))
    return false;
  if (filters.query) {
    const query = filters.query.toLocaleLowerCase();
    if (!JSON.stringify(event).toLocaleLowerCase().includes(query)) return false;
  }
  return true;
};

export const inferImportedSummary = (name: string, log: unknown, result: unknown): RunSummary => {
  const logRecord = isRecord(log) ? log : {};
  const resultRecord = isRecord(result) ? result : {};
  const rawStatus = asString(logRecord.status);
  const resultStatus = asString(resultRecord.status);
  const status: RunStatus =
    rawStatus === "PASS" || rawStatus === "FAIL"
      ? rawStatus
      : resultStatus === "SUCCESS"
        ? "PASS"
        : resultStatus === "ERROR"
          ? "FAIL"
          : "UNKNOWN";
  const recommendations = isRecord(resultRecord.userOutput)
    ? asRecordArray(resultRecord.userOutput.recommendations)
    : [];
  const now = new Date().toISOString();
  return {
    id: `import:${now}`,
    name: asString(logRecord.name) ?? name,
    scenario: asString(logRecord.scenario),
    runId: asString(logRecord.runId),
    status,
    engineStatus: asString(logRecord.engineStatus) ?? resultStatus,
    durationMs: asNumber(logRecord.durationMs),
    recommendationCount: asNumber(logRecord.recommendationCount) ?? recommendations.length,
    generatedAt: asString(logRecord.generatedAt),
    modifiedAt: now,
    relativeDirectory: "브라우저 가져오기",
    hasLog: log !== null,
    hasResult: result !== null,
    hasEvents: false,
  };
};

export const mergeIssues = (...issueLists: ArtifactIssue[][]): ArtifactIssue[] => issueLists.flat();
