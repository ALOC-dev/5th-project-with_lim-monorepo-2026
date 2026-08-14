import assert from "node:assert/strict";
import { promises as fileSystem } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createJsonlFileSink, createLogger, type LogEvent } from "./logger.js";

void test("flushes every queued JSONL event without a timing delay", async () => {
  const directory = await fileSystem.mkdtemp(path.join(tmpdir(), "reco-jsonl-flush-"));
  const logFile = path.join(directory, "nested", "events.jsonl");

  try {
    const sink = createJsonlFileSink(logFile);
    const logger = createLogger(sink);

    logger.info("engine.process.start", { targetCount: 5 });
    logger.warn("engine.attempt.needs_more_seeds", { reason: "LOW_QUALITY" });
    await sink.flush();

    logger.info("engine.process.success", { recommendationCount: 5 });
    await sink.drain();

    const events = (await fileSystem.readFile(logFile, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as LogEvent);

    assert.deepEqual(
      events.map((event) => event.phase),
      ["engine.process.start", "engine.attempt.needs_more_seeds", "engine.process.success"],
    );
  } finally {
    await fileSystem.rm(directory, { recursive: true, force: true });
  }
});

void test("keeps logging calls non-throwing but reports file failures from flush", async () => {
  const directory = await fileSystem.mkdtemp(path.join(tmpdir(), "reco-jsonl-failure-"));
  const blockingParent = path.join(directory, "not-a-directory");
  const logFile = path.join(blockingParent, "events.jsonl");

  try {
    await fileSystem.writeFile(blockingParent, "blocks mkdir", "utf8");
    const sink = createJsonlFileSink(logFile);
    const logger = createLogger(sink);

    assert.doesNotThrow(() => logger.info("engine.process.start"));
    await assert.rejects(
      sink.flush(),
      /EEXIST|ENOTDIR|file already exists|not a directory/iu,
    );
  } finally {
    await fileSystem.rm(directory, { recursive: true, force: true });
  }
});
