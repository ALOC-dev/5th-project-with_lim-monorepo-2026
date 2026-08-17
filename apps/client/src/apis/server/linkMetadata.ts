import {
  type ApiResponse,
  createApiError,
  createApiResponseSchema,
  type LinkMetadataData,
  LinkMetadataDataSchema,
} from "@monorepo/api-contracts";

import { serverApi } from "../base";
import { toApiClientErrorMessage } from "../errors";

const ENDPOINT_PATH = "api/link-metadata";
const linkMetadataResponseSchema = createApiResponseSchema(LinkMetadataDataSchema);

export const getLinkMetadata = async (url: string): Promise<ApiResponse<LinkMetadataData>> => {
  try {
    const response = await serverApi.get(ENDPOINT_PATH, { searchParams: { url } }).json<unknown>();
    return linkMetadataResponseSchema.parse(response);
  } catch (error) {
    return createApiError(toApiClientErrorMessage(error));
  }
};
