import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";

import { createApiError, type PlaceRecommendationSseEvent } from "@monorepo/api-contracts";
import {
  DEFAULT_ENGINE_CONFIG,
  type EngineOutput,
  RecommendationEngine,
  type RecommendationEngineSecrets,
} from "@monorepo/recommendation-engine";
import { type UserInput, UserInputSchema } from "@monorepo/recommendation-engine/v1/contracts";
import { Router } from "express";
import { z } from "zod";

import { db } from "../db/client.js";
import { placeRecommendationHistories } from "../db/schema.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { requireAuth } from "../middleware/auth.js";
import { presentRecommendationError, RECOMMENDATION_FAILURE_EVENT } from "./error-presentation.js";
import {
  deriveRecommendationHistoryTitle,
  type RecommendationTerminalDelivery,
  resolveRecommendationTerminalDelivery,
} from "./history.js";
import {
  HISTORY_PERSISTENCE_FAILURE,
  persistRecommendationTerminalState,
} from "./terminal-persistence.js";

type JobState = {
  readonly userId: string;
  readonly userInput: UserInput;
  emitter: EventEmitter | null;
  readonly bufferedEvents: PlaceRecommendationSseEvent[];
  started: boolean;
};

export const createRecommendationRouter = (secrets: RecommendationEngineSecrets): Router => {
  const router = Router();
  const jobStore = new Map<string, JobState>();

  router.post(
    "/",
    requireAuth,
    asyncHandler(async (req, res) => {
      const parsed = UserInputSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json(createApiError("invalid input"));
        return;
      }

      const jobId = randomUUID();
      await db.insert(placeRecommendationHistories).values({
        id: jobId,
        userIds: [req.userId],
        title: deriveRecommendationHistoryTitle(parsed.data.userNaturalLanguageRequest),
        input: parsed.data,
      });
      jobStore.set(jobId, {
        userId: req.userId,
        userInput: parsed.data,
        emitter: null,
        bufferedEvents: [],
        started: false,
      });
      res.status(201).json({ jobId });
    }),
  );

  router.get("/stream/:jobId", requireAuth, (req, res) => {
    const parsedJobId = z.uuid().safeParse(req.params.jobId);
    if (!parsedJobId.success) {
      res.status(400).json(createApiError("invalid input"));
      return;
    }

    const jobId = parsedJobId.data;
    const jobState = jobStore.get(jobId);
    if (!jobState || jobState.userId !== req.userId) {
      res.status(404).json(createApiError("recommendation job not found"));
      return;
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    for (const event of [...jobState.bufferedEvents]) {
      res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      if (event.type === "result" || event.type === "error") {
        res.end();
        return;
      }
    }

    jobState.emitter ??= new EventEmitter();
    const emitter = jobState.emitter;
    const sseHandler = (event: PlaceRecommendationSseEvent) => {
      if (res.writableEnded) return;
      res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      if (event.type === "result" || event.type === "error") res.end();
    };
    const closeHandler = () => {
      if (!res.writableEnded) res.end();
    };
    emitter.on("sse", sseHandler);
    emitter.on("close", closeHandler);

    const heartbeatInterval = setInterval(() => {
      if (res.writableEnded) {
        clearInterval(heartbeatInterval);
        return;
      }
      res.write(`event: heartbeat\ndata: {}\n\n`);
    }, 10_000);

    if (!jobState.started) {
      jobState.started = true;
      const emitEvent = (event: PlaceRecommendationSseEvent) => {
        jobState.bufferedEvents.push(event);
        emitter.emit("sse", event);
      };
      const closeSubscribersAndDiscardJob = (): void => {
        emitter.emit("close");
        emitter.removeAllListeners();
        jobStore.delete(jobId);
      };
      const emitTerminalDelivery = (
        delivery: RecommendationTerminalDelivery,
        output: Extract<EngineOutput, { readonly status: "SUCCESS" }> | null,
      ): void => {
        switch (delivery) {
          case "result":
            if (output === null) {
              closeSubscribersAndDiscardJob();
              return;
            }
            emitEvent({ type: "result", data: output.userOutput });
            return;
          case "error":
            emitEvent(RECOMMENDATION_FAILURE_EVENT);
            return;
          case "disconnect":
            closeSubscribersAndDiscardJob();
            return;
        }
      };
      const persistFailureFallback = () =>
        persistRecommendationTerminalState(jobId, {
          kind: "FAILED",
          code: HISTORY_PERSISTENCE_FAILURE.code,
          message: HISTORY_PERSISTENCE_FAILURE.message,
        });
      const handleEngineFailure = async (failure: unknown): Promise<void> => {
        const presentation = presentRecommendationError(failure, secrets);
        console.error(
          JSON.stringify({ event: "recommendation.process.failure", ...presentation.internal }),
        );
        const delivery = await resolveRecommendationTerminalDelivery(
          "error",
          () =>
            persistRecommendationTerminalState(jobId, {
              kind: "FAILED",
              code: presentation.internal.code,
              message: presentation.internal.message,
            }),
          persistFailureFallback,
        );
        emitTerminalDelivery(delivery, null);
      };
      const processRecommendation = async (): Promise<void> => {
        let result: EngineOutput;
        try {
          result = await new RecommendationEngine(jobState.userInput, DEFAULT_ENGINE_CONFIG, {
            loggingActivated: true,
            onProgress: (step) => emitEvent({ type: "progress", step }),
            secrets,
          }).process();
        } catch (error: unknown) {
          await handleEngineFailure(error);
          return;
        }

        switch (result.status) {
          case "SUCCESS": {
            const delivery = await resolveRecommendationTerminalDelivery(
              "result",
              () =>
                persistRecommendationTerminalState(jobId, {
                  kind: "COMPLETED",
                  output: result.userOutput,
                }),
              persistFailureFallback,
            );
            emitTerminalDelivery(delivery, result);
            return;
          }
          case "ERROR":
            await handleEngineFailure(result.error);
            return;
        }
      };
      void processRecommendation()
        .catch((error: unknown) => {
          console.error(
            JSON.stringify({
              event: "recommendation.delivery.failure",
              jobId,
              errorName: error instanceof Error ? error.name : "UnknownError",
            }),
          );
          closeSubscribersAndDiscardJob();
        })
        .finally(() => setTimeout(() => jobStore.delete(jobId), 5000));
    }

    req.on("close", () => {
      clearInterval(heartbeatInterval);
      emitter.removeListener("sse", sseHandler);
      emitter.removeListener("close", closeHandler);
    });
  });

  return router;
};
