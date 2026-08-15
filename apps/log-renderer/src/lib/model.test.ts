import assert from "node:assert/strict";
import test from "node:test";

import type { LogEvent, RunSnapshot } from "../types";
import {
  buildCandidates,
  eventMatches,
  getCandidateIdsForEvent,
  getRunStats,
  getUserInput,
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

void test("extracts candidate ids from context, scalar data, and nested arrays", () => {
  const event: LogEvent = {
    level: "info",
    phase: "evaluateSeeds.ranking.selected",
    context: { candidateId: "context-id" },
    data: {
      candidateId: "data-id",
      selectedCandidateIds: ["selected", 1],
      results: [{ candidateId: "array-id" }],
    },
  };
  assert.deepEqual(getCandidateIdsForEvent(event), [
    "context-id",
    "data-id",
    "array-id",
    "selected",
  ]);
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

void test("adapts development-server input and event candidates", () => {
  const runtimeSnapshot = snapshot({
    log: {
      jobId: "job",
      userInput: { userNaturalLanguageRequest: "노원 마라탕" },
    },
    result: null,
  });
  const events: LogEvent[] = [
    {
      level: "info",
      phase: "discoverSeeds.discover.result",
      data: {
        output: {
          seeds: [{ seedKey: "tmap:1", name: "마라 식당", roadAddress: "노원로" }],
        },
      },
    },
    {
      level: "info",
      phase: "evaluateSeeds.reference_urls.success",
      data: {
        results: [{ candidateId: "tmap:1", status: "REJECTED", rejectedReason: "closed" }],
      },
    },
  ];

  assert.equal(getUserInput(runtimeSnapshot)?.userNaturalLanguageRequest, "노원 마라탕");
  const candidates = buildCandidates(runtimeSnapshot, events);
  assert.equal(candidates[0]?.name, "마라 식당");
  assert.equal(candidates[0]?.status, "REJECTED");
  assert.equal(candidates[0]?.rejected.length, 1);
});

void test("infers old result-only artifacts", () => {
  const summary = inferImportedSummary("legacy", null, {
    status: "SUCCESS",
    userOutput: { recommendations: [{ id: "one" }, { id: "two" }] },
  });
  assert.equal(summary.status, "PASS");
  assert.equal(summary.recommendationCount, 2);
});
