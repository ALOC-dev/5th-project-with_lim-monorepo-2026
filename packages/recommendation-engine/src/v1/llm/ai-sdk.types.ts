import type { generateText } from "ai";
import type { z } from "zod";

export type RecommendationLlmTask =
  | "discover.discovery_context"
  | "evaluate.enrichment"
  | "evaluate.operation_hours"
  | "evaluate.scoring";

export type RecommendationLlmTelemetry = {
  task: RecommendationLlmTask;
  status: "SUCCESS" | "FAILURE";
  durationMs: number;
  retryCount: number;
  requestCount: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

export type GenerateRecommendationObjectOptions<TObject> = {
  modelId?: string;
  openAiApiKey?: string;
  task: RecommendationLlmTask;
  schema: z.ZodType<TObject>;
  system: string;
  prompt: string;
  maxRetries?: number;
  onTelemetry?: (telemetry: RecommendationLlmTelemetry) => void;
};

export type GenerateRecommendationTextOptions = Omit<
  Parameters<typeof generateText>[0],
  "model"
> & {
  modelId?: string;
  openAiApiKey?: string;
  task: RecommendationLlmTask;
  onTelemetry?: (telemetry: RecommendationLlmTelemetry) => void;
};
