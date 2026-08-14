import {
  type ApiResponse,
  createApiError,
  createApiResponse,
  PLACE_RECOMMENDATION_PROGRESS_STEPS,
  type PlaceRecommendationFormLocationSnapshot,
  PlaceRecommendationJobRequestSchema,
} from "@monorepo/api-contracts";
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

export const PlaceRecommendationProgressStepSchema = z.enum(PLACE_RECOMMENDATION_PROGRESS_STEPS);

export const PlaceRecommendationProgressSseEventSchema = z
  .object({
    type: z.literal("progress"),
    step: PlaceRecommendationProgressStepSchema,
    startedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export const PlaceRecommendationErrorSseEventSchema = z
  .object({
    type: z.literal("error"),
    message: z.string().trim().min(1),
  })
  .strict();

export type PlaceRecommendationProgressStep = z.infer<typeof PlaceRecommendationProgressStepSchema>;
export type PlaceRecommendationProgressSseEvent = z.infer<
  typeof PlaceRecommendationProgressSseEventSchema
>;

export type CreatePlaceRecommendationJobVariables = {
  readonly input: UserInput;
  readonly formLocations: readonly PlaceRecommendationFormLocationSnapshot[];
};

export const createPlaceRecommendationJob = async (
  variables: CreatePlaceRecommendationJobVariables,
): Promise<ApiResponse<PlaceRecommendationJobResponse>> => {
  try {
    const body = PlaceRecommendationJobRequestSchema.parse(variables);
    const response = await serverApi.post("api/recommend", { json: body }).json<unknown>();

    return createApiResponse(PlaceRecommendationJobResponseSchema.parse(response));
  } catch (error) {
    return createApiError(toApiClientErrorMessage(error));
  }
};

export const getPlaceRecommendationStreamUrl = (jobId: string): string => {
  return new URL(`api/recommend/stream/${encodeURIComponent(jobId)}`, `${serverApiBaseUrl}/`).href;
};
