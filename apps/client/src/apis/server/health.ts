import {
  type ApiResponse,
  createApiError,
  type HealthData,
  HealthResponseSchema,
} from "@monorepo/api-contracts";

import { serverApi } from "../base";
import { toApiClientErrorMessage } from "../errors";

export type { HealthData } from "@monorepo/api-contracts";

export const HEALTH_ENDPOINT_PATH = "health";

export const getHealth = async (): Promise<ApiResponse<HealthData>> => {
  try {
    const response = await serverApi.get(HEALTH_ENDPOINT_PATH).json<unknown>();

    return HealthResponseSchema.parse(response);
  } catch (error) {
    return createApiError(toApiClientErrorMessage(error));
  }
};
