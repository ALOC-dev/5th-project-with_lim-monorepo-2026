import { createHash } from "node:crypto";
import { lstat, open, opendir, readFile, realpath, stat } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";

import type {
  ArtifactIssue,
  EventsChunk,
  JsonRecord,
  LogEvent,
  RunSnapshot,
  RunStatus,
  RunSummary,
} from "../src/types";

const LOG_SUFFIX = ".log.json";
const INPUT_SUFFIX = ".input.json";
const RESULT_SUFFIX = ".result.json";
const EVENTS_SUFFIX = ".events.jsonl";
const RUNTIME_EVENTS_SUFFIX = ".log.jsonl";
const METADATA_PREFIX_BYTES = 128 * 1024;

type ArtifactKind = "log" | "input" | "result" | "events";

export type LogCatalogRoot = {
  label: string;
  path: string;
};

type ResolvedLogCatalogRoot = LogCatalogRoot & {
  path: string;
  realPath?: string;
};

type RunFiles = {
  id: string;
  key: string;
  root: ResolvedLogCatalogRoot;
  log?: string;
  input?: string;
  result?: string;
  events?: string;
  modifiedAtMs: number;
};

type CachedMetadata = {
  signature: string;
  metadata: Partial<RunSummary>;
};

const metadataCache = new Map<string, CachedMetadata>();

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const artifactKind = (filePath: string): ArtifactKind | undefined => {
  if (filePath.endsWith(EVENTS_SUFFIX) || filePath.endsWith(RUNTIME_EVENTS_SUFFIX)) return "events";
  if (filePath.endsWith(INPUT_SUFFIX)) return "input";
  if (filePath.endsWith(LOG_SUFFIX)) return "log";
  if (filePath.endsWith(RESULT_SUFFIX)) return "result";
  return undefined;
};

const stripArtifactSuffix = (filePath: string): string => {
  for (const suffix of [
    RUNTIME_EVENTS_SUFFIX,
    EVENTS_SUFFIX,
    INPUT_SUFFIX,
    RESULT_SUFFIX,
    LOG_SUFFIX,
  ]) {
    if (filePath.endsWith(suffix)) return filePath.slice(0, -suffix.length);
  }
  return filePath;
};

const toId = (key: string): string =>
  createHash("sha256").update(key).digest("base64url").slice(0, 22);

const listArtifactFiles = async (root: string): Promise<string[]> => {
  const files: string[] = [];
  const visit = async (directory: string): Promise<void> => {
    const entries = await opendir(directory);
    for await (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const entryPath = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(entryPath);
      } else if (entry.isFile() && artifactKind(entryPath)) {
        files.push(entryPath);
      }
    }
  };

  try {
    await visit(root);
  } catch (error) {
    if (isRecord(error) && error.code === "ENOENT") return [];
    throw error;
  }
  return files;
};

const extractString = (text: string, key: string): string | undefined => {
  const match = new RegExp(`"${key}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`).exec(text);
  if (!match?.[1]) return undefined;
  try {
    return JSON.parse(`"${match[1]}"`) as string;
  } catch {
    return match[1];
  }
};

const extractNumber = (text: string, key: string): number | undefined => {
  const match = new RegExp(`"${key}"\\s*:\\s*(-?\\d+(?:\\.\\d+)?)`).exec(text);
  if (!match?.[1]) return undefined;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : undefined;
};

const readPrefix = async (filePath: string, size: number): Promise<string> => {
  const handle = await open(filePath, "r");
  try {
    const length = Math.min(size, METADATA_PREFIX_BYTES);
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, 0);
    return buffer.subarray(0, bytesRead).toString("utf8");
  } finally {
    await handle.close();
  }
};

