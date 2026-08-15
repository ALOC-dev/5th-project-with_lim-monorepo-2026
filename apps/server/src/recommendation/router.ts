import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";

import {
  createApiError,
  type PlaceRecommendationFormLocationSnapshot,
  PlaceRecommendationJobRequestSchema,
  type PlaceRecommendationSseEvent,
} from "@monorepo/api-contracts";
import {
  DEFAULT_ENGINE_CONFIG,
  type EngineOutput,
  RecommendationEngine,
  type RecommendationEngineSecrets,
} from "@monorepo/recommendation-engine";
import { type UserInput, UserInputSchema } from "@monorepo/recommendation-engine/v1/contracts";
import { and, arrayContains, eq } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";

import { db } from "../db/client.js";
import { placeRecommendationHistories } from "../db/schema.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { requireAuth } from "../middleware/auth.js";
import {
  presentRecommendationError,
  presentStoredRecommendationFailure,
  RECOMMENDATION_FAILURE_EVENT,
} from "./error-presentation.js";
import {
  deriveRecommendationHistoryStatus,
  deriveRecommendationHistoryTitle,
  type RecommendationTerminalDelivery,
  resolveRecommendationTerminalDelivery,
} from "./history.js";
import { createRecommendationRunLog } from "./run-log.js";
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

const formLocationsMatchInput = (
  userInput: UserInput,
  formLocations: readonly PlaceRecommendationFormLocationSnapshot[],
): boolean =>
  userInput.location.length === formLocations.length &&
  userInput.location.every(
    (location, index) =>
      location.lat === formLocations[index]?.lat && location.lng === formLocations[index]?.lng,
  );

export const createRecommendationRouter = (secrets: RecommendationEngineSecrets): Router => {
  const router = Router();
  const jobStore = new Map<string, JobState>();

  router.post(
    "/",
    requireAuth,
    asyncHandler(async (req, res) => {
      const request = PlaceRecommendationJobRequestSchema.safeParse(req.body);
      if (!request.success) {
        res.status(400).json(createApiError("invalid input"));
        return;
      }

      const parsed = UserInputSchema.safeParse(request.data.input);
      if (!parsed.success || !formLocationsMatchInput(parsed.data, request.data.formLocations)) {
        res.status(400).json(createApiError("invalid input"));
        return;
      }

      const jobId = randomUUID();
      await db.insert(placeRecommendationHistories).values({
        id: jobId,
        userIds: [req.userId],
        title: deriveRecommendationHistoryTitle(parsed.data.userNaturalLanguageRequest),
        input: parsed.data,
        formLocations: request.data.formLocations,
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
    void (async () => {
      const [history] = await db
        .select()
        .from(placeRecommendationHistories)
        .where(
          and(
            eq(placeRecommendationHistories.id, jobId),
            arrayContains(placeRecommendationHistories.userIds, [req.userId]),
          ),
        );
      if (!history) {
        res.status(404).json(createApiError("recommendation job not found"));
        return;
      }

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders();

      const storedStatus = deriveRecommendationHistoryStatus(history);
      if (storedStatus === "COMPLETED" && history.output !== null) {
        res.write(
          `event: result\ndata: ${JSON.stringify({ type: "result", data: history.output })}\n\n`,
        );
        res.end();
        return;
      }
      if (storedStatus === "FAILED") {
        const failure = presentStoredRecommendationFailure(history.errorCode);
        res.write(
          `event: error\ndata: ${JSON.stringify({
            ...failure,
          })}\n\n`,
        );
        res.end();
        return;
      }

      const jobState =
        jobStore.get(jobId) ??
        ({
          userId: req.userId,
          userInput: history.input,
          emitter: null,
          bufferedEvents: [],
          started: false,
        } satisfies JobState);
      jobStore.set(jobId, jobState);
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

      for (const event of [...jobState.bufferedEvents]) {
        sseHandler(event);
        if (res.writableEnded) {
          clearInterval(heartbeatInterval);
          emitter.removeListener("sse", sseHandler);
          emitter.removeListener("close", closeHandler);
          return;
        }
      }

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
          failureEvent: Extract<
            PlaceRecommendationSseEvent,
            { readonly type: "error" }
          > = RECOMMENDATION_FAILURE_EVENT,
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
              emitEvent(failureEvent);
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
                message: presentation.publicEvent.message,
              }),
            () =>
              persistRecommendationTerminalState(jobId, {
                kind: "FAILED",
                code: presentation.internal.code,
                message: presentation.publicEvent.message,
              }),
          );
          emitTerminalDelivery(delivery, null, presentation.publicEvent);
        };
        const processRecommendation = async (): Promise<void> => {
          // 실행 단위로 로그/입력/결과를 파일에 남긴다. stdout만 보던 예전에는
          // 터미널을 놓치면 실패 원인을 되짚을 방법이 없었다.
          const runLog = createRecommendationRunLog(jobId);
          await runLog.writeInput(jobState.userInput);

          let result: EngineOutput;
          try {
            result = await new RecommendationEngine(jobState.userInput, DEFAULT_ENGINE_CONFIG, {
              logger: runLog.logger,
              onProgress: (step) =>
                emitEvent({ type: "progress", step, startedAt: new Date().toISOString() }),
              secrets,
            }).process();
          } catch (error: unknown) {
            await runLog.flush();
            await runLog.writeResult({ status: "THROWN", error });
            await handleEngineFailure(error);
            return;
          }
          await runLog.flush();
          await runLog.writeResult(result);

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
    })().catch((error: unknown) => {
      console.error(
        JSON.stringify({
          event: "recommendation.stream.failure",
          jobId,
          errorName: error instanceof Error ? error.name : "UnknownError",
        }),
      );
      if (!res.headersSent) {
        res.status(500).json(createApiError("failed to open recommendation stream"));
        return;
      }
      if (!res.writableEnded) res.end();
    });
  });

  return router;
};
