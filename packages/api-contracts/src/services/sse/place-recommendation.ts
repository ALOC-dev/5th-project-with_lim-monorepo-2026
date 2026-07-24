import { UserOutputSchema } from "@monorepo/recommendation-engine/v1/contracts";
import { z } from "zod";

export const PlaceRecommendationProgressStepSchema = z.enum([
  "input_validated",
  "discovering",
  "evaluating",
  "enriching",
  "scoring",
]);

export type PlaceRecommendationProgressStep = z.infer<
  typeof PlaceRecommendationProgressStepSchema
>;

export const PlaceRecommendationSseEventSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("progress"),
      step: PlaceRecommendationProgressStepSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("result"),
      placeHistoryId: z.uuid(),
      data: UserOutputSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("error"),
      message: z.string().trim().min(1),
    })
    .strict(),
]);

export type PlaceRecommendationSseEvent = z.infer<typeof PlaceRecommendationSseEventSchema>;
