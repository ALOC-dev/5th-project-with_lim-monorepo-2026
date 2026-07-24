import { z } from "zod";

export const DeletePlaceRecommendationHistoryResponseDataSchema = z
  .object({
    deletedPlaceHistoryId: z.uuid(),
  })
  .strict();

export type DeletePlaceRecommendationHistoryResponseData = z.infer<
  typeof DeletePlaceRecommendationHistoryResponseDataSchema
>;
