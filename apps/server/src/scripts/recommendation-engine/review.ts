import { lstat, readFile, realpath } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const reviewArtifactType = "recommendation-engine-campaign-review-packet";
const campaignArtifactType = "recommendation-engine-campaign-round";
const scheduleDays = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
] as const;

type JsonRecord = Record<string, unknown>;

export type ReviewArtifactKind = "result" | "log" | "events";

export type ReviewArtifactIssue = {
  artifact: ReviewArtifactKind;
  code:
    | "MISSING_ARTIFACT_REFERENCE"
    | "MISSING_ARTIFACT"
    | "NON_REGULAR_ARTIFACT"
    | "CORRUPT_JSON_ARTIFACT"
    | "CORRUPT_JSONL_ARTIFACT";
  message: string;
};

export type ReviewProviderError = {
  provider: string;
  category: "TRANSPORT" | "AUTH" | "QUOTA" | "RESOURCE";
  explicitQuotaFailure: boolean;
  occurrenceCount: number;
  phase: string;
  errorCode?: string;
  message?: string;
};

export type ReviewTraceMetrics = {
  durationMs?: number;
  discoveryRetryCount: number;
  discoveredCandidateCount: number;
  uniqueDiscoveredCandidateCount: number;
  evaluatedCandidateCount: number;
  rejectedCandidateCount: number;
  openVerifiedCandidateCount: number;
  urlVerifiedCandidateCount: number;
  urlRejectedCandidateCount: number;
  providerErrors: ReviewProviderError[];
};

export type ReviewRecommendation = {
  rank: number;
  id: string | null;
  name: string | null;
  category: {
    main: string | null;
    sub: string | null;
    tags: string[];
  };
  address: {
    roadAddressKo: string | null;
    placeName: string | null;
    lat: number | null;
    lng: number | null;
  };
  budget: unknown;
  distance: {
    distanceMeters: number | null;
    estimatedTravelMinutes: number | null;
    perOrigin: unknown[];
  };
  opening: {
    requested: unknown;
    timezone: string | null;
    weeklySchedule: unknown;
  };
  evidenceUrls: string[];
  mapUrls: {
    kakaoMap: string | null;
    naverMap: string | null;
  };
  descriptions: {
    contentSummary: string | null;
    reasons: string[];
  };
  structuralFlags: string[];
};

export type ReviewUrlChecklistEntry = {
  runId: string;
  scenarioId: string;
  recommendationId: string | null;
  recommendationName: string | null;
  rank: number;
  reasons: ("TOP_1" | "STRUCTURAL_ANOMALY")[];
  urls: string[];
};

export type CampaignRunReviewPacket = {
  runId: string;
  scenarioId: string;
  runStatus: string;
  classification?: string;
  engineStatus?: string;
  engineError?: { code?: string; message?: string };
  artifactPaths: Partial<Record<ReviewArtifactKind, string>>;
  artifactIssues: ReviewArtifactIssue[];
  structuralFlags: string[];
  trace: ReviewTraceMetrics;
  recommendations: ReviewRecommendation[];
  urlChecklist: ReviewUrlChecklistEntry[];
};

export type CampaignRoundReviewPacket = {
  schemaVersion: 1;
  artifactType: typeof reviewArtifactType;
  generatedAt: string;
  manifestPath: string;
  roundDirectory: string;
  campaign: {
    campaignId: string;
    roundId: string;
    roundNumber: number | null;
    status: string;
    concurrency: number | null;
    sourceFingerprint: string | null;
    scenarioFingerprint: string | null;
  };
  totals: {
    runs: number;
    recommendations: number;
    artifactIssues: number;
    structuralFlags: number;
    urlChecklistEntries: number;
    durationMs: number;
    discoveryRetries: number;
    candidates: number;
    uniqueCandidates: number;
    evaluatedCandidates: number;
    rejectedCandidates: number;
    openVerifiedCandidates: number;
    urlVerifiedCandidates: number;
    urlRejectedCandidates: number;
    providerErrorOccurrencesByProvider: Record<string, number>;
    infrastructureAffectedRuns: number;
  };
  grading: {
    manualGradesAssigned: false;
    note: string;
  };
  runs: CampaignRunReviewPacket[];
  urlChecklist: ReviewUrlChecklistEntry[];
};

export type ReviewCampaignRoundOptions = {
  now?: () => Date;
};

type ParsedArtifact<T> = {
  path?: string;
  value?: T;
  issues: ReviewArtifactIssue[];
};

type TraceSources = {
  report?: JsonRecord;
  outcome?: JsonRecord;
  log?: JsonRecord;
  events: JsonRecord[];
};

