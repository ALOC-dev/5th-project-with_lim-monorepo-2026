import assert from "node:assert/strict";
import { mkdir, mkdtemp, rename, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { LogCatalog, parseJsonlChunk } from "./catalog";

void test("parses complete JSONL lines and holds a partial tail", () => {
  const text = '{"phase":"one","level":"info"}\n{"phase":"two"';
  const parsed = parseJsonlChunk(Buffer.from(text), 10, 4);
  assert.equal(parsed.events.length, 1);
  assert.equal(parsed.events[0]?.phase, "one");
  assert.equal(parsed.nextOffset, 10 + Buffer.byteLength('{"phase":"one","level":"info"}\n'));
  assert.equal(parsed.nextLine, 5);
  assert.equal(parsed.complete, false);
  assert.equal(parsed.fileToken, "unknown");
});

void test("reports malformed completed lines and supports reset metadata", () => {
  const parsed = parseJsonlChunk(Buffer.from("bad\n"), 0, 1, true);
  assert.equal(parsed.issues[0]?.code, "CORRUPT_JSONL_LINE");
  assert.equal(parsed.issues[0]?.line, 1);
  assert.equal(parsed.reset, true);
});

void test("resets an incremental cursor when an events file is replaced", async () => {
  const root = await mkdtemp(join(tmpdir(), "log-renderer-replace-"));
  const eventsPath = join(root, "live.events.jsonl");
  await writeFile(eventsPath, '{"phase":"old","level":"info"}\n');
  const catalog = new LogCatalog(root);
  const run = (await catalog.listRuns())[0];
  assert.ok(run);
  const first = await catalog.readEvents(run.id, 0, 1);
  assert.ok(first);
  const replacement = join(root, "replacement.tmp");
  await writeFile(
    replacement,
    '{"phase":"new-one","level":"info"}\n{"phase":"new-two","level":"info"}\n',
  );
  await rename(replacement, eventsPath);

  const next = await catalog.readEvents(run.id, first.nextOffset, first.nextLine, first.fileToken);
  assert.equal(next?.reset, true);
  assert.deepEqual(
    next?.events.map((event) => event.phase),
    ["new-one", "new-two"],
  );
});

void test("groups complete, failed, and running artifacts", async () => {
  const root = await mkdtemp(join(tmpdir(), "log-renderer-catalog-"));
  await writeFile(
    join(root, "complete.log.json"),
    JSON.stringify({ name: "complete", scenario: "cafe", status: "PASS", durationMs: 12 }),
  );
  await writeFile(join(root, "complete.result.json"), JSON.stringify({ status: "SUCCESS" }));
  await writeFile(join(root, "running.events.jsonl"), '{"phase":"engine.start","level":"info"}\n');
  await writeFile(
    join(root, "failed.log.json"),
    JSON.stringify({ name: "failed", status: "FAIL" }),
  );

  const summaries = await new LogCatalog(root).listRuns();
  assert.equal(summaries.length, 3);
  assert.equal(summaries.find((run) => run.name === "complete")?.status, "PASS");
  assert.equal(summaries.find((run) => run.name === "failed")?.status, "FAIL");
  assert.equal(summaries.find((run) => run.name.startsWith("running"))?.status, "RUNNING");
});

void test("discovers development-server input, log JSONL, and result artifacts", async () => {
  const root = await mkdtemp(join(tmpdir(), "log-renderer-runtime-"));
  await writeFile(
    join(root, "success.input.json"),
    JSON.stringify({
      jobId: "success-job",
      userInput: { userNaturalLanguageRequest: "성수 파스타 추천" },
    }),
  );
  await writeFile(
    join(root, "success.log.jsonl"),
    '{"phase":"engine.process.start","level":"info"}\n',
  );
  await writeFile(
    join(root, "success.result.json"),
    JSON.stringify({
      jobId: "success-job",
      finishedAt: "2026-08-15T05:00:00.000Z",
      status: "SUCCESS",
    }),
  );
  await writeFile(
    join(root, "running.input.json"),
    JSON.stringify({
      jobId: "running-job",
      userInput: { userNaturalLanguageRequest: "을지로 카페 추천" },
    }),
  );
  await writeFile(
    join(root, "running.log.jsonl"),
    '{"phase":"engine.attempt.start","level":"info"}\n',
  );
  await writeFile(
    join(root, "failed.result.json"),
    JSON.stringify({ jobId: "failed-job", status: "THROWN" }),
  );

  const catalog = new LogCatalog([{ label: "dev-server", path: root }]);
  const summaries = await catalog.listRuns();
  assert.equal(summaries.length, 3);
  const success = summaries.find((run) => run.runId === "success-job");
  assert.equal(success?.name, "성수 파스타 추천");
  assert.equal(success?.status, "PASS");
  assert.equal(success?.relativeDirectory, "dev-server/.");
  assert.deepEqual(
    { log: success?.hasLog, result: success?.hasResult, events: success?.hasEvents },
    { log: true, result: true, events: true },
  );
  assert.equal(summaries.find((run) => run.runId === "running-job")?.status, "RUNNING");
  assert.equal(summaries.find((run) => run.runId === "failed-job")?.status, "FAIL");

  assert.ok(success);
  const snapshot = await catalog.getRun(success.id);
  assert.equal(snapshot?.artifactNames.log, "success.input.json");
  assert.equal(snapshot?.artifactNames.events, "success.log.jsonl");
  assert.equal(
    (snapshot?.log as { userInput?: { userNaturalLanguageRequest?: string } }).userInput
      ?.userNaturalLanguageRequest,
    "성수 파스타 추천",
  );
  const events = await catalog.readEvents(success.id, 0, 1);
  assert.equal(events?.events[0]?.phase, "engine.process.start");
});

void test("keeps identical artifact stems from separate roots distinct", async () => {
  const firstRoot = await mkdtemp(join(tmpdir(), "log-renderer-root-a-"));
  const secondRoot = await mkdtemp(join(tmpdir(), "log-renderer-root-b-"));
  await writeFile(join(firstRoot, "same.events.jsonl"), '{"phase":"first","level":"info"}\n');
  await writeFile(join(secondRoot, "same.events.jsonl"), '{"phase":"second","level":"info"}\n');

  const summaries = await new LogCatalog([
    { label: "first", path: firstRoot },
    { label: "second", path: secondRoot },
  ]).listRuns();
  assert.equal(summaries.length, 2);
  assert.notEqual(summaries[0]?.id, summaries[1]?.id);
  assert.deepEqual(
    new Set(summaries.map((run) => run.relativeDirectory)),
    new Set(["first/.", "second/."]),
  );
});

void test("rejects artifact references outside the root and symbolic artifacts", async () => {
  const root = await mkdtemp(join(tmpdir(), "log-renderer-security-"));
  const outside = await mkdtemp(join(tmpdir(), "log-renderer-outside-"));
  const outsideResult = join(outside, "outside.result.json");
  await writeFile(outsideResult, JSON.stringify({ status: "SUCCESS" }));
  await writeFile(
    join(root, "unsafe.log.json"),
    JSON.stringify({ name: "unsafe", status: "FAIL", resultFile: outsideResult }),
  );
  const symbolicResult = join(root, "symbolic.result.json");
  await symlink(outsideResult, symbolicResult);
  await writeFile(
    join(root, "symbolic.log.json"),
    JSON.stringify({ name: "symbolic", status: "FAIL", resultFile: symbolicResult }),
  );
  await mkdir(join(root, "nested"));

  const catalog = new LogCatalog(root);
  const run = (await catalog.listRuns()).find((summary) => summary.name === "unsafe");
  assert.ok(run);
  const snapshot = await catalog.getRun(run.id);
  assert.ok(snapshot?.issues.some((issue) => issue.code === "UNSAFE_ARTIFACT_REFERENCE"));
  const symbolicRun = (await catalog.listRuns()).find((summary) => summary.name === "symbolic");
  assert.ok(symbolicRun);
  const symbolicSnapshot = await catalog.getRun(symbolicRun.id);
  assert.ok(
    symbolicSnapshot?.issues.some(
      (issue) =>
        issue.code === "UNSAFE_ARTIFACT_REFERENCE" && issue.message.includes("non-symbolic"),
    ),
  );
});
