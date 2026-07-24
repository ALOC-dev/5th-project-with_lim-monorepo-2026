import { z } from "zod";

import { CourseRecommendationHistoryListItemSchema } from "../../../models/course-recommendation.js";
import {
  NextCursorSchema,
  PaginationQuerySchema,
} from "../../../models/pagination.js";

export const GetCourseRecommendationHistoriesQuerySchema = PaginationQuerySchema;

export type GetCourseRecommendationHistoriesQuery = z.infer<
  typeof GetCourseRecommendationHistoriesQuerySchema
>;

export const GetCourseRecommendationHistoriesResponseDataSchema = z
  .object({
    items: z.array(CourseRecommendationHistoryListItemSchema),
    nextCursor: NextCursorSchema,
  })
  .strict();

export type GetCourseRecommendationHistoriesResponseData = z.infer<
  typeof GetCourseRecommendationHistoriesResponseDataSchema
>;
