import { z } from "zod";

export type ApiResponse<T> = { success: true; data: T } | { success: false; error: string };
// 서버가 JSON 응답 보낼 때 항상 요 모양을 쓰겠다

export const ApiErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.string(),
});

export const createApiResponseSchema = <TData>(
  dataSchema: z.ZodType<TData>,
): z.ZodType<ApiResponse<TData>> =>
  z.discriminatedUnion("success", [
    z.object({
      success: z.literal(true),
      data: dataSchema,
    }),
    ApiErrorResponseSchema,
  ]);

export const HealthDataSchema = z.object({
  service: z.string(),
  status: z.literal("ok"),
  timestamp: z.iso.datetime(),
});

export type HealthData = z.infer<typeof HealthDataSchema>;

export const HealthResponseSchema = createApiResponseSchema(HealthDataSchema);

export const createApiResponse = <T>(data: T): ApiResponse<T> => ({
  success: true,
  data,
});

export const createApiError = (error: string): ApiResponse<never> => ({
  success: false,
  error,
});

export const formatServiceName = (name: string): string => name.trim().toUpperCase();

export type RecommendationProgressStep = 'input_validated' | 'discovering' | 'evaluating' | 'enriching' | 'scoring';

export type RecommendationSseEvent = 
  | { type: 'progress'; step: RecommendationProgressStep }
  | { type: 'result'; data: unknown }
  | { type: 'error'; message: string };