import { EventEmitter } from "node:events";

import {
  CancelCourseResponseDataSchema,
  CourseOptionDetailSchema,
  CourseOptionSummarySchema,
  CourseResultSchema,
  CourseStatusSchema,
  CreateCourseRequestSchema,
  CreateCourseResponseDataSchema,
  createApiError,
  createApiResponse,
  DeleteCourseResponseDataSchema,
  ListCoursesResponseDataSchema,
  ListFavoriteCourseOptionsResponseDataSchema,
  RenameCourseRequestSchema,
  RenameCourseResponseDataSchema,
  SetCourseOptionFavoriteRequestSchema,
  SetCourseOptionFavoriteResponseDataSchema,
  type CourseOptionDetail,
  type CourseOptionSummary,
  type CourseRecommendationSseEvent,
  type CourseStop,
  type CreateCourseRequest,
} from "@monorepo/api-contracts";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { type Response, Router } from "express";
import { z } from "zod";

import {
  createMockCourseRecommendationEngine,
  type CourseRecommendationEngine,
} from "../courseRecommendation/engine.js";
import { db } from "../db/client.js";
import { courseOptions, coursePlaces, courses } from "../db/schema.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { requireAuth } from "../middleware/auth.js";

type CourseRow = typeof courses.$inferSelect;
type CourseOptionRow = typeof courseOptions.$inferSelect;
type CoursePlaceRow = typeof coursePlaces.$inferSelect;

type CourseJob = {
  readonly courseId: string;
  readonly userId: string;
  readonly input: CreateCourseRequest;
  readonly bufferedEvents: CourseRecommendationSseEvent[];
  readonly emitter: EventEmitter;
  readonly controller: AbortController;
  started: boolean;
};

const isAbortError = (error: unknown): boolean =>
  error instanceof Error && (error.name === "AbortError" || error.message.includes("cancelled"));

const toStatus = (value: string) => CourseStatusSchema.parse(value);

const toStop = (row: CoursePlaceRow): CourseStop => ({
  id: row.id,
  sequence: row.sequence,
  visitTime: row.visitTime,
  stayMinutes: row.stayDurationMinutes,
  activityLabel: row.activityType,
  source: row.source === "FAVORITE" ? "FAVORITE" : "KAKAO",
  kakaoPlaceId: row.kakaoPlaceId,
  favoritePlaceId: row.favoritePlaceId,
  name: row.name,
  address: row.address,
  category: row.category,
  lat: Number(row.lat),
  lng: Number(row.lng),
});

const optionById = async (optionId: string): Promise<CourseOptionRow | null> => {
  const [option] = await db.select().from(courseOptions).where(eq(courseOptions.id, optionId));
  return option ?? null;
};

const toOptions = async (rows: readonly CourseOptionRow[]): Promise<CourseOptionSummary[]> => {
  if (rows.length === 0) return [];
  const stops = await db
    .select()
    .from(coursePlaces)
    .where(
      inArray(
        coursePlaces.courseOptionId,
        rows.map((row) => row.id),
      ),
    )
    .orderBy(coursePlaces.sequence);
  const stopsByOption = new Map<string, CourseStop[]>();
  for (const stop of stops) {
    const current = stopsByOption.get(stop.courseOptionId) ?? [];
    current.push(toStop(stop));
    stopsByOption.set(stop.courseOptionId, current);
  }
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
      stops: stopsByOption.get(row.id) ?? [],
    }),
  );
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

const toCourseResult = async (course: CourseRow) => {
  const options = await db
    .select()
    .from(courseOptions)
    .where(eq(courseOptions.courseId, course.id));
  return CourseResultSchema.parse({
    id: course.id,
    title: course.title,
    status: toStatus(course.status),
    requestedAt: course.createdAt.toISOString(),
    errorMessage: course.errorMessage,
    options: await toOptions(options),
  });
};

const toJob = (course: CourseRow): CourseJob => ({
  courseId: course.id,
  userId: course.userId,
  input: CreateCourseRequestSchema.parse(course.input),
  bufferedEvents: [],
  emitter: new EventEmitter(),
  controller: new AbortController(),
  started: false,
});

const writeSseEvent = (res: Response, event: CourseRecommendationSseEvent) => {
  res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
};

