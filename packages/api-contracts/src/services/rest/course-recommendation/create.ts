import { z } from "zod";

import {
  CourseCandidatePlaceSchema,
  CourseScheduleSchema,
  CourseStartLocationSchema,
} from "../../../models/course-recommendation.js";

const SelectedCourseCandidatePlacesSchema = z
  .array(CourseCandidatePlaceSchema)
  .min(5)
  .max(15)
  .refine(
    (places) => new Set(places.map((place) => place.placeId)).size === places.length,
    "course candidate placeIds must be unique",
  );

export const CreateCourseRecommendationRequestSchema = z
  .object({
    candidatePlaces: SelectedCourseCandidatePlacesSchema,
    schedule: CourseScheduleSchema,
    startLocation: CourseStartLocationSchema,
  })
  .strict();

export type CreateCourseRecommendationRequest = z.infer<
  typeof CreateCourseRecommendationRequestSchema
>;

export const CreateCourseRecommendationResponseDataSchema = z
  .object({
    jobId: z.uuid(),
    courseHistoryId: z.uuid(),
  })
  .strict();

export type CreateCourseRecommendationResponseData = z.infer<
  typeof CreateCourseRecommendationResponseDataSchema
>;
