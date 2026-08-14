import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";

import {
  CancelCourseResponseDataSchema,
  type CourseCandidateDecision,
  type CourseFailure,
  type CourseOptionAnyDetail,
  CourseOptionAnyDetailSchema,
  type CourseOptionDetail,
  CourseOptionDetailSchema,
  type CourseOptionSummary,
  CourseOptionSummarySchema,
  type CourseOptionV2Summary,
  CourseOptionV2SummarySchema,
  CourseProgressStepV2Schema,
  type CourseRecommendationProgressStep,
  type CourseRecommendationSseEvent,
  type CourseRecommendationSseEventV2,
  CourseResultSchema,
  CourseStatusSchema,
  type CourseStop,
  type CourseStopV2,
  CourseStopV2Schema,
  createApiError,
  createApiResponse,
  type CreateCourseRequest,
  CreateCourseRequestSchema,
  CreateCourseResponseDataSchema,
  DeleteCourseResponseDataSchema,
  ListCoursesResponseDataSchema,
  ListFavoriteCourseOptionsResponseDataSchema,
  RemoveSavedCourseOptionResponseDataSchema,
  RenameCourseRequestSchema,
  RenameCourseResponseDataSchema,
  SetCourseOptionFavoriteRequestSchema,
  SetCourseOptionFavoriteResponseDataSchema,
} from "@monorepo/api-contracts";
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNull,
  lt,
  or,
  sql,
} from "drizzle-orm";
import { type Response, Router } from "express";
import { z } from "zod";

import { CourseCandidateResolutionError, assertOwnedSavedCandidates } from "../courseRecommendation/candidates.js";
import { presentEstimatedCostPerPerson } from "../courseRecommendation/cost.js";
import {
  type CourseEngineResult,
  type CourseRecommendationEngine,
} from "../courseRecommendation/engine.js";
import {
  logCourseRecommendationFailure,
  presentCourseEngineFailure,
  presentStoredCourseFailure,
  UNEXPECTED_COURSE_FAILURE,
} from "../courseRecommendation/failure.js";
import { defaultCourseTitle } from "../courseRecommendation/title.js";
import { db } from "../db/client.js";
import {
  courseOptions,
  coursePlaces,
  courses,
  savedCourseOptions,
} from "../db/schema.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { requireAuth } from "../middleware/auth.js";

type CourseRow = typeof courses.$inferSelect;
type CourseOptionRow = typeof courseOptions.$inferSelect;
type CoursePlaceRow = typeof coursePlaces.$inferSelect;

const LEASE_DURATION_MS = 45_000;
const LEASE_RENEWAL_MS = 15_000;
const RECOVERY_INTERVAL_MS = 30_000;
const TERMINAL_JOB_RETENTION_MS = 60_000;
const LEGACY_OPTION_TYPES = ["이동 최소", "느긋한 흐름", "장소 다양성", "식사 우선"] as const;

type CourseJob = {
  readonly courseId: string;
  readonly userId: string;
  readonly input: CreateCourseRequest;
  readonly inputVersion: 1 | 2;
  readonly bufferedEvents: CourseRecommendationSseEvent[];
  readonly emitter: EventEmitter;
  readonly controller: AbortController;
  started: boolean;
  runToken: string | null;
  sequence: number;
};

const isAbortError = (error: unknown): boolean =>
  error instanceof Error &&
  (error.name === "AbortError" || error.message.toLowerCase().includes("cancel"));

const isV2Input = (input: CreateCourseRequest): input is Extract<CreateCourseRequest, { version: 2 }> =>
  "version" in input && input.version === 2;

const toStatus = (value: string) => CourseStatusSchema.parse(value);

const toLegacyStop = (row: CoursePlaceRow): CourseStop => ({
  id: row.id,
  sequence: row.sequence,
  visitTime: row.visitTime,
  stayMinutes: row.stayDurationMinutes,
  activityLabel: row.activityType,
  source: row.source === "FAVORITE" ? "FAVORITE" : "KAKAO",
  kakaoPlaceId: row.kakaoPlaceId ?? row.enginePlaceId ?? row.id,
  favoritePlaceId: row.favoritePlaceId,
  name: row.name,
  address: row.address,
  category: row.category,
  lat: Number(row.lat),
  lng: Number(row.lng),
});

const toV2Stop = (row: CoursePlaceRow): CourseStopV2 => {
  const place = row.placeData;
  const mainCategory = place?.mainCategory ?? row.activityType ?? "분류 미확인";
  const subCategory = place?.subCategory ?? row.category ?? "분류 미확인";
  const categoryLabel = mainCategory === subCategory
    ? mainCategory
    : `${mainCategory} · ${subCategory}`;
  return CourseStopV2Schema.parse({
    id: row.id,
    sequence: row.sequence,
    enginePlaceId: row.enginePlaceId ?? place?.id ?? row.id,
    source: row.source === "SAVED_PLACE" ? "SAVED_PLACE" : "DIRECT_SEARCH",
    savedPlaceId: row.savedPlaceId,
    kakaoPlaceId: row.kakaoPlaceId,
    kakaoPlaceUrl: place?.referenceUrls.kakaoMap ?? null,
    name: row.name,
    address: row.address?.trim() ? row.address : null,
    mainCategory,
    subCategory,
    categoryLabel,
    activityLabel: row.activityType,
    lat: Number(row.lat),
    lng: Number(row.lng),
    visitTime: row.visitTime,
    stayMinutes: row.stayDurationMinutes,
    travelMinutesFromPrevious: row.travelMinutesFromPrevious,
    waitMinutesFromPrevious: row.waitMinutesFromPrevious,
  });
};