export const createCoursesRouter = (
  engine: CourseRecommendationEngine = createMockCourseRecommendationEngine(),
): Router => {
  const router = Router();
  const jobStore = new Map<string, CourseJob>();

  const emit = (job: CourseJob, event: CourseRecommendationSseEvent): void => {
    job.bufferedEvents.push(event);
    job.emitter.emit("event", event);
  };

  const persistEngineResult = async (
    courseId: string,
    input: CreateCourseRequest,
    result: Awaited<ReturnType<CourseRecommendationEngine["generate"]>>,
  ) => {
    if (result.kind === "EMPTY") {
      await db
        .update(courses)
        .set({ status: "EMPTY", errorCode: null, errorMessage: null })
        .where(eq(courses.id, courseId));
      return "EMPTY" as const;
    }

    await db.transaction(async (tx) => {
      const insertedOptions = await tx
        .insert(courseOptions)
        .values(
          result.options.map((option) => ({
            courseId,
            optionType: option.type,
            totalDurationMinutes: option.totalDurationMinutes,
            totalTravelMinutes: option.totalTravelMinutes,
            pricePerPersonWon: option.pricePerPersonWon,
            reason: option.reason,
            routePath: option.routePath,
          })),
        )
        .returning();
      const places = insertedOptions.flatMap((option, optionIndex) => {
        const engineOption = result.options[optionIndex];
        if (!engineOption) return [];
        return engineOption.stops.map((stop) => ({
          courseOptionId: option.id,
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
        }));
      });
      if (places.length > 0) await tx.insert(coursePlaces).values(places);
      await tx
        .update(courses)
        .set({ status: "SUCCESS", errorCode: null, errorMessage: null })
        .where(eq(courses.id, courseId));
    });
    void input;
    return "SUCCESS" as const;
  };

  const startJob = (job: CourseJob): void => {
    if (job.started) return;
    job.started = true;
    void engine
      .generate(job.input, {
        signal: job.controller.signal,
        onProgress: (step) => emit(job, { type: "progress", step }),
      })
      .then(async (result) => {
        const [course] = await db.select().from(courses).where(eq(courses.id, job.courseId));
        if (!course || course.status === "CANCELLED") {
          emit(job, { type: "cancelled", courseId: job.courseId });
          return;
        }
        const status = await persistEngineResult(job.courseId, job.input, result);
        emit(job, { type: "result", courseId: job.courseId, status });
      })
      .catch(async (error: unknown) => {
        if (isAbortError(error)) {
          emit(job, { type: "cancelled", courseId: job.courseId });
          return;
        }
        await db
          .update(courses)
          .set({
            status: "FAILED",
            errorCode: "COURSE_ENGINE_FAILURE",
            errorMessage: "코스 추천을 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.",
          })
          .where(eq(courses.id, job.courseId));
        emit(job, {
          type: "error",
          courseId: job.courseId,
          message: "코스 추천을 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.",
        });
      })
      .finally(() => setTimeout(() => jobStore.delete(job.courseId), 5_000));
  };

  router.post(
    "/",
    requireAuth,
    asyncHandler(async (req, res) => {
      const parsed = CreateCourseRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json(createApiError("invalid input"));
        return;
      }
      const [course] = await db
        .insert(courses)
        .values({
          userId: req.userId,
          status: "PENDING",
          input: parsed.data,
          title: "새 코스 추천",
        })
        .returning();
      if (!course) {
        res.status(500).json(createApiError("failed to create course"));
        return;
      }
      jobStore.set(course.id, toJob(course));
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

      if (course.status === "SUCCESS" || course.status === "EMPTY") {
        writeSseEvent(res, { type: "result", courseId: course.id, status: course.status });
        res.end();
        return;
      }
      if (course.status === "FAILED") {
        writeSseEvent(res, {
          type: "error",
          courseId: course.id,
          message: course.errorMessage ?? "코스 추천을 생성하지 못했습니다.",
        });
        res.end();
        return;
      }
      if (course.status === "CANCELLED") {
        writeSseEvent(res, { type: "cancelled", courseId: course.id });
        res.end();
        return;
      }

      const job = jobStore.get(course.id) ?? toJob(course);
      jobStore.set(course.id, job);
      const send = (event: CourseRecommendationSseEvent) => {
        if (!res.writableEnded) writeSseEvent(res, event);
        if (event.type === "result" || event.type === "error" || event.type === "cancelled")
          res.end();
      };
      for (const event of job.bufferedEvents) send(event);
      job.emitter.on("event", send);
      const heartbeat = setInterval(
        () => !res.writableEnded && res.write("event: heartbeat\ndata: {}\n\n"),
        10_000,
      );
      startJob(job);
      req.on("close", () => {
        clearInterval(heartbeat);
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
      const [summary] = await toOptions([owned.option]);
      const detail: CourseOptionDetail = CourseOptionDetailSchema.parse({
        ...summary,
        reason: owned.option.reason,
      });
      res.status(200).json(createApiResponse(detail));
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
        .where(and(eq(courses.userId, req.userId), isNull(courses.deletedAt)))
        .orderBy(desc(courses.createdAt));
      const counts = await db
        .select()
        .from(courseOptions)
        .where(
          inArray(
            courseOptions.courseId,
            rows.map((row) => row.id),
          ),
        );
      const countByCourse = new Map<string, number>();
      counts.forEach((option) =>
        countByCourse.set(option.courseId, (countByCourse.get(option.courseId) ?? 0) + 1),
      );
      res.status(200).json(
        createApiResponse(
          ListCoursesResponseDataSchema.parse({
            items: rows.map((row) => ({
              id: row.id,
              title: row.title,
              status: toStatus(row.status),
              requestedAt: row.createdAt.toISOString(),
              optionCount:
                row.status === "SUCCESS" || row.status === "EMPTY"
                  ? (countByCourse.get(row.id) ?? 0)
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
        .set({ title: body.data.title })
        .where(eq(courses.id, course.id))
        .returning();
      res
        .status(200)
        .json(
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
      if (course.status === "PENDING") {
        res.status(409).json(createApiError("cancel a pending course first"));
        return;
      }
      await db.update(courses).set({ deletedAt: new Date() }).where(eq(courses.id, course.id));
      res
        .status(200)
        .json(createApiResponse(DeleteCourseResponseDataSchema.parse({ deletedId: course.id })));
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
      const course = await getOwnedCourse(courseId.data, req.userId);
      if (!course) {
        res.status(404).json(createApiError("course not found"));
        return;
      }
      if (course.status !== "PENDING") {
        res.status(409).json(createApiError("course is not pending"));
        return;
      }
      await db.update(courses).set({ status: "CANCELLED" }).where(eq(courses.id, course.id));
      jobStore.get(course.id)?.controller.abort();
      res
        .status(200)
        .json(
          createApiResponse(
            CancelCourseResponseDataSchema.parse({ id: course.id, status: "CANCELLED" }),
          ),
        );
    }),
  );

  router.get(
    "/options/favorites",
    requireAuth,
    asyncHandler(async (req, res) => {
      const rows = await db
        .select({ option: courseOptions })
        .from(courseOptions)
        .innerJoin(courses, eq(courseOptions.courseId, courses.id))
        .where(
          and(
            eq(courses.userId, req.userId),
            isNull(courses.deletedAt),
            eq(courseOptions.favorite, true),
          ),
        )
        .orderBy(desc(courseOptions.createdAt));
      const summaries = await toOptions(rows.map(({ option }) => option));
      const options = summaries.map((summary, index) =>
        CourseOptionDetailSchema.parse({
          ...summary,
          reason: rows[index]?.option.reason ?? null,
        }),
      );
      res
        .status(200)
        .json(createApiResponse(ListFavoriteCourseOptionsResponseDataSchema.parse({ options })));
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
      const owned = await getOwnedOption(optionId.data, req.userId);
      if (!owned) {
        res.status(404).json(createApiError("course option not found"));
        return;
      }
      const [updated] = await db
        .update(courseOptions)
        .set({ favorite: body.data.favorite })
        .where(eq(courseOptions.id, owned.option.id))
        .returning();
      res
        .status(200)
        .json(
          createApiResponse(
            SetCourseOptionFavoriteResponseDataSchema.parse({
              id: updated?.id,
              favorite: updated?.favorite,
            }),
          ),
        );
    }),
  );

  return router;
};

export default createCoursesRouter;
