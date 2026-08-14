import { z } from "zod";

import {
  CourseFailureCodeSchema,
  CourseProgressStepV2Schema,
  CourseStatusSchema,
} from "../rest/courses.js";

export const LegacyCourseRecommendationProgressStepSchema = z.enum([
  "input_validated",
  "generating_options",
  "persisting_results",
]);
export type LegacyCourseRecommendationProgressStep = z.infer<
  typeof LegacyCourseRecommendationProgressStepSchema
>;

export const CourseRecommendationProgressStepV2Schema = CourseProgressStepV2Schema;
export type CourseRecommendationProgressStepV2 = z.infer<
  typeof CourseRecommendationProgressStepV2Schema
>;

/** Compatibility union. New jobs only emit the v2 subset. */
export const CourseRecommendationProgressStepSchema = z.union([
  CourseRecommendationProgressStepV2Schema,
  LegacyCourseRecommendationProgressStepSchema,
]);
export type CourseRecommendationProgressStep = z.infer<
  typeof CourseRecommendationProgressStepSchema
>;

const LegacyCourseRecommendationProgressEventSchema = z
  .object({
    type: z.literal("progress"),
    step: LegacyCourseRecommendationProgressStepSchema,
  })
  .strict();

const LegacyCourseRecommendationResultEventSchema = z
  .object({
    type: z.literal("result"),
    courseId: z.uuid(),
    status: z.enum(["SUCCESS", "EMPTY"]),
  })
  .strict();

const LegacyCourseRecommendationErrorEventSchema = z
  .object({
    type: z.literal("error"),
    courseId: z.uuid(),
    message: z.string().trim().min(1),
  })
  .strict();

const LegacyCourseRecommendationCancelledEventSchema = z
  .object({
    type: z.literal("cancelled"),
    courseId: z.uuid(),
  })
  .strict();

export const LegacyCourseRecommendationSseEventSchema = z.discriminatedUnion("type", [
  LegacyCourseRecommendationProgressEventSchema,
  LegacyCourseRecommendationResultEventSchema,
  LegacyCourseRecommendationErrorEventSchema,
  LegacyCourseRecommendationCancelledEventSchema,
]);
export type LegacyCourseRecommendationSseEvent = z.infer<
  typeof LegacyCourseRecommendationSseEventSchema
>;

const CourseRecommendationV2EventCommonSchema = z.object({
  version: z.literal(2),
  sequence: z.number().int().nonnegative(),
  occurredAt: z.iso.datetime({ offset: true }),
  courseId: z.uuid(),
});

const CourseRecommendationProgressEventV2Schema = CourseRecommendationV2EventCommonSchema.extend({
  type: z.literal("progress"),
  step: CourseRecommendationProgressStepV2Schema,
}).strict();

const CourseRecommendationResultEventV2Schema = CourseRecommendationV2EventCommonSchema.extend({
  type: z.literal("result"),
  status: CourseStatusSchema.extract(["SUCCESS", "EMPTY"]),
}).strict();

const CourseRecommendationErrorEventV2Schema = CourseRecommendationV2EventCommonSchema.extend({
  type: z.literal("error"),
  code: CourseFailureCodeSchema,
  retryable: z.boolean(),
  message: z.string().trim().min(1),
}).strict();

const CourseRecommendationCancelledEventV2Schema = CourseRecommendationV2EventCommonSchema.extend({
  type: z.literal("cancelled"),
}).strict();

export const CourseRecommendationSseEventV2Schema = z.discriminatedUnion("type", [
  CourseRecommendationProgressEventV2Schema,
  CourseRecommendationResultEventV2Schema,
  CourseRecommendationErrorEventV2Schema,
  CourseRecommendationCancelledEventV2Schema,
]);
export type CourseRecommendationSseEventV2 = z.infer<typeof CourseRecommendationSseEventV2Schema>;

export const CourseRecommendationSseEventSchema = z.union([
  CourseRecommendationSseEventV2Schema,
  LegacyCourseRecommendationSseEventSchema,
]);
export type CourseRecommendationSseEvent = z.infer<typeof CourseRecommendationSseEventSchema>;
