import ky from "ky";
import { z } from "zod";

import {
  type LocalSeed,
  type LocalSeedSearchResponse,
  LocalSeedSearchResponseSchema,
} from "./contracts.js";
import { normalizeLocalSeedSearchParams } from "./search-params.js";
import type { LocalSeedSearchParams } from "./types.js";

export type NaverLocalCredentials = {
  clientId?: string;
  clientSecret?: string;
};

const NaverLocalItemSchema = z
  .object({
    title: z.string(),
    link: z.string().optional(),
    category: z.string().optional(),
    telephone: z.string().optional(),
    address: z.string().optional(),
    roadAddress: z.string().optional(),
    /** WGS84 경도 × 10^7. */
    mapx: z.string(),
    /** WGS84 위도 × 10^7. */
    mapy: z.string(),
  })
  .passthrough();

const NaverLocalResponseSchema = z
  .object({
    total: z.number().int().nonnegative(),
    items: z.array(NaverLocalItemSchema),
  })
  .passthrough();

export type NaverLocalItem = z.infer<typeof NaverLocalItemSchema>;

const NaverLocalApi = ky.create({
  prefix: "https://openapi.naver.com/v1/search",
  timeout: 10_000,
  retry: {
    limit: 2,
    methods: ["get"],
    statusCodes: [408, 429, 500, 502, 503, 504],
  },
});

/**
 * 네이버 지역검색이 한 번에 주는 최대 건수.
 *
 * `display`를 10으로 올려도, `start`를 6이나 11로 넘겨도 **같은 5건**이 돌아온다
 * (실측). 즉 페이지네이션이 없다. 그래서 이 provider는 물량을 댈 수 없고,
 * 물량은 카카오·TMap이 맡는다.
 */
const NAVER_LOCAL_MAX_ITEMS = 5;

/** 좌표 배율. 네이버는 WGS84를 10^7배 정수로 준다. */
const NAVER_COORDINATE_SCALE = 10_000_000;

/**
 * 네이버 지역검색으로 seed를 찾는다.
 *
 * 카카오와 TMap은 상호명·업종 분류를 문자열로 맞춰 찾는다. 그래서 업종 분류에 없는
 * 말은 아무리 뜻이 분명해도 0건이 나온다 — 실측에서 "파인다이닝 코스요리"와
 * "미쉐린 레스토랑"이 카카오·TMap 모두 0건이었다.
 *
 * 네이버 지역검색은 같은 질의에 실제 파인다이닝(토우베·파씨오네·스와니예·에빗)을
 * 돌려준다. "홍대 조용한 카페"에는 개인 카페만, "이태원 비건"에는 플랜트 이태원점을
 * 준다. 의미로 찾는 검색이라 우리 규칙이 못 하는 일을 한다.
 *
 * 대신 5건이 전부다. 정밀도는 높고 재현율은 낮은 provider로 쓴다.
 */
export const searchNaverLocal = async (
  params: LocalSeedSearchParams,
  credentials: NaverLocalCredentials = {},
): Promise<LocalSeedSearchResponse> => {
  const searchParams = normalizeLocalSeedSearchParams(params);
  const { clientId, clientSecret } = credentials;
  if (!clientId || !clientSecret) {
    throw new Error("Naver search credentials are required");
  }

  const response = await NaverLocalApi.get("local.json", {
    searchParams: {
      query: searchParams.query,
      display: NAVER_LOCAL_MAX_ITEMS,
      start: 1,
      sort: "random",
    },
    headers: {
      "X-Naver-Client-Id": clientId,
      "X-Naver-Client-Secret": clientSecret,
    },
  }).json<unknown>();

  const parsed = NaverLocalResponseSchema.parse(response);
  const seeds = toNaverLocalSeeds(parsed.items);

  return LocalSeedSearchResponseSchema.parse({
    provider: "naver",
    query: searchParams.query,
    page: searchParams.page,
    count: searchParams.count,
    totalCount: parsed.total,
    // 페이지를 넘길 수 없으므로 항상 소진으로 표시한다.
    isEnd: true,
    seeds,
  });
};

/** 네이버 응답 항목을 seed로 옮긴다. 좌표를 못 읽는 항목은 버린다. */
export const toNaverLocalSeeds = (items: readonly NaverLocalItem[]): LocalSeed[] =>
  items.flatMap(toLocalSeed);

const toLocalSeed = (item: NaverLocalItem): LocalSeed[] => {
  // `Number("")`는 0이라 유한성만 보면 빈 좌표가 (0, 0)이라는 멀쩡해 보이는 값이
  // 된다. 기니만 앞바다에 있는 가게가 후보로 들어온다. 빈 값과 0을 명시적으로 뺀다.
  const longitude = toCoordinate(item.mapx);
  const latitude = toCoordinate(item.mapy);
  if (longitude === undefined || latitude === undefined) return [];

  const name = stripSearchMarkup(item.title);
  if (name.length === 0) return [];

  return [
    {
      provider: "naver",
      name,
      category: item.category ?? "",
      phone: item.telephone ?? "",
      address: item.address ?? "",
      roadAddress: item.roadAddress ?? "",
      longitude,
      latitude,
    },
  ];
};

const toCoordinate = (raw: string): number | undefined => {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return undefined;

  const value = Number(trimmed);
  if (!Number.isFinite(value) || value === 0) return undefined;
  return value / NAVER_COORDINATE_SCALE;
};

/** 네이버는 질의어와 겹치는 부분을 `<b>`로 감싸서 준다. */
const stripSearchMarkup = (value: string): string =>
  value
    .replace(/<[^>]*>/gu, "")
    .replace(/&amp;/gu, "&")
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/&quot;/gu, '"')
    .replace(/&#39;/gu, "'")
    .replace(/\s+/gu, " ")
    .trim();
