import {
  createApiError,
  createApiResponseSchema,
  type ApiResponse,
  ListFavoritePlacesResponseDataSchema,
} from "@monorepo/api-contracts";

import { serverApi } from "../base";
import { toApiClientErrorMessage } from "../errors";

const responseSchema = createApiResponseSchema(ListFavoritePlacesResponseDataSchema);

export const getFavoritePlaces = async (): Promise<
  ApiResponse<{ readonly favorites: readonly import("@monorepo/api-contracts").FavoritePlace[] }>
> => {
  try {
    return responseSchema.parse(await serverApi.get("api/favorites").json<unknown>());
  } catch (error) {
    return createApiError(toApiClientErrorMessage(error));
  }
};
