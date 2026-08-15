import { createOpenAI, openai } from "@ai-sdk/openai";
import { generateText, type LanguageModel, Output } from "ai";

import type {
  GenerateRecommendationObjectOptions,
  GenerateRecommendationTextOptions,
  RecommendationLlmTask,
} from "./ai-sdk.types.js";

export const RECOMMENDATION_LLM_MODEL_ID = "gpt-5.4-nano";
/**
 * 0이면 일시적인 rate limit이나 네트워크 오류가 그대로 요청 전체의 실패가 된다.
 * 이 엔진은 한 번의 추천에 LLM을 수십 번 호출하므로 한 번이라도 흔들릴 확률이 높다.
 */
export const RECOMMENDATION_LLM_MAX_RETRIES = 2;

export type { RecommendationLlmTask } from "./ai-sdk.types.js";

export const createRecommendationOpenAiModel = (
  modelId = RECOMMENDATION_LLM_MODEL_ID,
  apiKey?: string,
): LanguageModel => (apiKey ? createOpenAI({ apiKey })(modelId) : openai(modelId));

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

const toRecommendationLlmError = (task: RecommendationLlmTask, error: unknown): Error => {
  const reason = error instanceof Error ? error.message : String(error);
  return new Error(`${task} LLM call failed: ${reason}`);
};
