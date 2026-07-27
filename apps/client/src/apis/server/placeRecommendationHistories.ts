import {
  type ApiResponse,
  type BookmarkPlaceRecommendationHistoryItemResponseData,
  BookmarkPlaceRecommendationHistoryItemResponseDataSchema,
  createApiError,
  createApiResponseSchema,
  type DeletePlaceRecommendationHistoryResponseData,
  DeletePlaceRecommendationHistoryResponseDataSchema,
  type PlaceRecommendationHistoryDetailResponseData,
  PlaceRecommendationHistoryDetailResponseDataSchema,
  type PlaceRecommendationHistoryListResponseData,
  PlaceRecommendationHistoryListResponseDataSchema,
  type RenamePlaceRecommendationHistoryResponseData,
  RenamePlaceRecommendationHistoryResponseDataSchema,
} from "@monorepo/api-contracts";

import { serverApi } from "../base";
import { toApiClientErrorMessage } from "../errors";

const ENDPOINT_PATH = "api/place-recommendation-histories";

const PlaceRecommendationHistoryListResponseSchema = createApiResponseSchema(
  PlaceRecommendationHistoryListResponseDataSchema,
);

const PlaceRecommendationHistoryDetailResponseSchema = createApiResponseSchema(
  PlaceRecommendationHistoryDetailResponseDataSchema,
);

const RenamePlaceRecommendationHistoryResponseSchema = createApiResponseSchema(
  RenamePlaceRecommendationHistoryResponseDataSchema,
);

const DeletePlaceRecommendationHistoryResponseSchema = createApiResponseSchema(
  DeletePlaceRecommendationHistoryResponseDataSchema,
);

const BookmarkPlaceRecommendationHistoryItemResponseSchema = createApiResponseSchema(
  BookmarkPlaceRecommendationHistoryItemResponseDataSchema,
);

export const getPlaceRecommendationHistories = async (): Promise<
  ApiResponse<PlaceRecommendationHistoryListResponseData>
> => {
  try {
    const response = await serverApi.get(ENDPOINT_PATH).json<unknown>();
    return PlaceRecommendationHistoryListResponseSchema.parse(response);
  } catch (error) {
    return createApiError(toApiClientErrorMessage(error));
  }
};

export const getPlaceRecommendationHistory = async (
  id: string,
): Promise<ApiResponse<PlaceRecommendationHistoryDetailResponseData>> => {
  try {
    const response = await serverApi.get(`${ENDPOINT_PATH}/${id}`).json<unknown>();
    return PlaceRecommendationHistoryDetailResponseSchema.parse(response);
  } catch (error) {
    return createApiError(toApiClientErrorMessage(error));
  }
};

export const renamePlaceRecommendationHistory = async (
  id: string,
  title: string,
): Promise<ApiResponse<RenamePlaceRecommendationHistoryResponseData>> => {
  try {
    const response = await serverApi
      .patch(`${ENDPOINT_PATH}/${id}/rename`, { json: { title } })
      .json<unknown>();

    return RenamePlaceRecommendationHistoryResponseSchema.parse(response);
  } catch (error) {
    return createApiError(toApiClientErrorMessage(error));
  }
};

export const deletePlaceRecommendationHistory = async (
  id: string,
): Promise<ApiResponse<DeletePlaceRecommendationHistoryResponseData>> => {
  try {
    const response = await serverApi.delete(`${ENDPOINT_PATH}/${id}`).json<unknown>();
    return DeletePlaceRecommendationHistoryResponseSchema.parse(response);
  } catch (error) {
    return createApiError(toApiClientErrorMessage(error));
  }
};

export const togglePlaceRecommendationHistoryItemBookmark = async (
  historyId: string,
  itemId: string,
): Promise<ApiResponse<BookmarkPlaceRecommendationHistoryItemResponseData>> => {
  try {
    const response = await serverApi
      .patch(`${ENDPOINT_PATH}/${historyId}/items/${itemId}/bookmark`)
      .json<unknown>();

    return BookmarkPlaceRecommendationHistoryItemResponseSchema.parse(response);
  } catch (error) {
    return createApiError(toApiClientErrorMessage(error));
  }
};