const readRunMetadata = async (files: RunFiles): Promise<Partial<RunSummary>> => {
  const metadataPath = files.log ?? files.result ?? files.input ?? files.events;
  if (!metadataPath) return {};
  const fileStat = await stat(metadataPath);
  const signature = `${fileStat.size}:${fileStat.mtimeMs}`;
  const cached = metadataCache.get(metadataPath);
  if (cached?.signature === signature) return cached.metadata;

  let metadata: Partial<RunSummary> = {};
  if (files.log) {
    const text = await readPrefix(files.log, fileStat.size);
    const rawStatus = extractString(text, "status");
    metadata = {
      name: extractString(text, "name"),
      scenario: extractString(text, "scenario"),
      runId: extractString(text, "runId"),
      status: toRunStatus(rawStatus),
      engineStatus: extractString(text, "engineStatus"),
      durationMs: extractNumber(text, "durationMs"),
      recommendationCount: extractNumber(text, "recommendationCount"),
      generatedAt: extractString(text, "generatedAt"),
    };
  } else if (files.result) {
    const text = await readPrefix(files.result, fileStat.size);
    const engineStatus = extractString(text, "status");
    const inputText = files.input
      ? await readPrefix(files.input, (await stat(files.input)).size)
      : text;
    const request = extractString(inputText, "userNaturalLanguageRequest");
    const jobId = extractString(inputText, "jobId") ?? extractString(text, "jobId");
    metadata = {
      name: request ?? jobId,
      scenario: request,
      runId: jobId,
      status:
        engineStatus === "SUCCESS"
          ? "PASS"
          : engineStatus === "ERROR" || engineStatus === "THROWN"
            ? "FAIL"
            : "UNKNOWN",
      engineStatus,
      generatedAt: extractString(text, "finishedAt"),
    };
  } else if (files.input) {
    const text = await readPrefix(files.input, fileStat.size);
    const request = extractString(text, "userNaturalLanguageRequest");
    const jobId = extractString(text, "jobId");
    metadata = {
      name: request ?? jobId,
      scenario: request,
      runId: jobId,
      status: "RUNNING",
      engineStatus: "RUNNING",
    };
  } else {
    metadata = { status: "RUNNING" };
  }

  metadataCache.set(metadataPath, { signature, metadata });
  return metadata;
};

const toRunStatus = (status: string | undefined): RunStatus => {
  if (status === "PASS" || status === "FAIL" || status === "RUNNING") return status;
  return "UNKNOWN";
};

export class LogCatalog {
  private readonly roots: ResolvedLogCatalogRoot[];

  constructor(rootOrRoots: string | LogCatalogRoot[]) {
    const roots =
      typeof rootOrRoots === "string" ? [{ label: "logs", path: rootOrRoots }] : rootOrRoots;
    this.roots = roots.map((root) => ({ ...root, path: resolve(root.path) }));
  }

  private async getRootRealPath(root: ResolvedLogCatalogRoot): Promise<string> {
    root.realPath ??= await realpath(root.path);
    return root.realPath;
  }

  private async discover(): Promise<RunFiles[]> {
    const grouped = new Map<string, RunFiles>();
    for (const root of this.roots) {
      const files = await listArtifactFiles(root.path);
      for (const filePath of files) {
        const kind = artifactKind(filePath);
        if (!kind) continue;
        const key = stripArtifactSuffix(filePath);
        const groupedKey = `${root.path}\0${key}`;
        const fileStat = await stat(filePath);
        const current = grouped.get(groupedKey) ?? {
          id: toId(groupedKey),
          key,
          root,
          modifiedAtMs: 0,
        };
        current[kind] = filePath;
        current.modifiedAtMs = Math.max(current.modifiedAtMs, fileStat.mtimeMs);
        grouped.set(groupedKey, current);
      }
    }
    return [...grouped.values()];
  }

