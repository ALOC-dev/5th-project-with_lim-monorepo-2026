import { z } from "zod";

import { RecommendationHistoryTitleSchema } from "../../../models/recommendation.js";

export const RenameCourseRecommendationHistoryRequestSchema = z
  .object({
    title: RecommendationHistoryTitleSchema,
  })
  .strict();

export type RenameCourseRecommendationHistoryRequest = z.infer<
  typeof RenameCourseRecommendationHistoryRequestSchema
>;

export const RenameCourseRecommendationHistoryResponseDataSchema = z
  .object({
    courseHistoryId: z.uuid(),
    title: RecommendationHistoryTitleSchema,
  })
  .strict();

export type RenameCourseRecommendationHistoryResponseData = z.infer<
  typeof RenameCourseRecommendationHistoryResponseDataSchema
>;
