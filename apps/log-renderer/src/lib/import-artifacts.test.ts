import assert from "node:assert/strict";
import test from "node:test";

import { classifyArtifactName, parseImportedJsonl } from "./import-artifacts";

void test("classifies supported artifact suffixes", () => {
  assert.equal(classifyArtifactName("run.log.json"), "log");
  assert.equal(classifyArtifactName("run.result.json"), "result");
  assert.equal(classifyArtifactName("run.events.jsonl"), "events");
  assert.equal(classifyArtifactName("notes.json"), undefined);
});

void test("keeps valid JSONL events and reports corrupt lines", () => {
  const parsed = parseImportedJsonl(
    '{"phase":"engine.start","level":"info"}\nnot-json\n{"phase":"engine.success","level":"info"}\n',
  );
  assert.equal(parsed.events.length, 2);
  assert.equal(parsed.issues.length, 1);
  assert.equal(parsed.issues[0]?.line, 2);
});