export const reviewCampaignRound = async (
  manifestPath: string,
  options: ReviewCampaignRoundOptions = {},
): Promise<CampaignRoundReviewPacket> => {
  const safeManifestPath = await resolveManifestPath(manifestPath);
  const roundDirectory = dirname(safeManifestPath);
  const manifest = await readRequiredJson(safeManifestPath, "campaign manifest");
  assertCampaignManifest(manifest);

  const runs: CampaignRunReviewPacket[] = [];
  for (const [manifestRunId, rawRecord] of Object.entries(manifest.runs)) {
    if (!isRecord(rawRecord)) {
      throw new Error(`Campaign manifest run ${manifestRunId} must be an object`);
    }
    runs.push(await reviewCampaignRun(roundDirectory, manifestRunId, rawRecord));
  }

  const urlChecklist = runs.flatMap((run) => run.urlChecklist);
  const providerErrorOccurrencesByProvider = aggregateProviderErrorOccurrences(runs);
  return {
    schemaVersion: 1,
    artifactType: reviewArtifactType,
    generatedAt: (options.now ?? (() => new Date()))().toISOString(),
    manifestPath: safeManifestPath,
    roundDirectory,
    campaign: {
      campaignId: manifest.campaignId,
      roundId: manifest.roundId,
      roundNumber: readFiniteNumber(manifest.roundNumber),
      status: readString(manifest.status) ?? "UNKNOWN",
      concurrency: readFiniteNumber(manifest.concurrency),
      sourceFingerprint: readString(manifest.sourceFingerprint) ?? null,
      scenarioFingerprint: readString(manifest.scenarioFingerprint) ?? null,
    },
    totals: {
      runs: runs.length,
      recommendations: sum(runs.map((run) => run.recommendations.length)),
      artifactIssues: sum(runs.map((run) => run.artifactIssues.length)),
      structuralFlags: sum(
        runs.map(
          (run) =>
            run.structuralFlags.length +
            sum(run.recommendations.map((item) => item.structuralFlags.length)),
        ),
      ),
      urlChecklistEntries: urlChecklist.length,
      durationMs: sum(runs.map((run) => run.trace.durationMs ?? 0)),
      discoveryRetries: sum(runs.map((run) => run.trace.discoveryRetryCount)),
      candidates: sum(runs.map((run) => run.trace.discoveredCandidateCount)),
      uniqueCandidates: sum(runs.map((run) => run.trace.uniqueDiscoveredCandidateCount)),
      evaluatedCandidates: sum(runs.map((run) => run.trace.evaluatedCandidateCount)),
      rejectedCandidates: sum(runs.map((run) => run.trace.rejectedCandidateCount)),
      openVerifiedCandidates: sum(runs.map((run) => run.trace.openVerifiedCandidateCount)),
      urlVerifiedCandidates: sum(runs.map((run) => run.trace.urlVerifiedCandidateCount)),
      urlRejectedCandidates: sum(runs.map((run) => run.trace.urlRejectedCandidateCount)),
      providerErrorOccurrencesByProvider,
      infrastructureAffectedRuns: runs.filter(
        (run) =>
          run.trace.providerErrors.length > 0 || run.classification === "INFRA_FAILURE",
      ).length,
    },
    grading: {
      manualGradesAssigned: false,
      note: "Structural flags are independent QA hints, not manual PASS/WARN/FAIL grades and do not use engine scores.",
    },
    runs,
    urlChecklist,
  };
};

const aggregateProviderErrorOccurrences = (
  runs: CampaignRunReviewPacket[],
): Record<string, number> => {
  const occurrences = new Map<string, number>();
  for (const signal of runs.flatMap((run) => run.trace.providerErrors)) {
    occurrences.set(
      signal.provider,
      (occurrences.get(signal.provider) ?? 0) + signal.occurrenceCount,
    );
  }
  return Object.fromEntries([...occurrences].sort(([left], [right]) => left.localeCompare(right)));
};

const reviewCampaignRun = async (
  roundDirectory: string,
  manifestRunId: string,
  record: JsonRecord,
): Promise<CampaignRunReviewPacket> => {
  const runId = readString(record.runId) ?? manifestRunId;
  const scenarioId = readString(record.scenarioId) ?? manifestRunId;
  const report = isRecord(record.report) ? record.report : undefined;
  const outcome = isRecord(record.outcome) ? record.outcome : undefined;
  const artifactDirectory = await validateRunArtifactDirectory(
    roundDirectory,
    runId,
    record.artifactDir,
  );

  const resultArtifact = await readJsonArtifact(
    roundDirectory,
    artifactDirectory,
    "result",
    report?.resultFile,
  );
  const logArtifact = await readJsonArtifact(
    roundDirectory,
    artifactDirectory,
    "log",
    report?.logFile,
  );
  const eventsArtifact = await readJsonlArtifact(
    roundDirectory,
    artifactDirectory,
    report?.eventsFile,
  );
  const artifactIssues = [
    ...resultArtifact.issues,
    ...logArtifact.issues,
    ...eventsArtifact.issues,
  ];

  const result = resultArtifact.value;
  const recommendationValues = extractRecommendations(result);
  const expectedCount = readExpectedRecommendationCount(outcome);
  const recommendations = recommendationValues.map((value, index) =>
    toReviewRecommendation(value, index + 1),
  );
  applyDuplicateFlags(recommendations);

  const structuralFlags = getRunStructuralFlags({
    artifactIssues,
    expectedCount,
    outcome,
    recommendations,
    result,
  });
  const urlChecklist = recommendations.flatMap((recommendation) => {
    const reasons: ReviewUrlChecklistEntry["reasons"] = [];
    if (recommendation.rank === 1) reasons.push("TOP_1");
    if (
      recommendation.structuralFlags.length > 0 ||
      (recommendation.rank === 1 && structuralFlags.length > 0)
    ) {
      reasons.push("STRUCTURAL_ANOMALY");
    }
    return reasons.length === 0
      ? []
      : [
          {
            runId,
            scenarioId,
            recommendationId: recommendation.id,
            recommendationName: recommendation.name,
            rank: recommendation.rank,
            reasons,
            urls: recommendation.evidenceUrls,
          },
        ];
  });

  return {
    runId,
    scenarioId,
    runStatus: readString(record.status) ?? "UNKNOWN",
    ...(readString(outcome?.classification)
      ? { classification: readString(outcome?.classification) }
      : {}),
    ...(readString(report?.engineStatus) ? { engineStatus: readString(report?.engineStatus) } : {}),
    ...(readString(report?.errorCode) || readString(report?.engineErrorMessage)
      ? {
          engineError: {
            ...(readString(report?.errorCode) ? { code: readString(report?.errorCode) } : {}),
            ...(readString(report?.engineErrorMessage)
              ? { message: readString(report?.engineErrorMessage) }
              : {}),
          },
        }
      : {}),
    artifactPaths: {
      ...(resultArtifact.path ? { result: resultArtifact.path } : {}),
      ...(logArtifact.path ? { log: logArtifact.path } : {}),
      ...(eventsArtifact.path ? { events: eventsArtifact.path } : {}),
    },
    artifactIssues,
    structuralFlags,
    trace: extractTraceMetrics({
      report,
      outcome,
      log: logArtifact.value,
      events: eventsArtifact.value ?? [],
    }),
    recommendations,
    urlChecklist,
  };
};

