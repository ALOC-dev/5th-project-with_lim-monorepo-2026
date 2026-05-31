export type ApiResponse<T> = { success: true; data: T } | { success: false; error: string };

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