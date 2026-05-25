import ky from "ky";

import {
  type LocalSeed,
  type LocalSeedSearchResponse,
  LocalSeedSearchResponseSchema,
} from "./contracts.js";
import {
  type KakaoLocalItem,
  type KakaoLocalSearchResponse,
  KakaoLocalSearchResponseSchema,
} from "./kakao-local.contracts.js";
import { normalizeLocalSeedSearchParams } from "./search-params.js";
import type { LocalSeedSearchParams, NormalizedLocalSeedSearchParams } from "./types.js";

export type { KakaoLocalItem, KakaoLocalSearchResponse };
export type KakaoLocalCredentials = {
  restApiKey?: string;
};

const KakaoLocalApi = ky.create({
  prefix: "https://dapi.kakao.com/v2/local/search",
  timeout: 10_000,
  retry: {
    limit: 2,
    methods: ["get"],
    statusCodes: [408, 429, 500, 502, 503, 504],
  },
});

const KAKAO_MAX_COUNT = 15;

const requireKakaoCredentials = (credentials: KakaoLocalCredentials = {}) => {
  if (!credentials.restApiKey) {
    throw new Error("Kakao Local REST API key is required");
  }

  return {
    restApiKey: credentials.restApiKey,
  };
};

export const searchKakaoLocalRaw = async (
  params: LocalSeedSearchParams,
  credentials?: KakaoLocalCredentials,
): Promise<KakaoLocalSearchResponse> => {
  const searchParams = normalizeLocalSeedSearchParams(params);
  const { restApiKey } = requireKakaoCredentials(credentials);

  const response = await KakaoLocalApi.get("keyword.json", {
    searchParams: buildSearchParams(searchParams),
    headers: {
      Authorization: `KakaoAK ${restApiKey}`,
    },
  }).json<unknown>();

  return KakaoLocalSearchResponseSchema.parse(response);
};

export const searchKakaoLocal = async (
  params: LocalSeedSearchParams,
  credentials?: KakaoLocalCredentials,
): Promise<LocalSeedSearchResponse> => {
  const searchParams = normalizeLocalSeedSearchParams(params);
  const response = await searchKakaoLocalRaw(params, credentials);
  const seeds = response.documents.map(toLocalSeed);

  return LocalSeedSearchResponseSchema.parse({
    provider: "kakao",
    query: searchParams.query,
    page: searchParams.page,
    count: Math.min(searchParams.count, KAKAO_MAX_COUNT),
    totalCount: response.meta.pageable_count,
    isEnd: response.meta.is_end,
    seeds,
  });
};

const buildSearchParams = (
  params: NormalizedLocalSeedSearchParams,
): Record<string, string | number> => {
  const searchParams: Record<string, string | number> = {
    query: params.query,
    page: params.page,
    size: Math.min(params.count, KAKAO_MAX_COUNT),
  };

  if (params.location) {
    searchParams.x = params.location.longitude;
    searchParams.y = params.location.latitude;
    searchParams.radius = params.location.radiusKm * 1000;
    searchParams.sort = "distance";
  }

  return searchParams;
};

const toLocalSeed = (item: KakaoLocalItem): LocalSeed => ({
  provider: "kakao",
  providerPlaceId: item.id,
  name: item.place_name,
  category: item.category_name,
  phone: item.phone,
  address: item.address_name,
  roadAddress: item.road_address_name,
  longitude: Number(item.x),
  latitude: Number(item.y),
  placeUrl: item.place_url,
  distanceMeters: item.distance ? Number(item.distance) : undefined,
});