const resolveManifestPath = async (manifestPath: string): Promise<string> => {
  const resolvedPath = resolve(manifestPath);
  const info = await lstat(resolvedPath).catch(() => undefined);
  if (!info?.isFile()) {
    throw new Error(`Campaign manifest is missing or not a regular file: ${resolvedPath}`);
  }
  return await realpath(resolvedPath);
};

const validateRunArtifactDirectory = async (
  roundDirectory: string,
  runId: string,
  rawPath: unknown,
): Promise<string | undefined> => {
  if (typeof rawPath !== "string" || rawPath.trim().length === 0) return undefined;
  const safePath = await resolveInsideRound(
    roundDirectory,
    rawPath,
    `run ${runId} artifactDir`,
  );
  const info = await lstat(safePath).catch(() => undefined);
  if (!info) return safePath;
  if (!info.isDirectory()) throw new Error(`Run artifactDir is not a directory: ${safePath}`);
  return await assertExistingPathInsideRound(roundDirectory, safePath, `run ${runId} artifactDir`);
};

const readJsonArtifact = async (
  roundDirectory: string,
  artifactDirectory: string | undefined,
  artifact: "result" | "log",
  rawPath: unknown,
): Promise<ParsedArtifact<JsonRecord>> => {
  const pathResult = await resolveArtifactPath(
    roundDirectory,
    artifactDirectory,
    artifact,
    rawPath,
  );
  if (pathResult.issues.length > 0 || !pathResult.path) return pathResult;

  try {
    const value: unknown = JSON.parse(await readFile(pathResult.path, "utf8"));
    if (!isRecord(value)) throw new Error("root value must be an object");
    return { path: pathResult.path, value, issues: [] };
  } catch (error) {
    return {
      path: pathResult.path,
      issues: [
        {
          artifact,
          code: "CORRUPT_JSON_ARTIFACT",
          message: `${artifact} artifact is not valid object JSON: ${toErrorMessage(error)}`,
        },
      ],
    };
  }
};

const readJsonlArtifact = async (
  roundDirectory: string,
  artifactDirectory: string | undefined,
  rawPath: unknown,
): Promise<ParsedArtifact<JsonRecord[]>> => {
  const pathResult = await resolveArtifactPath(
    roundDirectory,
    artifactDirectory,
    "events",
    rawPath,
  );
  if (pathResult.issues.length > 0 || !pathResult.path) return pathResult;

  const events: JsonRecord[] = [];
  const corruptLines: number[] = [];
  const lines = (await readFile(pathResult.path, "utf8")).split(/\r?\n/u);
  for (const [index, line] of lines.entries()) {
    if (line.trim().length === 0) continue;
    try {
      const value: unknown = JSON.parse(line);
      if (!isRecord(value)) throw new Error("event must be an object");
      events.push(value);
    } catch {
      corruptLines.push(index + 1);
    }
  }

  return {
    path: pathResult.path,
    value: events,
    issues:
      corruptLines.length === 0
        ? []
        : [
            {
              artifact: "events",
              code: "CORRUPT_JSONL_ARTIFACT",
              message: `events artifact has corrupt JSONL line(s): ${corruptLines.join(", ")}`,
            },
          ],
  };
};

const resolveArtifactPath = async (
  roundDirectory: string,
  artifactDirectory: string | undefined,
  artifact: ReviewArtifactKind,
  rawPath: unknown,
): Promise<ParsedArtifact<never>> => {
  if (typeof rawPath !== "string" || rawPath.trim().length === 0) {
    return {
      issues: [
        {
          artifact,
          code: "MISSING_ARTIFACT_REFERENCE",
          message: `manifest report does not reference a ${artifact} artifact`,
        },
      ],
    };
  }

  const safePath = await resolveInsideRound(
    roundDirectory,
    rawPath,
    `${artifact} artifact`,
  );
  if (artifactDirectory) {
    assertPathInside(artifactDirectory, safePath, `${artifact} artifact`, "run artifactDir");
  }
  const info = await lstat(safePath).catch(() => undefined);
  if (!info) {
    return {
      path: safePath,
      issues: [
        {
          artifact,
          code: "MISSING_ARTIFACT",
          message: `${artifact} artifact does not exist: ${safePath}`,
        },
      ],
    };
  }
  if (!info.isFile()) {
    return {
      path: safePath,
      issues: [
        {
          artifact,
          code: "NON_REGULAR_ARTIFACT",
          message: `${artifact} artifact is not a regular file: ${safePath}`,
        },
      ],
    };
  }

  return {
    path: await assertExistingPathInsideRound(roundDirectory, safePath, `${artifact} artifact`),
    issues: [],
  };
};

