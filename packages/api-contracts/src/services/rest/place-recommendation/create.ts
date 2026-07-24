import { UserInputSchema } from "@monorepo/recommendation-engine/v1/contracts";
import { z } from "zod";

export const CreatePlaceRecommendationRequestSchema = UserInputSchema;

export type CreatePlaceRecommendationRequest = z.infer<
  typeof CreatePlaceRecommendationRequestSchema
>;

export const CreatePlaceRecommendationResponseDataSchema = z
  .object({
    jobId: z.uuid(),
    placeHistoryId: z.uuid(),
  })
  .strict();

export type CreatePlaceRecommendationResponseData = z.infer<
  typeof CreatePlaceRecommendationResponseDataSchema
>;
