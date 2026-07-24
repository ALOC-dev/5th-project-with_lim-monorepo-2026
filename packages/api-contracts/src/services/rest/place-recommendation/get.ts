import {
  UserInputSchema,
  UserOutputSchema,
} from "@monorepo/recommendation-engine/v1/contracts";
import { z } from "zod";

import {
  RecommendationHistoryTitleSchema,
  RequestedAtSchema,
} from "../../../models/recommendation.js";

export const GetPlaceRecommendationHistoryResponseDataSchema = z
  .object({
    placeHistoryId: z.uuid(),
    status: z.literal("COMPLETED"),
    title: RecommendationHistoryTitleSchema,
    requestedAt: RequestedAtSchema,
    input: UserInputSchema,
    output: UserOutputSchema,
  })
  .strict();

export type GetPlaceRecommendationHistoryResponseData = z.infer<
  typeof GetPlaceRecommendationHistoryResponseDataSchema
>;
