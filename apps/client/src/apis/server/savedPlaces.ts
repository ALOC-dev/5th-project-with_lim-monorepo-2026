import {
  type ApiResponse,
  createApiError,
  createApiResponseSchema,
  ListSavedPlacesResponseDataSchema,
  RemoveSavedPlaceResponseDataSchema,
  SavedPlaceSchema,
  SavePlaceRequestSchema,
  SavePlaceResponseDataSchema,
} from "@monorepo/api-contracts";
import { PlaceRecommendationItemSchema } from "@monorepo/recommendation-engine/v1/contracts";
import { z } from "zod";

import { serverApi } from "../base";
import { toApiClientErrorMessage } from "../errors";

const SAVED_PLACES_ENDPOINT_PATH = "api/saved-places";

export const SavedRecommendationPlaceSchema = SavedPlaceSchema.extend({
  placeData: PlaceRecommendationItemSchema,
});

export type SavedRecommendationPlace = z.infer<typeof SavedRecommendationPlaceSchema>;

// 저장 전 화면에 다시 표시된 과거 추천 결과는 현재 엔진 스키마의 필수 필드를
// 아직 갖지 않을 수 있다. 요청 본문은 서버의 호환 정규화 계층에서 검증하므로,
// 여기서는 API 계약의 불투명한 placeData를 그대로 전달한다.
export const SaveSavedPlaceInputSchema = SavePlaceRequestSchema;

export type SaveSavedPlaceInput = z.infer<typeof SaveSavedPlaceInputSchema>;

const listSavedRecommendationPlacesResponseDataSchema = ListSavedPlacesResponseDataSchema.extend({
  savedPlaces: z.array(SavedRecommendationPlaceSchema),
});

type ListSavedRecommendationPlacesResponseData = z.infer<
  typeof listSavedRecommendationPlacesResponseDataSchema
>;

const saveSavedRecommendationPlaceResponseDataSchema = SavePlaceResponseDataSchema.extend({
  savedPlace: SavedRecommendationPlaceSchema,
});

type SaveSavedRecommendationPlaceResponseData = z.infer<
  typeof saveSavedRecommendationPlaceResponseDataSchema
>;

const listSavedRecommendationPlacesResponseSchema = createApiResponseSchema(
  listSavedRecommendationPlacesResponseDataSchema,
);

const saveSavedRecommendationPlaceResponseSchema = createApiResponseSchema(
  saveSavedRecommendationPlaceResponseDataSchema,
);

const deleteSavedPlaceResponseSchema = createApiResponseSchema(RemoveSavedPlaceResponseDataSchema);

export const getSavedPlaces = async (): Promise<
  ApiResponse<ListSavedRecommendationPlacesResponseData>
> => {
  try {
    const response = await serverApi.get(SAVED_PLACES_ENDPOINT_PATH).json<unknown>();

    return listSavedRecommendationPlacesResponseSchema.parse(response);
  } catch (error) {
    return createApiError(toApiClientErrorMessage(error));
  }
};

export const saveSavedPlace = async (
  input: SaveSavedPlaceInput,
): Promise<ApiResponse<SaveSavedRecommendationPlaceResponseData>> => {
  try {
    const request = SaveSavedPlaceInputSchema.parse(input);
    const response = await serverApi
      .post(SAVED_PLACES_ENDPOINT_PATH, { json: request })
      .json<unknown>();

    return saveSavedRecommendationPlaceResponseSchema.parse(response);
  } catch (error) {
    return createApiError(toApiClientErrorMessage(error));
  }
};

export const deleteSavedPlace = async (
  savedPlaceId: string,
): Promise<ApiResponse<{ readonly removed: true }>> => {
  try {
    const parsedSavedPlaceId = SavedPlaceSchema.shape.id.parse(savedPlaceId);
    const response = await serverApi
      .delete(`${SAVED_PLACES_ENDPOINT_PATH}/${encodeURIComponent(parsedSavedPlaceId)}`)
      .json<unknown>();

    return deleteSavedPlaceResponseSchema.parse(response);
  } catch (error) {
    return createApiError(toApiClientErrorMessage(error));
  }
};