const resolveInsideRound = async (
  roundDirectory: string,
  rawPath: string,
  label: string,
): Promise<string> => {
  const candidate = isAbsolute(rawPath)
    ? resolve(rawPath)
    : resolve(roundDirectory, rawPath);
  const physicalCandidate = await resolveWithExistingAncestor(candidate);
  assertPathInside(roundDirectory, physicalCandidate, label, "campaign round directory");
  return physicalCandidate;
};

// macOS exposes temporary directories through aliases such as `/var` and
// `/private/var`. Canonicalize the nearest existing ancestor so that a missing
// artifact can still be boundary-checked against the manifest's real path.
const resolveWithExistingAncestor = async (path: string): Promise<string> => {
  const suffix: string[] = [];
  let ancestor = resolve(path);
  while (!(await lstat(ancestor).catch(() => undefined))) {
    const parent = dirname(ancestor);
    if (parent === ancestor) return path;
    suffix.unshift(basename(ancestor));
    ancestor = parent;
  }
  return join(await realpath(ancestor), ...suffix);
};

const assertExistingPathInsideRound = async (
  roundDirectory: string,
  path: string,
  label: string,
): Promise<string> => {
  const physicalPath = await realpath(path);
  assertPathInside(roundDirectory, physicalPath, label, "campaign round directory");
  return physicalPath;
};

const assertPathInside = (
  parent: string,
  candidate: string,
  label: string,
  parentLabel: string,
): void => {
  const relativePath = relative(resolve(parent), resolve(candidate));
  if (
    relativePath === "" ||
    relativePath === ".." ||
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath)
  ) {
    throw new Error(`${label} escapes or equals the exact ${parentLabel}: ${candidate}`);
  }
};

const extractRecommendations = (result: JsonRecord | undefined): JsonRecord[] => {
  if (result?.status !== "SUCCESS" || !isRecord(result.userOutput)) return [];
  const values = result.userOutput.recommendations;
  return Array.isArray(values) ? values.filter(isRecord) : [];
};

const toReviewRecommendation = (item: JsonRecord, rank: number): ReviewRecommendation => {
  const location = isRecord(item.location) ? item.location : undefined;
  const accessibility = isRecord(item.accessibility) ? item.accessibility : undefined;
  const operationInfo = isRecord(item.operationInfo) ? item.operationInfo : undefined;
  const availability = isRecord(item.availabilityAtRequestedTime)
    ? item.availabilityAtRequestedTime
    : undefined;
  const referenceUrls = isRecord(item.referenceUrls) ? item.referenceUrls : undefined;
  const kakaoMap = readString(referenceUrls?.kakaoMap) ?? null;
  const naverMap = readString(referenceUrls?.naverMap) ?? null;
  const evidenceUrls = uniqueStrings([
    kakaoMap,
    naverMap,
    readString(referenceUrls?.instagram),
    ...readStringArray(referenceUrls?.others),
  ]);
  const recommendation: ReviewRecommendation = {
    rank,
    id: readString(item.id) ?? null,
    name: readString(item.name) ?? null,
    category: {
      main: readString(item.mainCategory) ?? null,
      sub: readString(item.subCategory) ?? null,
      tags: readStringArray(item.tags),
    },
    address: {
      roadAddressKo: readString(location?.roadAddressKo) ?? null,
      placeName: readString(location?.placeName) ?? null,
      lat: readFiniteNumber(location?.lat),
      lng: readFiniteNumber(location?.lng),
    },
    budget: item.priceRangePerPerson ?? null,
    distance: {
      distanceMeters: readFiniteNumber(accessibility?.distanceMeters),
      estimatedTravelMinutes: readFiniteNumber(accessibility?.estimatedTravelMinutes),
      perOrigin: Array.isArray(accessibility?.perOrigin) ? accessibility.perOrigin : [],
    },
    opening: {
      requested: availability ?? null,
      timezone: readString(operationInfo?.timezone) ?? null,
      weeklySchedule: operationInfo?.schedules ?? null,
    },
    evidenceUrls,
    mapUrls: { kakaoMap, naverMap },
    descriptions: {
      contentSummary: readString(item.contentSummary) ?? null,
      reasons: readStringArray(item.reasons),
    },
    structuralFlags: [],
  };
  recommendation.structuralFlags = getItemStructuralFlags(recommendation, availability);
  return recommendation;
};

