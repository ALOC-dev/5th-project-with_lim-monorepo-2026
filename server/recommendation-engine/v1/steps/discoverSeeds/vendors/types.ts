import { z } from "zod";

export type LocalSeedSearchParams = {
  query: string;
  pagination?: {
    page?: number;
    count?: number;
  };
  location?: {
    longitude: number;
    latitude: number;
    radiusKm?: number;
  };
};

export const LocalSeedProviderSchema = z.enum(["kakao", "tmap"]);
export type LocalSeedProvider = z.infer<typeof LocalSeedProviderSchema>;

export const LocalSeedSchema = z
  .object({
    provider: LocalSeedProviderSchema,
    providerPlaceId: z.string().optional(),
    name: z.string(),
    category: z.string(),
    phone: z.string(),
    address: z.string(),
    roadAddress: z.string(),
    longitude: z.number(),
    latitude: z.number(),
    placeUrl: z.string().optional(),
    distanceMeters: z.number().optional(),
  })
  .strict();

export type LocalSeed = z.infer<typeof LocalSeedSchema>;

export const LocalSeedSearchResponseSchema = z
  .object({
    provider: LocalSeedProviderSchema,
    query: z.string(),
    page: z.number().int().positive(),
    count: z.number().int().positive(),
    totalCount: z.number().int().nonnegative(),
    isEnd: z.boolean(),
    seeds: z.array(LocalSeedSchema),
  })
  .strict();

export type LocalSeedSearchResponse = z.infer<
  typeof LocalSeedSearchResponseSchema
>;

export type NormalizedLocalSeedSearchParams = {
  query: string;
  page: number;
  count: number;
  location?: {
    longitude: number;
    latitude: number;
    radiusKm: number;
  };
};

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
