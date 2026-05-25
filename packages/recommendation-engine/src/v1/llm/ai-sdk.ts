import { createOpenAI, openai } from "@ai-sdk/openai";
import { generateText, Output, type LanguageModel } from "ai";
import type {
  GenerateRecommendationObjectOptions,
  GenerateRecommendationTextOptions,
  RecommendationLlmTask,
} from "./ai-sdk.types.js";

export const RECOMMENDATION_LLM_MODEL_ID = "gpt-5.4-nano";
export const RECOMMENDATION_LLM_MAX_RETRIES = 0;

export type { RecommendationLlmTask } from "./ai-sdk.types.js";

export const createRecommendationOpenAiModel = (
  modelId = RECOMMENDATION_LLM_MODEL_ID,
  apiKey?: string,
): LanguageModel =>
  apiKey ? createOpenAI({ apiKey })(modelId) : openai(modelId);

export const generateRecommendationObject = async <TObject>({
  modelId,
  task,
  schema,
  maxRetries,
  openAiApiKey,
  ...options
}: GenerateRecommendationObjectOptions<TObject>): Promise<TObject> => {
  try {
    const { output } = await generateText({
      ...options,
      model: createRecommendationOpenAiModel(modelId, openAiApiKey),
      output: Output.object({ schema }),
      maxRetries: maxRetries ?? RECOMMENDATION_LLM_MAX_RETRIES,
    });

    return output;
  } catch (error) {
    throw toRecommendationLlmError(task, error);
  }
};

export const generateRecommendationText = async ({
  modelId,
  task,
  openAiApiKey,
  ...options
}: GenerateRecommendationTextOptions): ReturnType<typeof generateText> => {
  try {
    return await generateText({
      ...options,
      model: createRecommendationOpenAiModel(modelId, openAiApiKey),
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