const getItemStructuralFlags = (
  item: ReviewRecommendation,
  availability: JsonRecord | undefined,
): string[] => {
  const flags: string[] = [];
  if (!item.id) flags.push("MISSING_ID");
  if (!item.name) flags.push("MISSING_NAME");
  if (!item.category.main || !item.category.sub) flags.push("MISSING_CATEGORY");
  if (!item.address.roadAddressKo) flags.push("MISSING_ADDRESS");
  if (!isRecord(item.budget)) flags.push("MISSING_BUDGET");
  if (
    item.distance.distanceMeters === null &&
    !item.distance.perOrigin.some(
      (origin) => isRecord(origin) && readFiniteNumber(origin.distanceMeters) !== null,
    )
  ) {
    flags.push("MISSING_DISTANCE");
  }
  if (item.opening.timezone === null || !isRecord(item.opening.weeklySchedule)) {
    flags.push("MISSING_OPENING_SCHEDULE");
  } else {
    const schedule = item.opening.weeklySchedule;
    if (
      scheduleDays.some(
        (day) => !isRecord(schedule[day]) || !readString(schedule[day].status),
      )
    ) {
      flags.push("MISSING_OPENING_STATUS_FIELDS");
    }
    if (scheduleDays.every((day) => isUnknownSchedule(schedule[day]))) {
      flags.push("OPENING_SCHEDULE_ALL_UNKNOWN");
    }
  }
  if (!availability || !readString(availability.status)) {
    flags.push("MISSING_REQUESTED_AVAILABILITY");
  } else if (availability.status === "UNKNOWN") {
    flags.push("REQUESTED_AVAILABILITY_UNKNOWN");
  } else if (availability.status === "CLOSED") {
    flags.push("REQUESTED_AVAILABILITY_CLOSED");
  } else if (availability.status !== "OPEN") {
    flags.push("INVALID_REQUESTED_AVAILABILITY_STATUS");
  }
  if (item.evidenceUrls.length === 0) flags.push("MISSING_EVIDENCE_URL");
  if (!item.mapUrls.kakaoMap && !item.mapUrls.naverMap) flags.push("MISSING_MAP_URL");
  if (!item.descriptions.contentSummary || item.descriptions.reasons.length === 0) {
    flags.push("MISSING_DESCRIPTION");
  }
  if (item.evidenceUrls.some((url) => !isHttpUrl(url))) flags.push("INVALID_REFERENCE_URL");
  return flags;
};

const applyDuplicateFlags = (recommendations: ReviewRecommendation[]): void => {
  const duplicateIds = findDuplicates(
    recommendations.map((item) => item.id?.trim()).filter(isNonEmptyString),
  );
  const identities = recommendations.map(toPlaceIdentity);
  const duplicateIdentities = findDuplicates(identities.filter(isNonEmptyString));
  for (const [index, recommendation] of recommendations.entries()) {
    if (recommendation.id && duplicateIds.has(recommendation.id.trim())) {
      recommendation.structuralFlags.push("DUPLICATE_RECOMMENDATION_ID");
    }
    const identity = identities[index];
    if (identity && duplicateIdentities.has(identity)) {
      recommendation.structuralFlags.push("DUPLICATE_PLACE_IDENTITY");
    }
  }
};

const getRunStructuralFlags = ({
  artifactIssues,
  expectedCount,
  outcome,
  recommendations,
  result,
}: {
  artifactIssues: ReviewArtifactIssue[];
  expectedCount: number | undefined;
  outcome: JsonRecord | undefined;
  recommendations: ReviewRecommendation[];
  result: JsonRecord | undefined;
}): string[] => {
  const flags: string[] = [];
  if (artifactIssues.length > 0) flags.push("ARTIFACT_INCOMPLETE_OR_CORRUPT");
  if (expectedCount !== undefined && recommendations.length !== expectedCount) {
    flags.push("RECOMMENDATION_COUNT_MISMATCH");
  }
  const expected = isRecord(outcome?.expected) ? outcome.expected : undefined;
  if (expected?.kind === "SUCCESS" && result?.status === "ERROR") {
    flags.push("ENGINE_ERROR_FOR_EXPECTED_SUCCESS");
  }
  if (expected?.kind === "UNSUPPORTED" && recommendations.length > 0) {
    flags.push("UNEXPECTED_RECOMMENDATIONS_FOR_UNSUPPORTED_REQUEST");
  }
  if (recommendations.some((item) => item.structuralFlags.includes("DUPLICATE_RECOMMENDATION_ID"))) {
    flags.push("DUPLICATE_RECOMMENDATION_IDS");
  }
  if (recommendations.some((item) => item.structuralFlags.includes("DUPLICATE_PLACE_IDENTITY"))) {
    flags.push("DUPLICATE_PLACE_IDENTITIES");
  }
  return flags;
};

const readExpectedRecommendationCount = (outcome: JsonRecord | undefined): number | undefined => {
  const expected = isRecord(outcome?.expected) ? outcome.expected : undefined;
  return expected?.kind === "SUCCESS" ? readFiniteNumber(expected.recommendationCount) ?? undefined : undefined;
};

const extractTraceMetrics = ({ report, outcome, log, events }: TraceSources): ReviewTraceMetrics => {
  const trace = isRecord(log?.trace)
    ? log.trace
    : isRecord(report?.trace)
      ? report.trace
      : undefined;
  const generatedCandidates = Array.isArray(trace?.generatedCandidates)
    ? trace.generatedCandidates.filter(isRecord)
    : [];
  const eventCandidates = events.flatMap(extractEventCandidates);
  const candidates = eventCandidates.length > 0 ? eventCandidates : generatedCandidates;
  const uniqueCandidateIds = new Set(
    candidates
      .map((candidate) => readString(candidate.candidateId) ?? readString(candidate.seedKey))
      .filter(isNonEmptyString),
  );
  const retryEvents = events.filter(
    (event) =>
      event.phase === "engine.attempt.needs_more_seeds" ||
      event.phase === "engine.attempt.defer_evaluation",
  );
  const traceRetries = Array.isArray(trace?.needsMoreSeeds)
    ? trace.needsMoreSeeds.filter(
        (value) =>
          isRecord(value) &&
          (value.phase === "engine.attempt.needs_more_seeds" ||
            value.phase === "engine.attempt.defer_evaluation"),
      ).length
    : 0;
  const enrichmentEvents = events.filter(
    (event) => event.phase === "evaluateSeeds.enrichment.success",
  );
  const referenceEvents = events.filter(
    (event) => event.phase === "evaluateSeeds.reference_urls.success",
  );
  const evaluationStartEvents = events.filter(
    (event) => event.phase === "evaluateSeeds.evaluation.start",
  );
  const rejectedFallback = Array.isArray(trace?.rejectedCandidates)
    ? trace.rejectedCandidates.length
    : 0;

  return {
    ...(readFiniteNumber(log?.durationMs) ?? readFiniteNumber(report?.durationMs)) !== null
      ? { durationMs: readFiniteNumber(log?.durationMs) ?? readFiniteNumber(report?.durationMs) ?? undefined }
      : {},
    discoveryRetryCount: retryEvents.length > 0 ? retryEvents.length : traceRetries,
    discoveredCandidateCount: candidates.length,
    uniqueDiscoveredCandidateCount: uniqueCandidateIds.size,
    evaluatedCandidateCount: sum(
      evaluationStartEvents.map((event) => readEventDataNumber(event, "seedCount") ?? 0),
    ),
    rejectedCandidateCount:
      enrichmentEvents.length > 0
        ? sum(enrichmentEvents.map(readRejectedCandidateCount))
        : rejectedFallback,
    openVerifiedCandidateCount: sum(
      enrichmentEvents.map((event) => readEventDataNumber(event, "verifiedOpenCount") ?? 0),
    ),
    urlVerifiedCandidateCount: sum(
      referenceEvents.map((event) => readEventDataNumber(event, "verifiedCount") ?? 0),
    ),
    urlRejectedCandidateCount: sum(
      referenceEvents.map((event) => readEventDataNumber(event, "rejectedCount") ?? 0),
    ),
    providerErrors: extractProviderErrors(log, events, report, outcome),
  };
};