  async listRuns(): Promise<RunSummary[]> {
    const runs = await this.discover();
    const summaries = await Promise.all(
      runs.map(async (files): Promise<RunSummary> => {
        const metadata = await readRunMetadata(files);
        const defaultName = basename(files.key);
        return {
          id: files.id,
          name: metadata.name ?? defaultName,
          scenario: metadata.scenario,
          runId: metadata.runId,
          status: metadata.status ?? (files.log ? "UNKNOWN" : "RUNNING"),
          engineStatus: metadata.engineStatus,
          durationMs: metadata.durationMs,
          recommendationCount: metadata.recommendationCount,
          generatedAt: metadata.generatedAt,
          modifiedAt: new Date(files.modifiedAtMs).toISOString(),
          relativeDirectory: `${files.root.label}/${relative(files.root.path, dirname(files.key)) || "."}`,
          hasLog: Boolean(files.log ?? files.input),
          hasResult: Boolean(files.result),
          hasEvents: Boolean(files.events),
        };
      }),
    );
    return summaries.sort((left, right) => right.modifiedAt.localeCompare(left.modifiedAt));
  }

  private async findRun(id: string): Promise<RunFiles | undefined> {
    return (await this.discover()).find((run) => run.id === id);
  }

  private async safeFile(
    root: ResolvedLogCatalogRoot,
    candidate: string | undefined,
  ): Promise<string | undefined> {
    if (!candidate) return undefined;
    const requested = isAbsolute(candidate) ? resolve(candidate) : resolve(root.path, candidate);
    const rootRealPath = await this.getRootRealPath(root);
    const requestedStat = await lstat(requested);
    if (!requestedStat.isFile() || requestedStat.isSymbolicLink()) {
      throw new Error("Artifact reference must point to a regular non-symbolic file");
    }
    const requestedRealPath = await realpath(requested);
    const boundary = relative(rootRealPath, requestedRealPath);
    if (boundary === ".." || boundary.startsWith(`..${sep}`) || isAbsolute(boundary)) {
      throw new Error("Artifact reference resolves outside the allowed log root");
    }
    return requestedRealPath;
  }

