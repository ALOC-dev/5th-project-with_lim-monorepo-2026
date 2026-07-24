import { z } from "zod";

import { CourseRecommendationOutputSchema } from "../../models/course-recommendation.js";

export const CourseRecommendationProgressStepSchema = z.enum([
  "input_validated",
  "building_routes",
  "generating_courses",
]);

export type CourseRecommendationProgressStep = z.infer<
  typeof CourseRecommendationProgressStepSchema
>;

export const CourseRecommendationSseEventSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("progress"),
      step: CourseRecommendationProgressStepSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("result"),
      courseHistoryId: z.uuid(),
      data: CourseRecommendationOutputSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("error"),
      message: z.string().trim().min(1),
    })
    .strict(),
]);

export type CourseRecommendationSseEvent = z.infer<typeof CourseRecommendationSseEventSchema>;
