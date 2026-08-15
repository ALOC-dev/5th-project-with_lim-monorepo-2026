import assert from "node:assert/strict";
import test from "node:test";

import type { LogEvent, RunSnapshot } from "../types";
import {
  buildCandidates,
  eventMatches,
  getCandidateIdsForEvent,
  getRunStats,
  inferImportedSummary,
} from "./model";

const snapshot = (overrides: Partial<RunSnapshot> = {}): RunSnapshot => ({
  summary: {
    id: "run",
    name: "run",
    status: "PASS",
    modifiedAt: "2026-08-15T00:00:00.000Z",
    relativeDirectory: ".",
    hasLog: true,
    hasResult: true,
    hasEvents: true,
  },
  log: {
    trace: {
      generatedCandidates: [
        { candidateId: "a", name: "선택 장소", category: "카페" },
        { candidateId: "b", name: "탈락 장소", category: "식당" },
      ],
      selectedCandidateIds: ["a"],
      rejectedCandidates: [{ candidateId: "b", reason: "CLOSED" }],
      enrichmentVerifications: [{ candidateId: "a", status: "OPEN" }],
    },
  },
  result: {
    status: "SUCCESS",
    userOutput: { recommendations: [{ id: "a", name: "최종 선택", score: 91 }] },
  },
  artifactNames: {},
  issues: [],
  ...overrides,
});

void test("extracts candidate ids from context, scalar data, and known arrays", () => {
  const event: LogEvent = {
    level: "info",
    phase: "evaluateSeeds.ranking.selected",
    context: { candidateId: "context-id" },
    data: { candidateId: "data-id", selectedCandidateIds: ["selected", 1] },
  };
  assert.deepEqual(getCandidateIdsForEvent(event), ["context-id", "data-id", "selected"]);
});

void test("builds selected and rejected candidate views from result and trace", () => {
  const candidates = buildCandidates(snapshot());
  assert.equal(candidates[0]?.id, "a");
  assert.equal(candidates[0]?.name, "최종 선택");
  assert.equal(candidates[0]?.status, "SELECTED");
  assert.equal(candidates[1]?.status, "REJECTED");
  assert.equal(candidates[1]?.rejected.length, 1);
});

void test("derives stats and filters events without depending on UI rendering", () => {
  const events: LogEvent[] = [
    { level: "info", phase: "engine.attempt.start", attemptNo: 1 },
    { level: "warn", phase: "engine.attempt.needs_more_seeds", attemptNo: 1 },
    { level: "error", phase: "provider.failure", attemptNo: 2, context: { candidateId: "b" } },
  ];
  assert.deepEqual(getRunStats(snapshot(), events), {
    attempts: 2,
    candidates: 2,
    recommendations: 1,
    failures: 2,
    events: 3,
  });
  assert.equal(
    eventMatches(events[2]!, { level: "error", candidateId: "b", query: "provider" }),
    true,
  );
  assert.equal(eventMatches(events[0]!, { candidateId: "b" }), false);
});

void test("infers old result-only artifacts", () => {
  const summary = inferImportedSummary("legacy", null, {
    status: "SUCCESS",
    userOutput: { recommendations: [{ id: "one" }, { id: "two" }] },
  });
  assert.equal(summary.status, "PASS");
  assert.equal(summary.recommendationCount, 2);
});
