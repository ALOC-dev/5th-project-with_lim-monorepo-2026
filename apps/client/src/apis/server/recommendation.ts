import type { ApiResponse } from "@monorepo/api-contracts";
import { createApiError, createApiResponse } from "@monorepo/api-contracts";
import {
  type UserInput,
  UserOutputSchema,
} from "@monorepo/recommendation-engine/v1/contracts";
import { z } from "zod";

import { serverApi, serverApiBaseUrl } from "../base";
import { toApiClientErrorMessage } from "../errors";

export const RecommendationJobResponseSchema = z
  .object({
    jobId: z.string().trim().min(1),
  })
  .strict();

export type RecommendationJobResponse = z.infer<typeof RecommendationJobResponseSchema>;

export const RecommendationProgressStepSchema = z.enum([
  "input_validated",
  "discovering",
  "evaluating",
  "enriching",
  "scoring",
]);

export const RecommendationProgressSseEventSchema = z
  .object({
    type: z.literal("progress"),
    step: RecommendationProgressStepSchema,
  })
  .strict();

export const RecommendationResultSseEventSchema = z
  .object({
    type: z.literal("result"),
    data: UserOutputSchema,
  })
  .strict();

export const RecommendationErrorSseEventSchema = z
  .object({
    type: z.literal("error"),
    message: z.string().trim().min(1),
  })
  .strict();

export type RecommendationProgressStep = z.infer<typeof RecommendationProgressStepSchema>;

export const createRecommendationJob = async (
  userInput: UserInput,
): Promise<ApiResponse<RecommendationJobResponse>> => {
  try {
    const response = await serverApi.post("api/recommend", { json: userInput }).json<unknown>();

    return createApiResponse(RecommendationJobResponseSchema.parse(response));
  } catch (error) {
    return createApiError(toApiClientErrorMessage(error));
  }
};

export const getRecommendationStreamUrl = (jobId: string): string => {
  return new URL(`api/recommend/stream/${encodeURIComponent(jobId)}`, `${serverApiBaseUrl}/`)
    .href;
};
