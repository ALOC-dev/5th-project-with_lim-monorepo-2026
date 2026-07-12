import { HTTPError, TimeoutError } from "ky";

export const toApiClientErrorMessage = (error: unknown): string => {
  if (error instanceof HTTPError) {
    return `HTTP ${error.response.status}`;
  }

  if (error instanceof TimeoutError) {
    return "Request timed out";
  }

  if (error instanceof TypeError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown error";
};
