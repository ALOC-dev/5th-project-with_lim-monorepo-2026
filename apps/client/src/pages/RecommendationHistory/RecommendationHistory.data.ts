import type {
  ApiResponse,
  PlaceRecommendationHistoryDetailResponseData,
  PlaceRecommendationHistoryListItem,
  PlaceRecommendationHistoryStatus,
} from "@monorepo/api-contracts";
import {
  type EngineOutput,
  EngineOutputSchema,
  UserInputSchema,
  UserOutputSchema,
} from "@monorepo/recommendation-engine/v1/contracts";

import type { HistoryDisplayStatus, HistoryItem } from "./RecommendationHistory.context";

const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
  day: "2-digit",
  month: "2-digit",
  weekday: "short",
  year: "numeric",
});

export const recommendationHistoriesQueryKey = ["placeRecommendationHistories"] as const;

export class RecommendationHistoryRequestError extends Error {
  readonly name = "RecommendationHistoryRequestError";

  constructor(readonly message: string) {
    super(message);
  }
}

const getHistoryDisplayStatus = (
  status: PlaceRecommendationHistoryStatus,
): HistoryDisplayStatus => {
  switch (status) {
    case "PENDING":
      return "pending";
    case "COMPLETED":
      return "success";
    case "FAILED":
      return "failed";
  }
};

const getHistoryDescription = (item: PlaceRecommendationHistoryListItem): string => {
  switch (item.status) {
    case "PENDING":
      return "추천 결과를 만드는 중이에요.";
    case "COMPLETED":
      return "추천 장소 " + (item.recommendationCount ?? 0) + "곳";
    case "FAILED":
      return "추천을 만들지 못했어요.";
  }
};

export const toHistoryItem = (item: PlaceRecommendationHistoryListItem): HistoryItem => ({
  dateLabel: dateFormatter.format(new Date(item.requestedAt)),
  description: getHistoryDescription(item),
  displayStatus: getHistoryDisplayStatus(item.status),
  id: item.id,
  status: item.status,
  title: item.title,
});

export const unwrapRecommendationHistoryApiResponse = <T>(response: ApiResponse<T>): T => {
  if (response.success) {
    return response.data;
  }

  throw new RecommendationHistoryRequestError(response.error);
};

export const toCompletedEngineOutput = (
  detail: PlaceRecommendationHistoryDetailResponseData,
): EngineOutput | null => {
  const parsedInput = UserInputSchema.safeParse(detail.input);
  if (!parsedInput.success) {
    return null;
  }

  const parsedOutput = UserOutputSchema.safeParse(detail.output);
  if (!parsedOutput.success) {
    return null;
  }

  const parsedEngineOutput = EngineOutputSchema.safeParse({
    status: "SUCCESS",
    userInput: parsedInput.data,
    userOutput: parsedOutput.data,
  });

  return parsedEngineOutput.success ? parsedEngineOutput.data : null;
};
