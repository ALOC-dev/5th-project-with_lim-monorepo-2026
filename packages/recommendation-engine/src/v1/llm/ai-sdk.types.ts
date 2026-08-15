import type { generateText } from "ai";
import type { z } from "zod";

export type RecommendationLlmTask =
  | "discover.discovery_context"
  | "evaluate.enrichment"
  | "evaluate.operation_hours"
  | "evaluate.scoring";

export type GenerateRecommendationObjectOptions<TObject> = {
  modelId?: string;
  openAiApiKey?: string;
  task: RecommendationLlmTask;
  schema: z.ZodType<TObject>;
  system: string;
  prompt: string;
  maxRetries?: number;
};

export type GenerateRecommendationTextOptions = Omit<
  Parameters<typeof generateText>[0],
  "model"
> & {
  modelId?: string;
  openAiApiKey?: string;
  task: RecommendationLlmTask;
};
