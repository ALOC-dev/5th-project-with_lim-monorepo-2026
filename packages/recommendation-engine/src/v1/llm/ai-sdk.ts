import { createOpenAI, openai } from "@ai-sdk/openai";
import { generateText, type LanguageModel, Output } from "ai";

import type {
  GenerateRecommendationObjectOptions,
  GenerateRecommendationTextOptions,
  RecommendationLlmTask,
  RecommendationLlmTelemetry,
} from "./ai-sdk.types.js";

export const RECOMMENDATION_LLM_MODEL_ID = "gpt-5.4-nano";
/**
 * 한 번의 추천 실행에서 후보 보강과 점수화가 각각 여러 LLM 호출을 만들 수 있다.
 * 후보 단위 동시 실행은 TPM quota를 짧은 burst로 소진할 수 있으므로 live 기본값은
 * 직렬화한다. discovery → enrichment → scoring은 엔진에서 순차 단계이므로 이 값이
 * 1이면 해당 실행의 후보 fan-out은 OpenAI 요청을 병렬로 만들지 않는다.
 */
export const RECOMMENDATION_LLM_MAX_CONCURRENCY_PER_RUN = 1;
/**
 * 0이면 일시적인 rate limit이나 네트워크 오류가 그대로 요청 전체의 실패가 된다.
 * 이 엔진은 한 번의 추천에 LLM을 수십 번 호출하므로 한 번이라도 흔들릴 확률이 높다.
 * AI SDK는 retry-after(-ms) 헤더를 우선하고 지수 backoff를 적용하므로, quota에서
 * 즉시 재시도 burst를 만들지 않도록 이 기본 재시도는 유지한다.
 */
export const RECOMMENDATION_LLM_MAX_RETRIES = 2;

export type { RecommendationLlmTask } from "./ai-sdk.types.js";

export const createRecommendationOpenAiModel = (
  modelId = RECOMMENDATION_LLM_MODEL_ID,
  apiKey?: string,
  requestCounter?: { count: number },
): LanguageModel =>
  apiKey
    ? createOpenAI({
        apiKey,
        ...(requestCounter
          ? {
              fetch: async (...args: Parameters<typeof globalThis.fetch>) => {
                requestCounter.count += 1;
                return globalThis.fetch(...args);
              },
            }
          : {}),
      })(modelId)
    : openai(modelId);

export const generateRecommendationObject = async <TObject>({
  modelId,
  task,
  schema,
  maxRetries,
  openAiApiKey,
  onTelemetry,
  ...options
}: GenerateRecommendationObjectOptions<TObject>): Promise<TObject> => {
  const startedAt = performance.now();
  const requestCounter = { count: 0 };
  try {
    const result = await generateText({
      ...options,
      model: createRecommendationOpenAiModel(modelId, openAiApiKey, requestCounter),
      output: Output.object({ schema }),
      maxRetries: maxRetries ?? RECOMMENDATION_LLM_MAX_RETRIES,
    });
    emitTelemetry(onTelemetry, {
      task,
      status: "SUCCESS",
      startedAt,
      requestCount: requestCounter.count,
      stepCount: result.steps.length,
      usage: result.totalUsage,
    });
    return result.output;
  } catch (error) {
    emitTelemetry(onTelemetry, {
      task,
      status: "FAILURE",
      startedAt,
      requestCount: requestCounter.count,
      stepCount: 1,
    });
    throw toRecommendationLlmError(task, error);
  }
};

export const generateRecommendationText = async ({
  modelId,
  task,
  openAiApiKey,
  onTelemetry,
  ...options
}: GenerateRecommendationTextOptions): ReturnType<typeof generateText> => {
  const startedAt = performance.now();
  const requestCounter = { count: 0 };
  try {
    const result = await generateText({
      ...options,
      model: createRecommendationOpenAiModel(modelId, openAiApiKey, requestCounter),
      maxRetries: options.maxRetries ?? RECOMMENDATION_LLM_MAX_RETRIES,
    } as Parameters<typeof generateText>[0]);
    emitTelemetry(onTelemetry, {
      task,
      status: "SUCCESS",
      startedAt,
      requestCount: requestCounter.count,
      stepCount: result.steps.length,
      usage: result.totalUsage,
    });
    return result;
  } catch (error) {
    emitTelemetry(onTelemetry, {
      task,
      status: "FAILURE",
      startedAt,
      requestCount: requestCounter.count,
      stepCount: 1,
    });
    throw toRecommendationLlmError(task, error);
  }
};

const emitTelemetry = (
  onTelemetry: ((telemetry: RecommendationLlmTelemetry) => void) | undefined,
  input: {
    task: RecommendationLlmTask;
    status: RecommendationLlmTelemetry["status"];
    startedAt: number;
    requestCount: number;
    stepCount: number;
    usage?: {
      inputTokens?: number;
      outputTokens?: number;
      totalTokens?: number;
    };
  },
): void => {
  try {
    onTelemetry?.({
      task: input.task,
      status: input.status,
      durationMs: Math.round(performance.now() - input.startedAt),
      requestCount: input.requestCount,
      retryCount: Math.max(0, input.requestCount - input.stepCount),
      ...(input.usage?.inputTokens === undefined
        ? {}
        : { inputTokens: input.usage.inputTokens }),
      ...(input.usage?.outputTokens === undefined
        ? {}
        : { outputTokens: input.usage.outputTokens }),
      ...(input.usage?.totalTokens === undefined
        ? {}
        : { totalTokens: input.usage.totalTokens }),
    });
  } catch {
    // Telemetry must never change recommendation behavior.
  }
};

const toRecommendationLlmError = (task: RecommendationLlmTask, error: unknown): Error => {
  const reason = error instanceof Error ? error.message : String(error);
  return new Error(`${task} LLM call failed: ${reason}`);
};