const extractEventCandidates = (event: JsonRecord): JsonRecord[] => {
  if (event.phase !== "discoverSeeds.discover.result" || !isRecord(event.data)) return [];
  const output = isRecord(event.data.output) ? event.data.output : undefined;
  return Array.isArray(output?.seeds) ? output.seeds.filter(isRecord) : [];
};

const readRejectedCandidateCount = (event: JsonRecord): number => {
  if (!isRecord(event.data)) return 0;
  if (Array.isArray(event.data.rejected)) return event.data.rejected.length;
  return readFiniteNumber(event.data.rejectedCount) ?? 0;
};

const extractProviderErrors = (
  log: JsonRecord | undefined,
  events: JsonRecord[],
  report: JsonRecord | undefined,
  outcome: JsonRecord | undefined,
): ReviewProviderError[] => {
  const canonicalSignals = getCanonicalInfrastructureSignals(log, report);
  if (canonicalSignals !== undefined) {
    const canonical = aggregateCanonicalInfrastructureSignals(canonicalSignals);
    const terminal = extractTerminalProviderError(report, outcome);
    if (!terminal) return canonical;
    const merged = new Map(
      canonical.map((signal) => [`${signal.provider}:${signal.category}`, signal]),
    );
    addLegacyProviderError(merged, terminal);
    return [...merged.values()];
  }
  return extractLegacyProviderErrors(events, report, outcome);
};

const getCanonicalInfrastructureSignals = (
  log: JsonRecord | undefined,
  report: JsonRecord | undefined,
): unknown[] | undefined => {
  const sources = [
    isRecord(log?.trace) ? log.trace : undefined,
    isRecord(report?.trace) ? report.trace : undefined,
    report,
  ];
  for (const source of sources) {
    if (!source || !Object.prototype.hasOwnProperty.call(source, "infrastructureSignals")) {
      continue;
    }
    return Array.isArray(source.infrastructureSignals)
      ? (source.infrastructureSignals as unknown[])
      : [];
  }
  return undefined;
};

const aggregateCanonicalInfrastructureSignals = (
  values: unknown[],
): ReviewProviderError[] => {
  const byProviderAndCategory = new Map<string, ReviewProviderError>();
  for (const value of values) {
    if (!isRecord(value)) continue;
    const provider = readString(value.provider);
    const category = readInfrastructureCategory(value.category);
    if (!provider || !category) continue;
    const occurrenceCount = readPositiveInteger(value.occurrenceCount) ?? 1;
    const key = `${provider}:${category}`;
    const existing = byProviderAndCategory.get(key);
    if (existing) {
      byProviderAndCategory.set(key, {
        ...existing,
        explicitQuotaFailure:
          existing.explicitQuotaFailure ||
          value.explicitQuotaFailure === true ||
          category === "QUOTA",
        occurrenceCount: existing.occurrenceCount + occurrenceCount,
      });
      continue;
    }
    byProviderAndCategory.set(key, {
      provider,
      category,
      explicitQuotaFailure: value.explicitQuotaFailure === true || category === "QUOTA",
      occurrenceCount,
      phase: readString(value.phase) ?? "trace.infrastructureSignals",
      ...(readString(value.message) ? { message: readString(value.message) } : {}),
    });
  }
  return [...byProviderAndCategory.values()];
};

const extractLegacyProviderErrors = (
  events: JsonRecord[],
  report: JsonRecord | undefined,
  outcome: JsonRecord | undefined,
): ReviewProviderError[] => {
  const byProviderAndCategory = new Map<string, ReviewProviderError>();
  for (const event of events) {
    const phase = readString(event.phase) ?? "unknown";
    const level = readString(event.level);
    if (level !== "error" && !phase.includes("failure")) continue;
    const data = isRecord(event.data) ? event.data : undefined;
    const errorCode = readString(data?.errorCode);
    const explicitProvider = readString(data?.provider);
    for (const rawMessage of extractLegacyMessages(event)) {
      const category = classifyLegacyInfrastructureCategory(rawMessage);
      if (!category) continue;
      const provider = inferLegacyProvider(
        `${phase} ${errorCode ?? ""} ${rawMessage}`,
        explicitProvider,
        category,
      );
      addLegacyProviderError(byProviderAndCategory, {
        provider,
        category,
        explicitQuotaFailure: category === "QUOTA",
        occurrenceCount: 1,
        phase,
        ...(errorCode ? { errorCode } : {}),
        message: sanitizeLegacyInfrastructureMessage(rawMessage),
      });
    }
  }

  const terminal = extractTerminalProviderError(report, outcome);
  if (terminal) addLegacyProviderError(byProviderAndCategory, terminal);
  return [...byProviderAndCategory.values()];
};