  private async readJsonArtifact(
    root: ResolvedLogCatalogRoot,
    kind: "log" | "result",
    filePath: string | undefined,
  ): Promise<{ value: unknown; issue?: ArtifactIssue }> {
    if (!filePath) return { value: null };
    try {
      const safePath = await this.safeFile(root, filePath);
      if (!safePath) return { value: null };
      return { value: JSON.parse(await readFile(safePath, "utf8")) as unknown };
    } catch (error) {
      return {
        value: null,
        issue: {
          artifact: kind,
          code: "ARTIFACT_READ_FAILED",
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  async getRun(id: string): Promise<RunSnapshot | undefined> {
    const files = await this.findRun(id);
    if (!files) return undefined;
    const summaries = await this.listRuns();
    const summary = summaries.find((item) => item.id === id);
    if (!summary) return undefined;

    const initialLog = await this.readJsonArtifact(files.root, "log", files.log ?? files.input);
    const logRecord = isRecord(initialLog.value) ? initialLog.value : undefined;
    const referencedResult =
      typeof logRecord?.resultFile === "string" ? logRecord.resultFile : undefined;
    const referencedEvents =
      typeof logRecord?.eventsFile === "string" ? logRecord.eventsFile : undefined;
    const issues: ArtifactIssue[] = initialLog.issue ? [initialLog.issue] : [];

    let resultPath = files.result;
    if (referencedResult) {
      try {
        resultPath = await this.safeFile(files.root, referencedResult);
      } catch (error) {
        issues.push({
          artifact: "result",
          code: "UNSAFE_ARTIFACT_REFERENCE",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    let eventsPath = files.events;
    if (referencedEvents) {
      try {
        eventsPath = await this.safeFile(files.root, referencedEvents);
      } catch (error) {
        issues.push({
          artifact: "events",
          code: "UNSAFE_ARTIFACT_REFERENCE",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const result = await this.readJsonArtifact(files.root, "result", resultPath);
    if (result.issue) issues.push(result.issue);
    return {
      summary: { ...summary, hasEvents: Boolean(eventsPath) },
      log: initialLog.value,
      result: result.value,
      artifactNames: {
        log: files.log ? basename(files.log) : files.input ? basename(files.input) : undefined,
        result: resultPath ? basename(resultPath) : undefined,
        events: eventsPath ? basename(eventsPath) : undefined,
      },
      issues,
    };
  }

  async readEvents(
    id: string,
    requestedOffset: number,
    requestedLine: number,
    requestedFileToken?: string,
  ): Promise<EventsChunk | undefined> {
    const files = await this.findRun(id);
    if (!files) return undefined;
    let eventsPath = files.events;
    if (files.log) {
      const log = await this.readJsonArtifact(files.root, "log", files.log);
      const logRecord = isRecord(log.value) ? log.value : undefined;
      if (typeof logRecord?.eventsFile === "string") {
        try {
          eventsPath = await this.safeFile(files.root, logRecord.eventsFile);
        } catch {
          // 오래된 절대 경로가 깨졌다면 같은 stem으로 발견한 안전한 파일을 사용한다.
        }
      }
    }
    if (!eventsPath) return undefined;
    const safePath = await this.safeFile(files.root, eventsPath);
    if (!safePath) return undefined;
    const fileStat = await stat(safePath);
    const fileToken = `${fileStat.dev}:${fileStat.ino}`;
    const reset =
      requestedOffset < 0 ||
      requestedOffset > fileStat.size ||
      (requestedFileToken !== undefined && requestedFileToken !== fileToken);
    const offset = reset ? 0 : requestedOffset;
    const line = reset ? 1 : Math.max(1, requestedLine);
    const handle = await open(safePath, "r");
    try {
      const buffer = Buffer.alloc(fileStat.size - offset);
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, offset);
      return parseJsonlChunk(buffer.subarray(0, bytesRead), offset, line, reset, fileToken);
    } finally {
      await handle.close();
    }
  }
}

export const parseJsonlChunk = (
  chunk: Buffer,
  offset: number,
  firstLine: number,
  reset = false,
  fileToken = "unknown",
): EventsChunk => {
  const finalNewlineIndex = chunk.lastIndexOf(0x0a);
  const completeBuffer =
    finalNewlineIndex >= 0 ? chunk.subarray(0, finalNewlineIndex + 1) : Buffer.alloc(0);
  const text = completeBuffer.toString("utf8");
  const rawLines = text.length > 0 ? text.split("\n").slice(0, -1) : [];
  const events: LogEvent[] = [];
  const issues: ArtifactIssue[] = [];

  rawLines.forEach((rawLine, index) => {
    if (!rawLine.trim()) return;
    try {
      const parsed = JSON.parse(rawLine) as unknown;
      if (!isRecord(parsed)) throw new Error("JSONL event must be an object");
      events.push(normalizeEvent(parsed));
    } catch (error) {
      issues.push({
        artifact: "events",
        code: "CORRUPT_JSONL_LINE",
        line: firstLine + index,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  return {
    events,
    rawLines,
    issues,
    nextOffset: offset + completeBuffer.length,
    nextLine: firstLine + rawLines.length,
    fileToken,
    reset,
    complete: finalNewlineIndex === chunk.length - 1,
  };
};

const normalizeEvent = (event: JsonRecord): LogEvent => ({
  ...event,
  level:
    event.level === "debug" ||
    event.level === "info" ||
    event.level === "warn" ||
    event.level === "error"
      ? event.level
      : "unknown",
  phase: typeof event.phase === "string" ? event.phase : "unknown",
  ...(typeof event.attemptNo === "number" ? { attemptNo: event.attemptNo } : {}),
  ...(typeof event.retryNo === "number" ? { retryNo: event.retryNo } : {}),
  ...(typeof event.durationMs === "number" ? { durationMs: event.durationMs } : {}),
  ...(isRecord(event.context) ? { context: event.context } : {}),
  ...(isRecord(event.data) ? { data: event.data } : {}),
  ...(isRecord(event.error) ? { error: event.error } : {}),
});
