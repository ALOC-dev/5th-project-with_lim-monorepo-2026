import { createOpenAI, openai } from "@ai-sdk/openai";
import { generateText, type LanguageModel, Output } from "ai";
import type { z } from "zod";

export const COURSE_LLM_MODEL_ID = "gpt-5.4-nano";
export const COURSE_LLM_MAX_RETRIES = 0;

type CourseLlmTask = "course.curation" | "course.stayEstimate";

type GenerateCourseObjectOptions<TObject> = {
  modelId?: string;
  openAiApiKey?: string;
  task: CourseLlmTask;
  schema: z.ZodType<TObject>;
  system: string;
  prompt: string;
  maxRetries?: number;
  signal?: AbortSignal;
};

const createCourseOpenAiModel = (modelId = COURSE_LLM_MODEL_ID, apiKey?: string): LanguageModel =>
  apiKey ? createOpenAI({ apiKey })(modelId) : openai(modelId);

export const generateCourseObject = async <TObject>({
  modelId,
  task,
  schema,
  maxRetries,
  openAiApiKey,
  signal,
  ...options
}: GenerateCourseObjectOptions<TObject>): Promise<TObject> => {
  try {
    const { output } = await generateText({
      ...options,
      model: createCourseOpenAiModel(modelId, openAiApiKey),
      output: Output.object({ schema }),
      maxRetries: maxRetries ?? COURSE_LLM_MAX_RETRIES,
      abortSignal: signal,
    });

    return output;
  } catch (error) {
    signal?.throwIfAborted();
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`${task} LLM call failed: ${reason}`);
  }
};
