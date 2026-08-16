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
    // 이번 페이지까지 누적한 결과가 전체 건수에 도달했으면 더 넘길 페이지가 없다.
    // `seeds.length < count`만 보면 마지막 페이지가 정확히 count개일 때 빈 페이지를
    // 한 번 더 조회한다.
    isEnd:
      seeds.length < searchParams.count ||
      searchParams.page * searchParams.count >= Number(response.searchPoiInfo.totalCount),
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
    searchParams.radius = toTmapRadiusKm(params.location.radiusKm);
  }

  return searchParams;
};

/** TMap이 받는 반경의 상한(km). */
const TMAP_MAX_RADIUS_KM = 33;

/**
 * TMap의 `radius`는 **km 정수**만 받는다. 소수를 넘기면 400을 준다.
 *
 * 검색 반경을 5,000m에서 1,500m로 좁히면서 `1500 / 1000 = 1.5`가 넘어갔고,
 * 그때부터 TMap이 모든 검색어에서 400으로 죽었다. 실패가 빈 결과로 조용히
 * 바뀌던 탓에 카카오 혼자 돌고 있다는 걸 아무도 몰랐다(실측 400: 1.5 / 2.4 /
 * 3.84, 성공: 2 / 5).
 *
 * 내림이 아니라 **올림**한다. 1.5km를 1km로 줄이면 의도한 범위보다 좁게 찾아
 * 경계에 있는 장소를 놓친다. 넓게 받아온 뒤 거리 게이트에서 잘라내는 편이 낫다.
 */
export const toTmapRadiusKm = (radiusKm: number): number =>
  Math.min(TMAP_MAX_RADIUS_KM, Math.max(1, Math.ceil(radiusKm)));

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

/**
 * 지번 주소. "서울 동대문구 휘경동 319-32" 형태로 맞춘다.
 *
 * 예전에는 번지를 빼고 동까지만 만들어서("서울 동대문구 휘경동") 카카오의
 * `address_name`과 비교했을 때 같은 동의 모든 가게가 똑같은 점수를 받았다.
 */
const getTmapAddress = (poi: TmapPoi): string => {
  const area = [poi.upperAddrName, poi.middleAddrName, poi.lowerAddrName]
    .filter(isNonEmptyString)
    .join(" ");
  const lotNumber = joinBuildingNumber(poi.firstNo, poi.secondNo);

  return [area, lotNumber || poi.detailAddrName].filter(isNonEmptyString).join(" ");
};

/**
 * 도로명 주소.
 *
 * 예전에는 `roadName + firstNo + secondNo`를 이어붙였다. 그런데 `firstNo`/`secondNo`는
 * **지번**이지 도로명 건물번호가 아니다. 그래서 "회기로28길 319 32" 같은, 실제로
 * 존재하지 않는 주소가 만들어졌다(진짜 주소는 "서울 동대문구 회기로28길 11").
 * 시/구 접두어도 빠져 있었다.
 *
 * 그 결과 TMap seed의 주소 점수가 통째로 무너졌고, 카카오 참조 URL 확인이
 * 줄줄이 실패했다. 실측에서 거절된 후보 10건이 전부 멀쩡한 곱창집이었다.
 *
 * TMap은 `newAddressList`에 완성된 도로명주소를 주므로 그걸 먼저 쓰고,
 * 없을 때만 건물번호로 직접 조립한다.
 */
const getTmapRoadAddress = (poi: TmapPoi): string => {
  const fullAddressRoad = getTmapFullRoadAddress(poi);
  if (fullAddressRoad) return fullAddressRoad;

  const buildingNumber = joinBuildingNumber(poi.firstBuildNo, poi.secondBuildNo);
  if (!isNonEmptyString(poi.roadName) || !buildingNumber) return "";

  return [poi.upperAddrName, poi.middleAddrName, poi.roadName, buildingNumber]
    .filter(isNonEmptyString)
    .join(" ");
};

const getTmapFullRoadAddress = (poi: TmapPoi): string | undefined => {
  const list = poi.newAddressList;
  if (typeof list !== "object" || list === null) return undefined;

  const first = list.newAddress?.[0];
  return isNonEmptyString(first?.fullAddressRoad) ? first.fullAddressRoad : undefined;
};

/** 본번-부번. 부번이 없거나 "0"이면 본번만 쓴다. */
const joinBuildingNumber = (first?: string, second?: string): string => {
  if (!isNonEmptyString(first)) return "";
  if (!isNonEmptyString(second) || second === "0") return first;
  return `${first}-${second}`;
};

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;
