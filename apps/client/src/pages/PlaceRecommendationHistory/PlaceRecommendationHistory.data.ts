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

import type {
  PlaceRecommendationHistoryDisplayStatus,
  PlaceRecommendationHistoryItem,
} from "./PlaceRecommendationHistory.context";

const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
  day: "2-digit",
  month: "2-digit",
  weekday: "short",
  year: "numeric",
});

export const placeRecommendationHistoriesQueryKey = ["placeRecommendationHistories"] as const;

export class PlaceRecommendationHistoryRequestError extends Error {
  readonly name = "PlaceRecommendationHistoryRequestError";

  constructor(readonly message: string) {
    super(message);
  }
}

export type PlaceRecommendationHistoryParseStage = "input" | "output" | "engine-output";

export class PlaceRecommendationHistoryParseError extends Error {
  readonly name = "PlaceRecommendationHistoryParseError";

  constructor(
    readonly stage: PlaceRecommendationHistoryParseStage,
    readonly issue: string,
  ) {
    super(`저장된 추천 결과 ${stage} 검증 실패: ${issue}`);
  }
}

const toParseError = (
  stage: PlaceRecommendationHistoryParseStage,
  error: {
    readonly issues: readonly {
      readonly path: readonly PropertyKey[];
      readonly message: string;
    }[];
  },
): PlaceRecommendationHistoryParseError => {
  const firstIssue = error.issues[0];
  const path = firstIssue?.path.length ? firstIssue.path.join(".") : "(root)";
  return new PlaceRecommendationHistoryParseError(
    stage,
    `${path}: ${firstIssue?.message ?? "schema validation failed"}`,
  );
};

const getPlaceRecommendationHistoryDisplayStatus = (
  status: PlaceRecommendationHistoryStatus,
): PlaceRecommendationHistoryDisplayStatus => {
  switch (status) {
    case "PENDING":
      return "pending";
    case "COMPLETED":
      return "success";
    case "FAILED":
      return "failed";
  }
};

const getPlaceRecommendationHistoryDescription = (
  item: PlaceRecommendationHistoryListItem,
): string => {
  switch (item.status) {
    case "PENDING":
      return "추천 결과를 만드는 중이에요.";
    case "COMPLETED":
      return "추천 장소 " + (item.recommendationCount ?? 0) + "곳";
    case "FAILED":
      return "추천을 만들지 못했어요.";
  }
};

export const toPlaceRecommendationHistoryItem = (
  item: PlaceRecommendationHistoryListItem,
): PlaceRecommendationHistoryItem => ({
  dateLabel: dateFormatter.format(new Date(item.requestedAt)),
  description: getPlaceRecommendationHistoryDescription(item),
  displayStatus: getPlaceRecommendationHistoryDisplayStatus(item.status),
  id: item.id,
  status: item.status,
  title: item.title,
});

export const unwrapPlaceRecommendationHistoryApiResponse = <T>(response: ApiResponse<T>): T => {
  if (response.success) {
    return response.data;
  }

  throw new PlaceRecommendationHistoryRequestError(response.error);
};

export const toCompletedPlaceRecommendationEngineOutput = (
  detail: PlaceRecommendationHistoryDetailResponseData,
): EngineOutput | null => {
  if (detail.status !== "COMPLETED") {
    return null;
  }

  const parsedInput = UserInputSchema.safeParse(detail.input);
  if (!parsedInput.success) {
    throw toParseError("input", parsedInput.error);
  }

  const parsedOutput = UserOutputSchema.safeParse(detail.output);
  if (!parsedOutput.success) {
    throw toParseError("output", parsedOutput.error);
  }

  const parsedEngineOutput = EngineOutputSchema.safeParse({
    status: "SUCCESS",
    userInput: parsedInput.data,
    userOutput: parsedOutput.data,
  });

  if (!parsedEngineOutput.success) {
    throw toParseError("engine-output", parsedEngineOutput.error);
  }

  return parsedEngineOutput.data;
};
