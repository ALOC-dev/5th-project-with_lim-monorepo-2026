import { z } from "zod";

import { RecommendationHistoryTitleSchema } from "../../../models/recommendation.js";

export const RenamePlaceRecommendationHistoryRequestSchema = z
  .object({
    title: RecommendationHistoryTitleSchema,
  })
  .strict();

export type RenamePlaceRecommendationHistoryRequest = z.infer<
  typeof RenamePlaceRecommendationHistoryRequestSchema
>;

export const RenamePlaceRecommendationHistoryResponseDataSchema = z
  .object({
    placeHistoryId: z.uuid(),
    title: RecommendationHistoryTitleSchema,
  })
  .strict();

export type RenamePlaceRecommendationHistoryResponseData = z.infer<
  typeof RenamePlaceRecommendationHistoryResponseDataSchema
>;
