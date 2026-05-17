import ky from "ky";
import { z } from "zod";
import {
  LocalSeedSearchResponseSchema,
  normalizeLocalSeedSearchParams,
  type LocalSeed,
  type LocalSeedSearchParams,
  type LocalSeedSearchResponse,
  type NormalizedLocalSeedSearchParams,
} from "./types.js";

const { KAKAO_REST_API_KEY } = process.env;

const KakaoSameNameSchema = z
  .object({
    region: z.array(z.string()),
    keyword: z.string(),
    selected_region: z.string(),
  })
  .strict();

const KakaoLocalMetaSchema = z
  .object({
    total_count: z.number().int().nonnegative(),
    pageable_count: z.number().int().nonnegative(),
    is_end: z.boolean(),
    same_name: KakaoSameNameSchema.nullable(),
  })
  .strict();

export const KakaoLocalItemSchema = z
  .object({
    id: z.string(),
    place_name: z.string(),
    category_name: z.string(),
    category_group_code: z.string(),
    category_group_name: z.string(),
    phone: z.string(),
    address_name: z.string(),
    road_address_name: z.string(),
    x: z.string(),
    y: z.string(),
    place_url: z.string(),
    distance: z.string(),
  })
  .strict();

export type KakaoLocalItem = z.infer<typeof KakaoLocalItemSchema>;

export const KakaoLocalSearchResponseSchema = z
  .object({
    meta: KakaoLocalMetaSchema,
    documents: z.array(KakaoLocalItemSchema),
  })
  .strict();

export type KakaoLocalSearchResponse = z.infer<
  typeof KakaoLocalSearchResponseSchema
>;

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

const requireKakaoCredentials = () => {
  if (!KAKAO_REST_API_KEY) {
    throw new Error("KAKAO_REST_API_KEY environment variable is required");
  }

  return {
    restApiKey: KAKAO_REST_API_KEY,
  };
};

export const searchKakaoLocalRaw = async (
  params: LocalSeedSearchParams,
): Promise<KakaoLocalSearchResponse> => {
  const searchParams = normalizeLocalSeedSearchParams(params);
  const { restApiKey } = requireKakaoCredentials();

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
): Promise<LocalSeedSearchResponse> => {
  const searchParams = normalizeLocalSeedSearchParams(params);
  const response = await searchKakaoLocalRaw(params);
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