const optionById = async (optionId: string): Promise<CourseOptionRow | null> => {
  const [option] = await db.select().from(courseOptions).where(eq(courseOptions.id, optionId));
  return option ?? null;
};

const stopsForOptions = async (
  optionIds: readonly string[],
): Promise<ReadonlyMap<string, CoursePlaceRow[]>> => {
  if (optionIds.length === 0) return new Map();
  const rows = await db
    .select()
    .from(coursePlaces)
    .where(inArray(coursePlaces.courseOptionId, [...optionIds]))
    .orderBy(asc(coursePlaces.courseOptionId), asc(coursePlaces.sequence), asc(coursePlaces.id));
  const byOption = new Map<string, CoursePlaceRow[]>();
  for (const row of rows) {
    const current = byOption.get(row.courseOptionId) ?? [];
    current.push(row);
    byOption.set(row.courseOptionId, current);
  }
  return byOption;
};

const toLegacyOptions = async (
  rows: readonly CourseOptionRow[],
): Promise<CourseOptionSummary[]> => {
  const stops = await stopsForOptions(rows.map((row) => row.id));
  return rows.map((row) =>
    CourseOptionSummarySchema.parse({
      id: row.id,
      courseId: row.courseId,
      type: row.optionType,
      totalDurationMinutes: row.totalDurationMinutes,
      totalTravelMinutes: row.totalTravelMinutes,
      pricePerPersonWon: row.pricePerPersonWon,
      isFavorite: row.favorite,
      routePath: row.routePath,
      stops: (stops.get(row.id) ?? []).map(toLegacyStop),
    }),
  );
};

const toV2Options = async (
  rows: readonly CourseOptionRow[],
): Promise<CourseOptionV2Summary[]> => {
  const stops = await stopsForOptions(rows.map((row) => row.id));
  return rows.flatMap((row) => {
    const engine = row.engineOutput;
    if (!engine) return [];
    const optionStops = (stops.get(row.id) ?? []).map(toV2Stop);
    const [minCost, maxCost] = engine.summary.estimatedCostPerPerson;
    const estimatedCostPerPerson = presentEstimatedCostPerPerson([minCost, maxCost]);
    return [
      CourseOptionV2SummarySchema.parse({
        id: row.id,
        courseId: row.courseId,
        engineCourseId: row.engineCourseId ?? engine.id,
        rank: row.rank,
        title: engine.title,
        courseType: engine.courseType,
        selection: engine.selection,
        estimatedCostPerPerson,
        startTime: engine.startTime24h,
        endTime: engine.endTime24h,
        totalDurationMinutes: engine.summary.estimatedTotalMinutes,
        totalTravelMinutes: engine.totalTravelMinutes,
        totalStayMinutes: engine.totalStayMinutes,
        totalWaitMinutes: optionStops.reduce(
          (total, stop) => total + stop.waitMinutesFromPrevious,
          0,
        ),
        mealPlan: engine.mealPlan,
        score: engine.score,
        scoreBreakdown: engine.scoreBreakdown,
        isFavorite: row.favorite,
        routePathSource: row.routePathSource,
        routePath: row.routePath,
        stops: optionStops,
        candidateDecisions: row.candidateDecisions,
        type: engine.courseType.label,
        reason: engine.selection.reasonTexts.join(" ") || null,
        pricePerPersonWon: estimatedCostPerPerson.quality === "UNKNOWN"
          ? null
          : Math.round((minCost + maxCost) / 2),
      }),
    ];
  });
};

const getOwnedCourse = async (courseId: string, userId: string): Promise<CourseRow | null> => {
  const [course] = await db
    .select()
    .from(courses)
    .where(and(eq(courses.id, courseId), eq(courses.userId, userId), isNull(courses.deletedAt)));
  return course ?? null;
};

const getOwnedOption = async (
  optionId: string,
  userId: string,
): Promise<{ course: CourseRow; option: CourseOptionRow } | null> => {
  const option = await optionById(optionId);
  if (!option) return null;
  const course = await getOwnedCourse(option.courseId, userId);
  return course ? { course, option } : null;
};

const getUserOptionIncludingDeleted = async (
  optionId: string,
  userId: string,
): Promise<{ course: CourseRow; option: CourseOptionRow } | null> => {
  const option = await optionById(optionId);
  if (!option) return null;
  const [course] = await db
    .select()
    .from(courses)
    .where(and(eq(courses.id, option.courseId), eq(courses.userId, userId)));
  return course ? { course, option } : null;
};

const storedFailure = (course: CourseRow): CourseFailure | null => {
  if (course.status !== "FAILED") return null;
  const presentation = presentStoredCourseFailure(course.errorCode);
  return {
    code: presentation.code,
    retryable: course.errorRetryable ?? presentation.code !== "COURSE_INVALID_INPUT",
    message: presentation.message,
  };
};

const toAnyOptionDetail = async (
  course: CourseRow,
  option: CourseOptionRow,
): Promise<CourseOptionAnyDetail> => {
  if (course.inputVersion === 2 && option.engineOutput) {
    const [summary] = await toV2Options([option]);
    return CourseOptionAnyDetailSchema.parse(summary);
  }
  const [summary] = await toLegacyOptions([option]);
  return CourseOptionDetailSchema.parse({ ...summary, reason: option.reason });
};