const extractTerminalProviderError = (
  report: JsonRecord | undefined,
  outcome: JsonRecord | undefined,
): ReviewProviderError | undefined => {
  const reportMessage = [
    readString(report?.errorCode),
    readString(report?.engineErrorMessage),
    readString(report?.error),
  ]
    .filter(isNonEmptyString)
    .join(" ");
  const explicitQuotaFailure =
    report?.explicitQuotaFailure === true || outcome?.explicitQuotaFailure === true;
  const category = explicitQuotaFailure
    ? "QUOTA"
    : classifyLegacyInfrastructureCategory(reportMessage);
  if (!category) return undefined;
  return {
    provider: inferLegacyProvider(
      reportMessage,
      readString(outcome?.provider) ?? readString(report?.infrastructureProvider),
      category,
    ),
    category,
    explicitQuotaFailure: explicitQuotaFailure || category === "QUOTA",
    occurrenceCount: 1,
    phase: "campaign.report",
    ...(readString(report?.errorCode) ? { errorCode: readString(report?.errorCode) } : {}),
    ...(reportMessage
      ? { message: sanitizeLegacyInfrastructureMessage(reportMessage) }
      : {}),
  };
};

const addLegacyProviderError = (
  target: Map<string, ReviewProviderError>,
  signal: ReviewProviderError,
): void => {
  const key = `${signal.provider}:${signal.category}`;
  const existing = target.get(key);
  if (!existing) {
    target.set(key, signal);
    return;
  }
  // Legacy event streams echo one provider exception through several catch
  // layers. Keep one conservative occurrence; new traces carry exact counts.
  target.set(key, {
    ...existing,
    explicitQuotaFailure: existing.explicitQuotaFailure || signal.explicitQuotaFailure,
  });
};

const extractLegacyMessages = (event: JsonRecord): string[] => {
  const messages: string[] = [];
  const error = isRecord(event.error) ? event.error : undefined;
  if (readString(error?.message)) messages.push(readString(error?.message) as string);
  const data = isRecord(event.data) ? event.data : undefined;
  for (const key of ["message", "errorMessage", "errorReason"] as const) {
    const message = readString(data?.[key]);
    if (message) messages.push(message);
  }
  if (Array.isArray(data?.errors)) {
    for (const value of data.errors) {
      if (readString(value)) messages.push(readString(value) as string);
      else if (isRecord(value) && readString(value.message)) {
        messages.push(readString(value.message) as string);
      }
    }
  }
  return [...new Set(messages)];
};

const classifyLegacyInfrastructureCategory = (
  message: string,
): ReviewProviderError["category"] | undefined => {
  if (!message || isProductOutputFailure(message)) return undefined;
  if (hasLegacyQuotaSignal(message)) return "QUOTA";
  if (hasLegacyAuthSignal(message)) return "AUTH";
  if (hasLegacyBrowserResourceSignal(message)) return "RESOURCE";
  if (hasLegacyTransportSignal(message)) return "TRANSPORT";
  return undefined;
};

const isProductOutputFailure = (message: string): boolean =>
  /NoObjectGenerated|schema|parse|validation|content[_ -]?filter|no usable evaluation|no usable place match|invalid (?:model )?(?:output|response)|did not match (?:the )?schema|zod/iu.test(
    message,
  ) &&
  !hasLegacyQuotaSignal(message) &&
  !hasLegacyAuthSignal(message) &&
  !hasLegacyBrowserResourceSignal(message) &&
  !hasLegacyTransportSignal(message);

const hasLegacyQuotaSignal = (message: string): boolean =>
  /\b429\b|rate[_ -]?limit|too many requests|insufficient[_ -]?quota|quota(?:\s+)?(?:exceeded|exhausted)|resource[_ -]?exhausted/iu.test(
    message,
  );

const hasLegacyAuthSignal = (message: string): boolean =>
  /\b(?:401|403)\b|unauthori[sz]ed|forbidden|authentication|invalid[_ -]?(?:api[_ -]?)?key|credentials? (?:were )?not configured/iu.test(
    message,
  );

const hasLegacyBrowserResourceSignal = (message: string): boolean =>
  /playwright is required|browserType\.launch|chromium.*(?:launch|crash|closed|disconnected|binar|executable)|browser (?:process )?(?:launch|crash|closed|disconnected)|missing browser binaries|\bEAGAIN\b|\bENOMEM\b|\bEMFILE\b|\bENFILE\b|too many open files/iu.test(
    message,
  );

const hasLegacyTransportSignal = (message: string): boolean =>
  /timed? ?out|timeout|AbortError|aborted|\bECONN(?:RESET|REFUSED|ABORTED)\b|\bEAI_AGAIN\b|\bENOTFOUND\b|net::ERR_|fetch failed|network(?: request)? (?:failed|error)|socket|\bDNS\b|\bTLS\b|request failed|service unavailable|bad gateway|gateway timeout|\b5\d\d\b/iu.test(
    message,
  );

