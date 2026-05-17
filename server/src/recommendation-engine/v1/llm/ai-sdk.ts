import { openai } from "@ai-sdk/openai";
import {
  generateObject,
  generateText,
} from "ai";
import type { z } from "zod";

export const RECOMMENDATION_LLM_MODEL_ID = "gpt-5.4-nano";
export const RECOMMENDATION_LLM_MAX_RETRIES = 0;

export type RecommendationLlmTask =
  | "discover.approaches"
  | "discover.overfetch"
  | "evaluate.enrichment"
  | "evaluate.operation_hours"
  | "evaluate.scoring";

type GenerateRecommendationObjectOptions<TObject> = {
  modelId?: string;
  task: RecommendationLlmTask;
  schema: z.ZodType<TObject>;
  system: string;
  prompt: string;
  maxRetries?: number;
};

type GenerateRecommendationTextOptions = Omit<
  Parameters<typeof generateText>[0],
  "model"
> & {
  modelId?: string;
  task: RecommendationLlmTask;
};

export const createRecommendationOpenAiModel = (
  modelId = RECOMMENDATION_LLM_MODEL_ID,
) => openai(modelId);

export const generateRecommendationObject = async <TObject>({
  modelId,
  task,
  ...options
}: GenerateRecommendationObjectOptions<TObject>): Promise<TObject> => {
  try {
    const { object } = await generateObject({
      ...options,
      model: createRecommendationOpenAiModel(modelId),
      maxRetries: options.maxRetries ?? RECOMMENDATION_LLM_MAX_RETRIES,
    });

    return object;
  } catch (error) {
    throw toRecommendationLlmError(task, error);
  }
};

export const generateRecommendationText = async ({
  modelId,
  task,
  ...options
}: GenerateRecommendationTextOptions): ReturnType<typeof generateText> => {
  try {
    return await generateText({
      ...options,
      model: createRecommendationOpenAiModel(modelId),
      maxRetries: options.maxRetries ?? RECOMMENDATION_LLM_MAX_RETRIES,
    } as Parameters<typeof generateText>[0]);
  } catch (error) {
    throw toRecommendationLlmError(task, error);
  }
};

const toRecommendationLlmError = (
  task: RecommendationLlmTask,
  error: unknown,
): Error => {
  const reason = error instanceof Error ? error.message : String(error);
  return new Error(`${task} LLM call failed: ${reason}`);
};