const toCourseResult = async (course: CourseRow) => {
  const optionRows = await db
    .select()
    .from(courseOptions)
    .where(eq(courseOptions.courseId, course.id))
    .orderBy(asc(courseOptions.rank), asc(courseOptions.id));
  const input = CreateCourseRequestSchema.parse(course.input);
  const failure = storedFailure(course);

  if (course.inputVersion === 2 && isV2Input(input)) {
    return CourseResultSchema.parse({
      version: 2,
      legacy: false,
      id: course.id,
      title: course.title,
      status: toStatus(course.status),
      requestedAt: course.createdAt.toISOString(),
      startedAt: course.startedAt?.toISOString() ?? null,
      finishedAt: course.finishedAt?.toISOString() ?? null,
      updatedAt: course.updatedAt.toISOString(),
      input,
      progressStep: CourseProgressStepV2Schema.safeParse(course.progressStep).success
        ? course.progressStep
        : null,
      failure,
      errorCode: failure?.code ?? null,
      errorMessage: failure?.message ?? null,
      engineMeta: course.engineMeta,
      candidateDecisions: course.candidateDecisions,
      options: await toV2Options(optionRows),
    });
  }

  return CourseResultSchema.parse({
    version: 1,
    legacy: true,
    id: course.id,
    title: course.title,
    status: toStatus(course.status),
    requestedAt: course.createdAt.toISOString(),
    input,
    errorCode: failure?.code ?? null,
    errorMessage: failure?.message ?? null,
    options: await toLegacyOptions(optionRows),
  });
};

const toJob = (course: CourseRow): CourseJob => ({
  courseId: course.id,
  userId: course.userId,
  input: CreateCourseRequestSchema.parse(course.input),
  inputVersion: course.inputVersion === 2 ? 2 : 1,
  bufferedEvents: [],
  emitter: new EventEmitter(),
  controller: new AbortController(),
  started: false,
  runToken: null,
  sequence: course.attemptCount * 100,
});

const writeSseEvent = (res: Response, event: CourseRecommendationSseEvent) => {
  res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
};

const isFutureSchedule = (input: CreateCourseRequest, now = new Date()): boolean => {
  const requested = new Date(`${input.date}T${input.startTime}:00+09:00`);
  const oneYearLater = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1_000);
  return Number.isFinite(requested.getTime()) && requested > now && requested <= oneYearLater;
};

