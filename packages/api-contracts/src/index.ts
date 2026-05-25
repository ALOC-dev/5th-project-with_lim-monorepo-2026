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
