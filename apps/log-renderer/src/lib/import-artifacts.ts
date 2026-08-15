import type { ArtifactIssue, LogEvent, RunSnapshot } from "../types";
import { inferImportedSummary, isRecord } from "./model";

export type ImportedRun = {
  snapshot: RunSnapshot;
  events: LogEvent[];
  rawEventLines: string[];
};

type ImportedKind = "log" | "result" | "events";

export const classifyArtifactName = (name: string): ImportedKind | undefined => {
  if (name.endsWith(".events.jsonl")) return "events";
  if (name.endsWith(".log.json")) return "log";
  if (name.endsWith(".result.json")) return "result";
  return undefined;
};

const normalizeImportedEvent = (value: unknown): LogEvent | undefined => {
  if (!isRecord(value)) return undefined;
  return {
    ...value,
    phase: typeof value.phase === "string" ? value.phase : "unknown",
    level:
      value.level === "debug" ||
      value.level === "info" ||
      value.level === "warn" ||
      value.level === "error"
        ? value.level
        : "unknown",
  };
};

export const parseImportedJsonl = (
  text: string,
): { events: LogEvent[]; rawLines: string[]; issues: ArtifactIssue[] } => {
  const rawLines = text.split(/\r?\n/);
  if (rawLines.at(-1) === "") rawLines.pop();
  const events: LogEvent[] = [];
  const issues: ArtifactIssue[] = [];
  rawLines.forEach((line, index) => {
    if (!line.trim()) return;
    try {
      const event = normalizeImportedEvent(JSON.parse(line) as unknown);
      if (!event) throw new Error("JSONL event must be an object");
      events.push(event);
    } catch (error) {
      issues.push({
        artifact: "events",
        code: "CORRUPT_JSONL_LINE",
        line: index + 1,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });
  return { events, rawLines, issues };
};

export const importArtifactFiles = async (files: File[]): Promise<ImportedRun> => {
  let log: unknown = null;
  let result: unknown = null;
  let events: LogEvent[] = [];
  let rawEventLines: string[] = [];
  const issues: ArtifactIssue[] = [];
  const names: RunSnapshot["artifactNames"] = {};

  for (const file of files) {
    const kind = classifyArtifactName(file.name);
    if (!kind) {
      issues.push({
        artifact: "log",
        code: "UNSUPPORTED_FILE",
        message: `${file.name}: 지원하지 않는 파일명입니다.`,
      });
      continue;
    }
    const text = await file.text();
    if (kind === "events") {
      const parsed = parseImportedJsonl(text);
      events = parsed.events;
      rawEventLines = parsed.rawLines;
      issues.push(...parsed.issues);
      names.events = file.name;
      continue;
    }
    try {
      const value = JSON.parse(text) as unknown;
      if (kind === "log") {
        log = value;
        names.log = file.name;
      } else {
        result = value;
        names.result = file.name;
      }
    } catch (error) {
      issues.push({
        artifact: kind,
        code: "CORRUPT_JSON_ARTIFACT",
        message: `${file.name}: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  const name =
    files[0]?.name.replace(/\.(?:events\.jsonl|log\.json|result\.json)$/, "") ?? "가져온 실행";
  const summary = inferImportedSummary(name, log, result);
  summary.hasEvents = Boolean(names.events);
  return {
    snapshot: { summary, log, result, artifactNames: names, issues },
    events,
    rawEventLines,
  };
};