export const createCoursesRouter = (engine: CourseRecommendationEngine): Router => {
  const router = Router();
  const jobStore = new Map<string, CourseJob>();

  const v2Event = <T extends Omit<CourseRecommendationSseEventV2, "version" | "sequence" | "occurredAt" | "courseId">>(
    job: CourseJob,
    event: T,
  ): CourseRecommendationSseEventV2 => ({
    ...event,
    version: 2,
    sequence: job.sequence++,
    occurredAt: new Date().toISOString(),
    courseId: job.courseId,
  } as CourseRecommendationSseEventV2);

  const emit = (job: CourseJob, event: CourseRecommendationSseEvent): void => {
    job.bufferedEvents.push(event);
    if (job.bufferedEvents.length > 50) job.bufferedEvents.shift();
    job.emitter.emit("event", event);
  };

  const emitProgress = (job: CourseJob, step: CourseRecommendationProgressStep): void => {
    if (job.inputVersion === 2) {
      const parsed = CourseProgressStepV2Schema.safeParse(step);
      if (parsed.success) emit(job, v2Event(job, { type: "progress", step: parsed.data }));
      return;
    }
    const legacyStep = step === "persisting_results"
      ? "persisting_results"
      : step === "input_validated" || step === "resolving_candidates"
        ? "input_validated"
        : "generating_options";
    emit(job, { type: "progress", step: legacyStep });
  };

  const emitTerminal = (
    job: CourseJob,
    terminal:
      | { type: "result"; status: "SUCCESS" | "EMPTY" }
      | { type: "error"; failure: CourseFailure }
      | { type: "cancelled" },
  ): void => {
    if (job.inputVersion === 2) {
      if (terminal.type === "error") {
        emit(job, v2Event(job, { type: "error", ...terminal.failure }));
      } else {
        emit(job, v2Event(job, terminal));
      }
      return;
    }
    if (terminal.type === "error") {
      emit(job, { type: "error", courseId: job.courseId, message: terminal.failure.message });
    } else if (terminal.type === "result") {
      emit(job, { ...terminal, courseId: job.courseId });
    } else {
      emit(job, { type: "cancelled", courseId: job.courseId });
    }
  };

  const claimJob = async (job: CourseJob): Promise<string | null> => {
    const now = new Date();
    const runToken = randomUUID();
    const [claimed] = await db
      .update(courses)
      .set({
        status: "RUNNING",
        runToken,
        leaseExpiresAt: new Date(now.getTime() + LEASE_DURATION_MS),
        attemptCount: sql`${courses.attemptCount} + 1`,
        startedAt: sql`coalesce(${courses.startedAt}, now())`,
        finishedAt: null,
        updatedAt: now,
        errorCode: null,
        errorMessage: null,
        errorRetryable: null,
      })
      .where(
        and(
          eq(courses.id, job.courseId),
          or(
            eq(courses.status, "PENDING"),
            and(
              eq(courses.status, "RUNNING"),
              or(isNull(courses.leaseExpiresAt), lt(courses.leaseExpiresAt, now)),
            ),
          ),
        ),
      )
      .returning({ id: courses.id });
    return claimed ? runToken : null;
  };

  const updateProgress = async (
    job: CourseJob,
    step: CourseRecommendationProgressStep,
  ): Promise<void> => {
    if (!job.runToken) return;
    const parsed = CourseProgressStepV2Schema.safeParse(step);
    await db
      .update(courses)
      .set({
        ...(parsed.success ? { progressStep: parsed.data } : {}),
        leaseExpiresAt: new Date(Date.now() + LEASE_DURATION_MS),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(courses.id, job.courseId),
          eq(courses.status, "RUNNING"),
          eq(courses.runToken, job.runToken),
        ),
      );
  };

  const renewJobLease = async (job: CourseJob): Promise<void> => {
    if (!job.runToken) return;
    await db
      .update(courses)
      .set({
        leaseExpiresAt: new Date(Date.now() + LEASE_DURATION_MS),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(courses.id, job.courseId),
          eq(courses.status, "RUNNING"),
          eq(courses.runToken, job.runToken),
        ),
      );
  };

  const persistFailure = async (
    job: CourseJob,
    failure: CourseFailure,
  ): Promise<boolean> => {
    if (!job.runToken) return false;
    const [updated] = await db
      .update(courses)
      .set({
        status: "FAILED",
        errorCode: failure.code,
        errorMessage: failure.message,
        errorRetryable: failure.retryable,
        finishedAt: new Date(),
        updatedAt: new Date(),
        leaseExpiresAt: null,
        runToken: null,
      })
      .where(
        and(
          eq(courses.id, job.courseId),
          eq(courses.status, "RUNNING"),
          eq(courses.runToken, job.runToken),
        ),
      )
      .returning({ id: courses.id });
    return Boolean(updated);
  };

  const persistResult = async (
    job: CourseJob,
    result: Exclude<CourseEngineResult, { readonly kind: "FAILED" }>,
  ): Promise<"SUCCESS" | "EMPTY" | "CANCELLED"> => {
    if (!job.runToken) return "CANCELLED";
    return db.transaction(async (tx) => {
      const [locked] = await tx
        .select()
        .from(courses)
        .where(eq(courses.id, job.courseId))
        .for("update");
      if (!locked || locked.status !== "RUNNING" || locked.runToken !== job.runToken) {
        return "CANCELLED" as const;
      }

      await tx.delete(courseOptions).where(eq(courseOptions.courseId, job.courseId));

      if (result.kind === "EMPTY") {
        await tx
          .update(courses)
          .set({
            status: "EMPTY",
            engineInput: result.engineInput ?? null,
            candidateDecisions: result.candidateDecisions ?? [],
            errorCode: null,
            errorMessage: null,
            errorRetryable: null,
            finishedAt: new Date(),
            updatedAt: new Date(),
            leaseExpiresAt: null,
            runToken: null,
          })
          .where(eq(courses.id, job.courseId));
        return "EMPTY" as const;
      }

      if (result.version === 1) {
        for (const [index, option] of result.options.entries()) {
          const [inserted] = await tx
            .insert(courseOptions)
            .values({
              courseId: job.courseId,
              rank: index + 1,
              optionType: option.type,
              totalDurationMinutes: option.totalDurationMinutes,
              totalTravelMinutes: option.totalTravelMinutes,
              pricePerPersonWon: option.pricePerPersonWon,
              reason: option.reason,
              routePath: option.routePath,
              routePathSource: "ORDER_ONLY",
            })
            .returning({ id: courseOptions.id });
          if (!inserted) throw new Error("Failed to persist legacy course option");
          if (option.stops.length > 0) {
            await tx.insert(coursePlaces).values(option.stops.map((stop) => ({
              courseOptionId: inserted.id,
              sequence: stop.sequence,
              visitTime: stop.visitTime,
              stayDurationMinutes: stop.stayMinutes,
              activityType: stop.activityLabel,
              source: stop.source,
              kakaoPlaceId: stop.kakaoPlaceId,
              favoritePlaceId: stop.favoritePlaceId ?? null,
              name: stop.name,
              address: stop.address ?? null,
              lat: stop.lat.toString(),
              lng: stop.lng.toString(),
              category: stop.category ?? null,
            })));
          }
        }
      } else {
        const candidateByPlaceId = new Map(
          result.candidates.map((candidate) => [candidate.place.id, candidate]),
        );
        for (const [index, option] of result.options.entries()) {
          const course = option.course;
          const [minCost, maxCost] = course.summary.estimatedCostPerPerson;
          const [inserted] = await tx
            .insert(courseOptions)
            .values({
              courseId: job.courseId,
              rank: index + 1,
              engineCourseId: course.id,
              engineOutput: course,
              candidateDecisions: option.candidateDecisions,
              optionType: job.inputVersion === 1
                ? (LEGACY_OPTION_TYPES[index] ?? "이동 최소")
                : course.courseType.key,
              totalDurationMinutes: course.summary.estimatedTotalMinutes,
              totalTravelMinutes: course.totalTravelMinutes,
              pricePerPersonWon: Math.round((minCost + maxCost) / 2),
              reason: course.selection.reasonTexts.join(" "),
              routePath: [],
              routePathSource: "NONE",
            })
            .returning({ id: courseOptions.id });
          if (!inserted) throw new Error("Failed to persist course option");

          const placeById = new Map(course.places.map((place) => [place.id, place]));
          await tx.insert(coursePlaces).values(course.timeline.map((timeline, timelineIndex) => {
            const place = placeById.get(timeline.placeId);
            const source = candidateByPlaceId.get(timeline.placeId);
            if (!place || !source) throw new Error(`Unknown engine place: ${timeline.placeId}`);
            return {
              courseOptionId: inserted.id,
              sequence: timelineIndex + 1,
              visitTime: timeline.time24h,
              stayDurationMinutes: timeline.stayDurationMinutes,
              travelMinutesFromPrevious: timeline.travelMinutesFromPrevious,
              waitMinutesFromPrevious: timeline.waitMinutesFromPrevious,
              activityType: place.mainCategory,
              source: source.source,
              enginePlaceId: place.id,
              kakaoPlaceId: source.kakaoPlaceId,
              savedPlaceId: source.savedPlaceId,
              favoritePlaceId: null,
              placeData: place,
              name: place.name,
              address: place.location.roadAddressKo,
              lat: place.location.lat.toString(),
              lng: place.location.lng.toString(),
              category: place.subCategory,
            };
          }));
        }
      }

      await tx
        .update(courses)
        .set({
          status: "SUCCESS",
          ...(result.version === 2
            ? {
                engineInput: result.engineInput,
                engineMeta: result.engineMeta,
                candidateDecisions: result.candidateDecisions,
              }
            : {}),
          errorCode: null,
          errorMessage: null,
          errorRetryable: null,
          finishedAt: new Date(),
          updatedAt: new Date(),
          leaseExpiresAt: null,
          runToken: null,
        })
        .where(eq(courses.id, job.courseId));
      return "SUCCESS" as const;
    });
  };

  const startJob = (job: CourseJob): void => {
    if (job.started) return;
    job.started = true;

    const run = async (): Promise<void> => {
      let runToken: string | null;
      try {
        runToken = await claimJob(job);
      } catch (error: unknown) {
        job.started = false;
        jobStore.delete(job.courseId);
        logCourseRecommendationFailure("course.recommendation.claim.failure", job.courseId, error);
        return;
      }
      if (!runToken) {
        job.started = false;
        jobStore.delete(job.courseId);
        return;
      }
      job.runToken = runToken;
      let progressChain = Promise.resolve();
      const leaseTimer = setInterval(() => {
        void renewJobLease(job).catch((error: unknown) =>
          logCourseRecommendationFailure("course.recommendation.lease.failure", job.courseId, error),
        );
      }, LEASE_RENEWAL_MS);
      leaseTimer.unref();

      try {
        const result = await engine.generate(job.input, {
          userId: job.userId,
          signal: job.controller.signal,
          onProgress: (step) => {
            emitProgress(job, step);
            progressChain = progressChain.then(() => updateProgress(job, step));
          },
        });
        await progressChain;

        if (result.kind === "FAILED") {
          const presentation = presentCourseEngineFailure(result.code);
          const failure: CourseFailure = {
            code: presentation.code,
            retryable: result.retryable,
            message: presentation.message,
          };
          if (await persistFailure(job, failure)) emitTerminal(job, { type: "error", failure });
          else emitTerminal(job, { type: "cancelled" });
          return;
        }

        let status: "SUCCESS" | "EMPTY" | "CANCELLED";
        try {
          status = await persistResult(job, result);
        } catch (error: unknown) {
          logCourseRecommendationFailure(
            "course.recommendation.result_persistence.failure",
            job.courseId,
            error,
          );
          const presentation = presentCourseEngineFailure("COURSE_PERSISTENCE_FAILURE");
          const failure: CourseFailure = {
            code: presentation.code,
            retryable: true,
            message: presentation.message,
          };
          if (await persistFailure(job, failure)) emitTerminal(job, { type: "error", failure });
          return;
        }
        if (status === "CANCELLED") emitTerminal(job, { type: "cancelled" });
        else emitTerminal(job, { type: "result", status });
      } catch (error: unknown) {
        if (isAbortError(error)) {
          emitTerminal(job, { type: "cancelled" });
          return;
        }
        logCourseRecommendationFailure("course.recommendation.job.failure", job.courseId, error);
        const failure: CourseFailure = {
          code: UNEXPECTED_COURSE_FAILURE.code,
          retryable: true,
          message: UNEXPECTED_COURSE_FAILURE.message,
        };
        try {
          if (await persistFailure(job, failure)) emitTerminal(job, { type: "error", failure });
        } catch (persistenceError: unknown) {
          logCourseRecommendationFailure(
            "course.recommendation.failure_persistence.failure",
            job.courseId,
            persistenceError,
          );
        }
      } finally {
        clearInterval(leaseTimer);
        setTimeout(() => jobStore.delete(job.courseId), TERMINAL_JOB_RETENTION_MS).unref();
      }
    };
    void run();
  };

  const ensureJob = (course: CourseRow): CourseJob => {
    const existing = jobStore.get(course.id);
    if (existing) return existing;
    const job = toJob(course);
    jobStore.set(course.id, job);
    return job;
  };

  const recoverJobs = async (): Promise<void> => {
    const now = new Date();
    const recoverable = await db
      .select()
      .from(courses)
      .where(
        or(
          eq(courses.status, "PENDING"),
          and(
            eq(courses.status, "RUNNING"),
            or(isNull(courses.leaseExpiresAt), lt(courses.leaseExpiresAt, now)),
          ),
        ),
      )
      .limit(20);
    recoverable.forEach((course) => startJob(ensureJob(course)));
  };

  router.get(
    "/options/favorites",
    requireAuth,
    asyncHandler(async (req, res) => {
      const existingSaved = await db
        .select()
        .from(savedCourseOptions)
        .where(eq(savedCourseOptions.userId, req.userId));
      const savedSourceIds = new Set(
        existingSaved.flatMap((row) => row.sourceCourseOptionId ? [row.sourceCourseOptionId] : []),
      );
      const legacyFavorites = await db
        .select({ option: courseOptions, course: courses })
        .from(courseOptions)
        .innerJoin(courses, eq(courseOptions.courseId, courses.id))
        .where(and(eq(courses.userId, req.userId), eq(courseOptions.favorite, true)))
        .orderBy(asc(courseOptions.rank), asc(courseOptions.id));
      for (const legacy of legacyFavorites) {
        if (savedSourceIds.has(legacy.option.id)) continue;
        const snapshot = await toAnyOptionDetail(legacy.course, legacy.option);
        await db
          .insert(savedCourseOptions)
          .values({
            userId: req.userId,
            sourceCourseOptionId: legacy.option.id,
            snapshot,
          })
          .onConflictDoNothing();
      }

      const saved = await db
        .select()
        .from(savedCourseOptions)
        .where(eq(savedCourseOptions.userId, req.userId))
        .orderBy(desc(savedCourseOptions.savedAt), desc(savedCourseOptions.id));
      const options = saved.flatMap((row) => {
        const parsed = CourseOptionAnyDetailSchema.safeParse(row.snapshot);
        return parsed.success
          ? [{
              id: row.id,
              savedAt: row.savedAt.toISOString(),
              sourceCourseOptionId: row.sourceCourseOptionId,
              option: parsed.data,
            }]
          : [];
      });
      res.status(200).json(
        createApiResponse(
          ListFavoriteCourseOptionsResponseDataSchema.parse({ version: 2, options }),
        ),
      );
    }),
  );

  router.patch(
    "/options/:optionId/favorite",
    requireAuth,
    asyncHandler(async (req, res) => {
      const optionId = z.uuid().safeParse(req.params.optionId);
      const body = SetCourseOptionFavoriteRequestSchema.safeParse(req.body);
      if (!optionId.success || !body.success) {
        res.status(400).json(createApiError("invalid input"));
        return;
      }
      const owned = body.data.favorite
        ? await getOwnedOption(optionId.data, req.userId)
        : await getUserOptionIncludingDeleted(optionId.data, req.userId);
      if (!owned) {
        res.status(404).json(createApiError("course option not found"));
        return;
      }
      const snapshot = body.data.favorite
        ? CourseOptionAnyDetailSchema.parse({
            ...(await toAnyOptionDetail(owned.course, owned.option)),
            isFavorite: true,
          })
        : null;
      const [updated] = await db.transaction(async (tx) => {
        const updatedRows = await tx
          .update(courseOptions)
          .set({ favorite: body.data.favorite })
          .where(eq(courseOptions.id, owned.option.id))
          .returning();
        if (body.data.favorite && snapshot) {
          const [existing] = await tx
            .select()
            .from(savedCourseOptions)
            .where(
              and(
                eq(savedCourseOptions.userId, req.userId),
                eq(savedCourseOptions.sourceCourseOptionId, owned.option.id),
              ),
            );
          if (existing) {
            await tx
              .update(savedCourseOptions)
              .set({ snapshot, savedAt: new Date() })
              .where(eq(savedCourseOptions.id, existing.id));
          } else {
            await tx.insert(savedCourseOptions).values({
              userId: req.userId,
              sourceCourseOptionId: owned.option.id,
              snapshot,
            });
          }
        } else {
          await tx
            .delete(savedCourseOptions)
            .where(
              and(
                eq(savedCourseOptions.userId, req.userId),
                eq(savedCourseOptions.sourceCourseOptionId, owned.option.id),
              ),
            );
        }
        return updatedRows;
      });
      res.status(200).json(
        createApiResponse(
          SetCourseOptionFavoriteResponseDataSchema.parse({
            id: updated?.id,
            favorite: updated?.favorite,
          }),
        ),
      );
    }),
  );

  router.delete(
    "/options/favorites/:savedOptionId",
    requireAuth,
    asyncHandler(async (req, res) => {
      const savedOptionId = z.uuid().safeParse(req.params.savedOptionId);
      if (!savedOptionId.success) {
        res.status(400).json(createApiError("invalid input"));
        return;
      }
      const removed = await db.transaction(async (tx) => {
        const [row] = await tx
          .delete(savedCourseOptions)
          .where(
            and(
              eq(savedCourseOptions.id, savedOptionId.data),
              eq(savedCourseOptions.userId, req.userId),
            ),
          )
          .returning({
            id: savedCourseOptions.id,
            sourceCourseOptionId: savedCourseOptions.sourceCourseOptionId,
          });
        if (row?.sourceCourseOptionId) {
          await tx
            .update(courseOptions)
            .set({ favorite: false })
            .where(eq(courseOptions.id, row.sourceCourseOptionId));
        }
        return row ?? null;
      });
      if (!removed) {
        res.status(404).json(createApiError("saved course option not found"));
        return;
      }
      res.status(200).json(
        createApiResponse(
          RemoveSavedCourseOptionResponseDataSchema.parse({ removedId: removed.id }),
        ),
      );
    }),
  );

  router.post(
    "/",
    requireAuth,
    asyncHandler(async (req, res) => {
      const parsed = CreateCourseRequestSchema.safeParse(req.body);
      if (!parsed.success || !isFutureSchedule(parsed.data)) {
        res.status(400).json(createApiError("invalid input"));
        return;
      }
      try {
        await assertOwnedSavedCandidates(req.userId, parsed.data);
      } catch (error: unknown) {
        if (error instanceof CourseCandidateResolutionError) {
          res.status(404).json(createApiError(error.message));
          return;
        }
        throw error;
      }

      const inputVersion = isV2Input(parsed.data) ? 2 : 1;
      const [course] = await db
        .insert(courses)
        .values({
          userId: req.userId,
          status: "PENDING",
          input: parsed.data,
          inputVersion,
          title: defaultCourseTitle(parsed.data),
        })
        .returning();
      if (!course) {
        res.status(500).json(createApiError("failed to create course"));
        return;
      }
      startJob(ensureJob(course));
      res
        .status(201)
        .json(createApiResponse(CreateCourseResponseDataSchema.parse({ courseId: course.id })));
    }),
  );

  router.get(
    "/:courseId/stream",
    requireAuth,
    asyncHandler(async (req, res) => {
      const courseId = z.uuid().safeParse(req.params.courseId);
      if (!courseId.success) {
        res.status(400).json(createApiError("invalid input"));
        return;
      }
      const course = await getOwnedCourse(courseId.data, req.userId);
      if (!course) {
        res.status(404).json(createApiError("course not found"));
        return;
      }
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders();

      const job = ensureJob(course);
      if (course.status === "SUCCESS" || course.status === "EMPTY") {
        emitTerminal(job, { type: "result", status: course.status });
        writeSseEvent(res, job.bufferedEvents.at(-1)!);
        res.end();
        return;
      }
      if (course.status === "FAILED") {
        const failure = storedFailure(course)!;
        emitTerminal(job, { type: "error", failure });
        writeSseEvent(res, job.bufferedEvents.at(-1)!);
        res.end();
        return;
      }
      if (course.status === "CANCELLED") {
        emitTerminal(job, { type: "cancelled" });
        writeSseEvent(res, job.bufferedEvents.at(-1)!);
        res.end();
        return;
      }

      if (course.inputVersion === 2) {
        const progress = CourseProgressStepV2Schema.safeParse(course.progressStep);
        if (progress.success) {
          writeSseEvent(res, v2Event(job, { type: "progress", step: progress.data }));
        }
      }
      let lastProgressStep = course.progressStep;
      const send = (event: CourseRecommendationSseEvent) => {
        if (!res.writableEnded) writeSseEvent(res, event);
        if (event.type === "result" || event.type === "error" || event.type === "cancelled") {
          res.end();
        }
      };
      for (const event of job.bufferedEvents) send(event);
      job.emitter.on("event", send);
      const heartbeat = setInterval(
        () => !res.writableEnded && res.write("event: heartbeat\ndata: {}\n\n"),
        10_000,
      );
      heartbeat.unref();
      const statePoll = setInterval(() => {
        if (res.writableEnded) return;
        void getOwnedCourse(course.id, req.userId)
          .then((current) => {
            if (!current || res.writableEnded) return;
            if (current.inputVersion === 2 && current.progressStep !== lastProgressStep) {
              lastProgressStep = current.progressStep;
              const progress = CourseProgressStepV2Schema.safeParse(current.progressStep);
              if (progress.success) {
                send(v2Event(job, { type: "progress", step: progress.data }));
              }
            }
            if (current.status === "SUCCESS" || current.status === "EMPTY") {
              send(current.inputVersion === 2
                ? v2Event(job, { type: "result", status: current.status })
                : { type: "result", courseId: current.id, status: current.status });
            } else if (current.status === "FAILED") {
              const failure = storedFailure(current)!;
              send(current.inputVersion === 2
                ? v2Event(job, { type: "error", ...failure })
                : { type: "error", courseId: current.id, message: failure.message });
            } else if (current.status === "CANCELLED") {
              send(current.inputVersion === 2
                ? v2Event(job, { type: "cancelled" })
                : { type: "cancelled", courseId: current.id });
            }
          })
          .catch((error: unknown) =>
            logCourseRecommendationFailure(
              "course.recommendation.stream_poll.failure",
              course.id,
              error,
            ),
          );
      }, 2_500);
      statePoll.unref();
      startJob(job);
      req.on("close", () => {
        clearInterval(heartbeat);
        clearInterval(statePoll);
        job.emitter.removeListener("event", send);
      });
    }),
  );

  router.get(
    "/:courseId/options/:optionId",
    requireAuth,
    asyncHandler(async (req, res) => {
      const courseId = z.uuid().safeParse(req.params.courseId);
      const optionId = z.uuid().safeParse(req.params.optionId);
      if (!courseId.success || !optionId.success) {
        res.status(400).json(createApiError("invalid input"));
        return;
      }
      const owned = await getOwnedOption(optionId.data, req.userId);
      if (!owned || owned.course.id !== courseId.data) {
        res.status(404).json(createApiError("course option not found"));
        return;
      }
      res.status(200).json(createApiResponse(await toAnyOptionDetail(owned.course, owned.option)));
    }),
  );

  router.get(
    "/:courseId",
    requireAuth,
    asyncHandler(async (req, res) => {
      const courseId = z.uuid().safeParse(req.params.courseId);
      if (!courseId.success) {
        res.status(400).json(createApiError("invalid input"));
        return;
      }
      const course = await getOwnedCourse(courseId.data, req.userId);
      if (!course) {
        res.status(404).json(createApiError("course not found"));
        return;
      }
      res.status(200).json(createApiResponse(await toCourseResult(course)));
    }),
  );

  router.get(
    "/",
    requireAuth,
    asyncHandler(async (req, res) => {
      const rows = await db
        .select()
        .from(courses)
        .where(
          and(
            eq(courses.userId, req.userId),
            isNull(courses.deletedAt),
          ),
        )
        .orderBy(desc(courses.createdAt), desc(courses.id));
      const optionRows = rows.length === 0
        ? []
        : await db
            .select({ courseId: courseOptions.courseId })
            .from(courseOptions)
            .where(inArray(courseOptions.courseId, rows.map((row) => row.id)));
      const countByCourse = new Map<string, number>();
      optionRows.forEach(({ courseId }) =>
        countByCourse.set(courseId, (countByCourse.get(courseId) ?? 0) + 1),
      );
      res.status(200).json(
        createApiResponse(
          ListCoursesResponseDataSchema.parse({
            items: rows.map((row) => ({
              id: row.id,
              title: row.title,
              status: toStatus(row.status),
              requestedAt: row.createdAt.toISOString(),
              optionCount: row.status === "SUCCESS" || row.status === "EMPTY"
                ? (countByCourse.get(row.id) ?? 0)
                : null,
              version: row.inputVersion === 2 ? 2 : 1,
              legacy: row.inputVersion !== 2,
              progressStep: CourseProgressStepV2Schema.safeParse(row.progressStep).success
                ? row.progressStep
                : null,
            })),
          }),
        ),
      );
    }),
  );

  router.patch(
    "/:courseId/title",
    requireAuth,
    asyncHandler(async (req, res) => {
      const courseId = z.uuid().safeParse(req.params.courseId);
      const body = RenameCourseRequestSchema.safeParse(req.body);
      if (!courseId.success || !body.success) {
        res.status(400).json(createApiError("invalid input"));
        return;
      }
      const course = await getOwnedCourse(courseId.data, req.userId);
      if (!course) {
        res.status(404).json(createApiError("course not found"));
        return;
      }
      if (course.status !== "SUCCESS") {
        res.status(409).json(createApiError("course is incomplete"));
        return;
      }
      const [renamed] = await db
        .update(courses)
        .set({ title: body.data.title, updatedAt: new Date() })
        .where(eq(courses.id, course.id))
        .returning();
      res.status(200).json(
        createApiResponse(
          RenameCourseResponseDataSchema.parse({ id: renamed?.id, title: renamed?.title }),
        ),
      );
    }),
  );

  router.delete(
    "/:courseId",
    requireAuth,
    asyncHandler(async (req, res) => {
      const courseId = z.uuid().safeParse(req.params.courseId);
      if (!courseId.success) {
        res.status(400).json(createApiError("invalid input"));
        return;
      }
      const course = await getOwnedCourse(courseId.data, req.userId);
      if (!course) {
        res.status(404).json(createApiError("course not found"));
        return;
      }
      if (course.status === "PENDING" || course.status === "RUNNING") {
        res.status(409).json(createApiError("cancel a running course first"));
        return;
      }
      await db
        .update(courses)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(eq(courses.id, course.id));
      res.status(200).json(
        createApiResponse(DeleteCourseResponseDataSchema.parse({ deletedId: course.id })),
      );
    }),
  );

  router.post(
    "/:courseId/cancel",
    requireAuth,
    asyncHandler(async (req, res) => {
      const courseId = z.uuid().safeParse(req.params.courseId);
      if (!courseId.success) {
        res.status(400).json(createApiError("invalid input"));
        return;
      }
      const [cancelled] = await db
        .update(courses)
        .set({
          status: "CANCELLED",
          finishedAt: new Date(),
          updatedAt: new Date(),
          runToken: null,
          leaseExpiresAt: null,
        })
        .where(
          and(
            eq(courses.id, courseId.data),
            eq(courses.userId, req.userId),
            isNull(courses.deletedAt),
            inArray(courses.status, ["PENDING", "RUNNING"]),
          ),
        )
        .returning();
      if (!cancelled) {
        const owned = await getOwnedCourse(courseId.data, req.userId);
        res.status(owned ? 409 : 404).json(
          createApiError(owned ? "course is not running" : "course not found"),
        );
        return;
      }
      jobStore.get(cancelled.id)?.controller.abort(
        new DOMException("Course recommendation cancelled", "AbortError"),
      );
      res.status(200).json(
        createApiResponse(
          CancelCourseResponseDataSchema.parse({ id: cancelled.id, status: "CANCELLED" }),
        ),
      );
    }),
  );

  void recoverJobs().catch((error: unknown) =>
    logCourseRecommendationFailure("course.recommendation.recovery.failure", "startup", error),
  );
  const recoveryTimer = setInterval(() => {
    void recoverJobs().catch((error: unknown) =>
      logCourseRecommendationFailure("course.recommendation.recovery.failure", "periodic", error),
    );
  }, RECOVERY_INTERVAL_MS);
  recoveryTimer.unref();

  return router;
};

export default createCoursesRouter;
