import {
  type ApiResponse,
  createApiError,
  createApiResponseSchema,
  type DeletePlaceRecommendationHistoryResponseData,
  DeletePlaceRecommendationHistoryResponseDataSchema,
  type PlaceRecommendationHistoryDetailResponseData,
  PlaceRecommendationHistoryDetailResponseDataSchema,
  type PlaceRecommendationHistoryListResponseData,
  PlaceRecommendationHistoryListResponseDataSchema,
  RenamePlaceRecommendationHistoryRequestSchema,
  type RenamePlaceRecommendationHistoryResponseData,
  RenamePlaceRecommendationHistoryResponseDataSchema,
} from "@monorepo/api-contracts";

import { serverApi } from "../base";
import { toApiClientErrorMessage } from "../errors";

const ENDPOINT_PATH = "api/place-recommendation-histories";

const placeRecommendationHistoryListResponseSchema = createApiResponseSchema(
  PlaceRecommendationHistoryListResponseDataSchema,
);

const placeRecommendationHistoryDetailResponseSchema = createApiResponseSchema(
  PlaceRecommendationHistoryDetailResponseDataSchema,
);

const renamePlaceRecommendationHistoryResponseSchema = createApiResponseSchema(
  RenamePlaceRecommendationHistoryResponseDataSchema,
);

const deletePlaceRecommendationHistoryResponseSchema = createApiResponseSchema(
  DeletePlaceRecommendationHistoryResponseDataSchema,
);

const getHistoryPath = (id: string): string => ENDPOINT_PATH + "/" + encodeURIComponent(id);

export const getPlaceRecommendationHistories = async (): Promise<
  ApiResponse<PlaceRecommendationHistoryListResponseData>
> => {
  try {
    const response = await serverApi.get(ENDPOINT_PATH).json<unknown>();
    return placeRecommendationHistoryListResponseSchema.parse(response);
  } catch (error) {
    return createApiError(toApiClientErrorMessage(error));
  }
};

export const getPlaceRecommendationHistory = async (
  id: string,
): Promise<ApiResponse<PlaceRecommendationHistoryDetailResponseData>> => {
  try {
    const response = await serverApi.get(getHistoryPath(id)).json<unknown>();
    return placeRecommendationHistoryDetailResponseSchema.parse(response);
  } catch (error) {
    return createApiError(toApiClientErrorMessage(error));
  }
};

export const renamePlaceRecommendationHistory = async (
  id: string,
  title: string,
): Promise<ApiResponse<RenamePlaceRecommendationHistoryResponseData>> => {
  try {
    const body = RenamePlaceRecommendationHistoryRequestSchema.parse({ title });
    const response = await serverApi
      .patch(getHistoryPath(id) + "/rename", { json: body })
      .json<unknown>();

    return renamePlaceRecommendationHistoryResponseSchema.parse(response);
  } catch (error) {
    return createApiError(toApiClientErrorMessage(error));
  }
};

export const deletePlaceRecommendationHistory = async (
  id: string,
): Promise<ApiResponse<DeletePlaceRecommendationHistoryResponseData>> => {
  try {
    const response = await serverApi.delete(getHistoryPath(id)).json<unknown>();
    return deletePlaceRecommendationHistoryResponseSchema.parse(response);
  } catch (error) {
    return createApiError(toApiClientErrorMessage(error));
  }
};
