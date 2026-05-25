import ky from "ky";

import {
  type LocalSeed,
  type LocalSeedSearchResponse,
  LocalSeedSearchResponseSchema,
} from "./contracts.js";
import { normalizeLocalSeedSearchParams } from "./search-params.js";
import {
  type TmapLocalSearchResponse,
  TmapLocalSearchResponseSchema,
  type TmapPoi,
  type TmapPoiDetailResponse,
  TmapPoiDetailResponseSchema,
} from "./tmap-local.contracts.js";
import type { LocalSeedSearchParams, NormalizedLocalSeedSearchParams } from "./types.js";

export type { TmapLocalSearchResponse, TmapPoi, TmapPoiDetailResponse };
export type TmapLocalCredentials = {
  appKey?: string;
};

export type TmapPoiDetailParams = {
  poiInfo: string;
  findOption?: "id" | "key";
  navSeq?: string;
};

const TmapLocalApi = ky.create({
  prefix: "https://apis.openapi.sk.com/tmap",
  timeout: 10_000,
  retry: {
    limit: 2,
    methods: ["get"],
    statusCodes: [408, 429, 500, 502, 503, 504],
  },
});

const TMAP_API_VERSION = 1;
const COORD_TYPE = "WGS84GEO";

const requireTmapCredentials = (credentials: TmapLocalCredentials = {}) => {
  if (!credentials.appKey) {
    throw new Error("TMAP app key is required");
  }

  return {
    appKey: credentials.appKey,
  };
};

const EMPTY_TMAP_RESPONSE: TmapLocalSearchResponse = {
  searchPoiInfo: {
    totalCount: "0",
    count: "0",
    page: "1",
    pois: { poi: [] },
  },
};

export const searchTmapLocalRaw = async (
  params: LocalSeedSearchParams,
  credentials?: TmapLocalCredentials,
): Promise<TmapLocalSearchResponse> => {
  const searchParams = normalizeLocalSeedSearchParams(params);
  const { appKey } = requireTmapCredentials(credentials);

  const httpResponse = await TmapLocalApi.get("pois", {
    searchParams: buildSearchParams(searchParams),
    headers: {
      Accept: "application/json",
      appKey,
    },
  });

  // TMAP은 검색 결과가 없으면 HTTP 204 + 빈 바디를 반환한다. 빈 응답으로 정규화한다.
  if (httpResponse.status === 204) {
    return EMPTY_TMAP_RESPONSE;
  }

  const text = await httpResponse.text();
  if (text.length === 0) {
    return EMPTY_TMAP_RESPONSE;
  }

  return TmapLocalSearchResponseSchema.parse(JSON.parse(text));
};

export const searchTmapLocal = async (
  params: LocalSeedSearchParams,
  credentials?: TmapLocalCredentials,
): Promise<LocalSeedSearchResponse> => {
  const searchParams = normalizeLocalSeedSearchParams(params);
  const response = await searchTmapLocalRaw(params, credentials);
  const seeds = response.searchPoiInfo.pois.poi.map(toLocalSeed);

  return LocalSeedSearchResponseSchema.parse({
    provider: "tmap",
    query: searchParams.query,
    page: searchParams.page,
    count: searchParams.count,
    totalCount: Number(response.searchPoiInfo.totalCount),
    isEnd: seeds.length < searchParams.count,
    seeds,
  });
};

export const getTmapPoiDetail = async (
  { poiInfo, findOption = "id", navSeq }: TmapPoiDetailParams,
  credentials?: TmapLocalCredentials,
): Promise<TmapPoiDetailResponse> => {
  const { appKey } = requireTmapCredentials(credentials);

  const searchParams: Record<string, string | number> = {
    version: TMAP_API_VERSION,
    findOption,
    resCoordType: COORD_TYPE,
  };

  if (navSeq) {
    searchParams.navSeq = navSeq;
  }

  const response = await TmapLocalApi.get(`pois/${poiInfo}`, {
    searchParams,
    headers: {
      Accept: "application/json",
      appKey,
    },
  }).json<unknown>();

  return TmapPoiDetailResponseSchema.parse(response);
};

const buildSearchParams = (
  params: NormalizedLocalSeedSearchParams,
): Record<string, string | number> => {
  const searchParams: Record<string, string | number> = {
    version: TMAP_API_VERSION,
    searchKeyword: params.query,
    page: params.page,
    count: params.count,
    reqCoordType: COORD_TYPE,
    resCoordType: COORD_TYPE,
    searchtypCd: "A",
  };

  if (params.location) {
    searchParams.searchtypCd = "R";
    searchParams.centerLon = params.location.longitude;
    searchParams.centerLat = params.location.latitude;
    searchParams.radius = params.location.radiusKm;
  }

  return searchParams;
};

const toLocalSeed = (poi: TmapPoi): LocalSeed => {
  const longitude = Number(poi.frontLon ?? poi.noorLon);
  const latitude = Number(poi.frontLat ?? poi.noorLat);

  return {
    provider: "tmap",
    providerPlaceId: poi.id ?? poi.pkey,
    name: poi.name,
    category: getTmapCategory(poi),
    phone: poi.telNo ?? "",
    address: getTmapAddress(poi),
    roadAddress: getTmapRoadAddress(poi),
    longitude,
    latitude,
  };
};

const getTmapCategory = (poi: TmapPoi): string =>
  [poi.upperBizName, poi.middleBizName, poi.lowerBizName, poi.detailBizName]
    .filter(isNonEmptyString)
    .join(">");

const getTmapAddress = (poi: TmapPoi): string =>
  [poi.upperAddrName, poi.middleAddrName, poi.lowerAddrName, poi.detailAddrName]
    .filter(isNonEmptyString)
    .join(" ");

const getTmapRoadAddress = (poi: TmapPoi): string =>
  [poi.roadName, poi.firstNo, poi.secondNo].filter(isNonEmptyString).join(" ");

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;