const inferLegacyProvider = (
  evidence: string,
  explicitProvider: string | undefined,
  category: ReviewProviderError["category"],
): string => {
  const normalized = evidence.toUpperCase();
  if (category === "RESOURCE" || /PLAYWRIGHT|CHROMIUM|BROWSER/u.test(normalized)) {
    return "BROWSER";
  }
  if (explicitProvider) return explicitProvider;
  if (/TMAP/u.test(normalized)) return "TMAP";
  if (/KAKAO/u.test(normalized)) return "KAKAO";
  if (/NAVER/u.test(normalized)) return "NAVER";
  if (/OPENAI|\bLLM\b|MODEL_PROVIDER|DISCOVER_SEEDS_(?:PLAN|INTENT)/u.test(normalized)) {
    return "OPENAI";
  }
  return "UNKNOWN_PROVIDER";
};

const sanitizeLegacyInfrastructureMessage = (message: string): string =>
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

const readInfrastructureCategory = (
  value: unknown,
): ReviewProviderError["category"] | undefined =>
  value === "TRANSPORT" || value === "AUTH" || value === "QUOTA" || value === "RESOURCE"
    ? value
    : undefined;

const readPositiveInteger = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;

const readEventDataNumber = (event: JsonRecord, key: string): number | null =>
  isRecord(event.data) ? readFiniteNumber(event.data[key]) : null;

const toPlaceIdentity = (item: ReviewRecommendation): string | undefined => {
  if (!item.name) return undefined;
  const address = item.address.roadAddressKo ??
    (item.address.lat !== null && item.address.lng !== null
      ? `${item.address.lat.toFixed(5)},${item.address.lng.toFixed(5)}`
      : "");
  return `${normalizeIdentityText(item.name)}|${normalizeIdentityText(address)}`;
};

const normalizeIdentityText = (value: string): string =>
  value.normalize("NFKC").toLocaleLowerCase("ko-KR").replaceAll(/[^\p{L}\p{N}]+/gu, "");

const findDuplicates = (values: string[]): Set<string> => {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return new Set([...counts].filter(([, count]) => count > 1).map(([value]) => value));
};

const isUnknownSchedule = (value: unknown): boolean =>
  isRecord(value) && value.status === "UNKNOWN";

const isHttpUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

const assertCampaignManifest: (
  value: JsonRecord,
) => asserts value is JsonRecord & {
  campaignId: string;
  roundId: string;
  runs: JsonRecord;
} = (value) => {
  if (value.artifactType !== campaignArtifactType) {
    throw new Error(`Unsupported campaign manifest artifactType: ${String(value.artifactType)}`);
  }
  if (!readString(value.campaignId) || !readString(value.roundId) || !isRecord(value.runs)) {
    throw new Error("Campaign manifest must contain campaignId, roundId, and runs");
  }
};

const readRequiredJson = async (path: string, label: string): Promise<JsonRecord> => {
  try {
    const value: unknown = JSON.parse(await readFile(path, "utf8"));
    if (!isRecord(value)) throw new Error("root value must be an object");
    return value;
  } catch (error) {
    throw new Error(`Unable to read ${label}: ${toErrorMessage(error)}`);
  }
};

export type ReviewCliOptions = { manifestPath: string; json: boolean };

export const parseReviewCliOptions = (args: string[]): ReviewCliOptions => {
  const separatorCount = args.filter((arg) => arg === "--").length;
  if (separatorCount > 1) {
    throw new Error("Review CLI accepts at most one standalone -- separator");
  }
  const normalizedArgs = args.filter((arg) => arg !== "--");
  const manifestArgs = normalizedArgs.filter((arg) => arg.startsWith("--manifest="));
  if (manifestArgs.length !== 1) {
    throw new Error("Review CLI requires exactly one --manifest=/absolute/path/manifest.json");
  }
  const unknown = normalizedArgs.filter(
    (arg) => arg !== "--json" && !arg.startsWith("--manifest="),
  );
  if (unknown.length > 0) throw new Error(`Unknown review option: ${unknown.join(", ")}`);
  const manifestPath = manifestArgs[0]?.slice("--manifest=".length).trim();
  if (!manifestPath) throw new Error("--manifest requires a path");
  return { manifestPath, json: normalizedArgs.includes("--json") };
};

export const runReviewCli = async (args = process.argv.slice(2)): Promise<CampaignRoundReviewPacket> => {
  const options = parseReviewCliOptions(args);
  const packet = await reviewCampaignRound(options.manifestPath);
  process.stdout.write(`${JSON.stringify(packet)}\n`);
  return packet;
};

const isMainModule = (): boolean => {
  const entryPoint = process.argv[1];
  return entryPoint !== undefined && resolve(entryPoint) === fileURLToPath(import.meta.url);
};

if (isMainModule()) {
  void runReviewCli().catch((error: unknown) => {
    console.error(error instanceof Error ? (error.stack ?? error.message) : error);
    process.exitCode = 1;
  });
}

const readString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0 ? value : undefined;

const readStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.map(readString).filter(isNonEmptyString) : [];

const readFiniteNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const uniqueStrings = (values: (string | null | undefined)[]): string[] =>
  [...new Set(values.filter(isNonEmptyString))];

const isNonEmptyString = (value: string | undefined | null): value is string =>
  typeof value === "string" && value.trim().length > 0;

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const sum = (values: number[]): number => values.reduce((total, value) => total + value, 0);

const toErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
