import type { LocalSeedSearchParams, NormalizedLocalSeedSearchParams } from "./types.js";

const DEFAULT_PAGE = 1;
const DEFAULT_COUNT = 20;
const DEFAULT_RADIUS_KM = 5;

export const normalizeLocalSeedSearchParams = ({
  query,
  pagination = {},
  location,
}: LocalSeedSearchParams): NormalizedLocalSeedSearchParams => {
  const normalized: NormalizedLocalSeedSearchParams = {
    query,
    page: pagination.page ?? DEFAULT_PAGE,
    count: pagination.count ?? DEFAULT_COUNT,
  };

  if (location) {
    normalized.location = {
      longitude: location.longitude,
      latitude: location.latitude,
      radiusKm: location.radiusKm ?? DEFAULT_RADIUS_KM,
    };
  }

  return normalized;
};
