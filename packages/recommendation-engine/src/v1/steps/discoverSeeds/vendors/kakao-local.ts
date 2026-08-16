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

/** 카카오가 허용하는 마지막 페이지. */
const KAKAO_MAX_PAGE = 45;

/**
 * 요청한 개수를 채울 때까지 페이지를 이어 받는다.
 *
 * 카카오는 한 페이지에 최대 15건만 준다. 예전에는 1페이지만 받고 끝내서, 검색어당
 * 25건을 요청해도 15건만 얻고 나머지는 버렸다. 실측에서 "회기 곱창"의 후보가
 * 33건까지 줄었고 채점 대상이 14건밖에 안 됐다 — 10건을 고르는데 선택의 여지가
 * 거의 없었다. REST 호출 한 번은 싸니 채울 수 있으면 채운다.
 *
 * 바깥 페이지 번호는 우리 쪽 페이지네이션 단위라, 카카오 페이지로 환산해서 이어
 * 받아야 같은 결과를 두 번 받지 않는다.
 */
export const searchKakaoLocal = async (
  params: LocalSeedSearchParams,
  credentials?: KakaoLocalCredentials,
): Promise<LocalSeedSearchResponse> => {
  const searchParams = normalizeLocalSeedSearchParams(params);
  const pagesPerRequest = Math.max(1, Math.ceil(searchParams.count / KAKAO_MAX_COUNT));
  const firstKakaoPage = (searchParams.page - 1) * pagesPerRequest + 1;

  const documents: KakaoLocalItem[] = [];
  let totalCount = 0;
  let isEnd = true;

  for (let offset = 0; offset < pagesPerRequest; offset += 1) {
    const kakaoPage = firstKakaoPage + offset;
    if (kakaoPage > KAKAO_MAX_PAGE) break;

    const response = await searchKakaoLocalRaw(
      { ...params, pagination: { page: kakaoPage, count: KAKAO_MAX_COUNT } },
      credentials,
    );
    documents.push(...response.documents);
    totalCount = response.meta.pageable_count;
    isEnd = response.meta.is_end;

    if (isEnd) break;
  }

  return LocalSeedSearchResponseSchema.parse({
    provider: "kakao",
    query: searchParams.query,
    page: searchParams.page,
    count: searchParams.count,
    totalCount,
    isEnd,
    seeds: documents.slice(0, searchParams.count).map(toLocalSeed),
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
