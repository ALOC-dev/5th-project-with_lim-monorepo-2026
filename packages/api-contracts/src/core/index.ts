import { z } from "zod";

// 서버가 JSON 응답 보낼 때 항상 요 모양을 쓰겠다
export type ApiResponse<T> = { success: true; data: T } | { success: false; error: string };

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

export const createApiResponse = <T>(data: T): ApiResponse<T> => ({
  success: true,
  data,
});

export const createApiError = (error: string): ApiResponse<never> => ({
  success: false,
  error,
});
