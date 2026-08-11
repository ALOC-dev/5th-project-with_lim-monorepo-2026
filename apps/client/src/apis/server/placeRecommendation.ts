import type { ApiResponse } from "@monorepo/api-contracts";
import { createApiError, createApiResponse } from "@monorepo/api-contracts";
import type { UserInput } from "@monorepo/recommendation-engine/v1/contracts";
import { z } from "zod";

import { serverApi, serverApiBaseUrl } from "../base";
import { toApiClientErrorMessage } from "../errors";

export const PlaceRecommendationJobResponseSchema = z
  .object({
    jobId: z.string().trim().min(1),
  })
  .strict();

export type PlaceRecommendationJobResponse = z.infer<typeof PlaceRecommendationJobResponseSchema>;

export const PlaceRecommendationProgressStepSchema = z.enum([
  "input_validated",
  "discovering",
  "evaluating",
  "enriching",
  "scoring",
]);

export const PlaceRecommendationProgressSseEventSchema = z
  .object({
    type: z.literal("progress"),
    step: PlaceRecommendationProgressStepSchema,
  })
  .strict();

export const PlaceRecommendationErrorSseEventSchema = z
  .object({
    type: z.literal("error"),
    message: z.string().trim().min(1),
  })
  .strict();

export type PlaceRecommendationProgressStep = z.infer<typeof PlaceRecommendationProgressStepSchema>;

export const createPlaceRecommendationJob = async (
  userInput: UserInput,
): Promise<ApiResponse<PlaceRecommendationJobResponse>> => {
  try {
    const response = await serverApi.post("api/recommend", { json: userInput }).json<unknown>();

    return createApiResponse(PlaceRecommendationJobResponseSchema.parse(response));
  } catch (error) {
    return createApiError(toApiClientErrorMessage(error));
  }
};

export const getPlaceRecommendationStreamUrl = (jobId: string): string => {
  return new URL(`api/recommend/stream/${encodeURIComponent(jobId)}`, `${serverApiBaseUrl}/`).href;
};
