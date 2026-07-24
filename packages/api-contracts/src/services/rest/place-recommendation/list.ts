import { z } from "zod";

import {
  NextCursorSchema,
  PaginationQuerySchema,
} from "../../../models/pagination.js";
import { PlaceRecommendationHistoryListItemSchema } from "../../../models/place-recommendation.js";

export const GetPlaceRecommendationHistoriesQuerySchema = PaginationQuerySchema;

export type GetPlaceRecommendationHistoriesQuery = z.infer<
  typeof GetPlaceRecommendationHistoriesQuerySchema
>;

export const GetPlaceRecommendationHistoriesResponseDataSchema = z
  .object({
    items: z.array(PlaceRecommendationHistoryListItemSchema),
    nextCursor: NextCursorSchema,
  })
  .strict();

export type GetPlaceRecommendationHistoriesResponseData = z.infer<
  typeof GetPlaceRecommendationHistoriesResponseDataSchema
>;
