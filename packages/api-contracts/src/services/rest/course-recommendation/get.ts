import { z } from "zod";

import { CourseRecommendationOutputSchema } from "../../../models/course-recommendation.js";
import {
  RecommendationHistoryTitleSchema,
  RequestedAtSchema,
} from "../../../models/recommendation.js";
import { CreateCourseRecommendationRequestSchema } from "./create.js";

export const GetCourseRecommendationHistoryResponseDataSchema = z
  .object({
    courseHistoryId: z.uuid(),
    status: z.literal("COMPLETED"),
    title: RecommendationHistoryTitleSchema,
    requestedAt: RequestedAtSchema,
    input: CreateCourseRecommendationRequestSchema,
    output: CourseRecommendationOutputSchema,
  })
  .strict();

export type GetCourseRecommendationHistoryResponseData = z.infer<
  typeof GetCourseRecommendationHistoryResponseDataSchema
>;
