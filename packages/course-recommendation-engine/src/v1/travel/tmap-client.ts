import ky from "ky";
import { z } from "zod";

import type { TravelPlace } from "./contracts.js";

/** TMAP 보행자 경로안내 1회 호출 결과. */
export type WalkLeg = {
  /** 실제 보행 경로 거리(m). 직선거리보다 길다. */
  meters: number;
  seconds: number;
};

export type WalkLegFetcher = (
  from: TravelPlace,
  to: TravelPlace,
  tmapAppKey: string,
  signal?: AbortSignal,
) => Promise<WalkLeg | undefined>;

const TmapApi = ky.create({
  prefix: "https://apis.openapi.sk.com/tmap",
  timeout: 10_000,
  retry: {
    limit: 2,
    methods: ["post"],
    statusCodes: [408, 429, 500, 502, 503, 504],
  },
});

const TMAP_API_VERSION = 1;
const COORD_TYPE = "WGS84GEO";

// 응답에 필요한 값만 뽑는다. zod 기본 object는 모르는 키를 조용히 버린다.
// 실제 응답은 features 17개짜리 GeoJSON이고 요약값은 첫 feature에만 들어 있다.
const TmapPedestrianResponseSchema = z.object({
  features: z
    .array(
      z.object({
        properties: z.object({
          totalTime: z.number().optional(),
          totalDistance: z.number().optional(),
        }),
      }),
    )
    .min(1),
});

/**
 * 좌표쌍 -> 경로 결과. 같은 상권의 장소 쌍은 사용자 간에 반복되므로 캐시가 잘 먹는다.
 * 좌표는 약 11m 격자로 반올림해 미세한 좌표 차이가 캐시를 비껴가지 않게 한다.
 */
const walkLegCache = new Map<string, WalkLeg>();
const WALK_LEG_CACHE_LIMIT = 5_000;

const toCacheKey = (from: TravelPlace, to: TravelPlace): string => {
  const round = (value: number): string => value.toFixed(4);
  const left = `${round(from.lat)},${round(from.lng)}`;
  const right = `${round(to.lat)},${round(to.lng)}`;
  // 도보는 대칭이므로 정렬해 A->B와 B->A가 같은 키를 쓰게 한다.
  return left < right ? `${left}|${right}` : `${right}|${left}`;
};

/** 테스트나 장기 실행 프로세스에서 캐시를 비울 때 쓴다. */
export const clearWalkLegCache = (): void => walkLegCache.clear();

export const fetchTmapWalkLeg: WalkLegFetcher = async (from, to, tmapAppKey, signal) => {
  const cacheKey = toCacheKey(from, to);
  const cached = walkLegCache.get(cacheKey);
  if (cached) return cached;

  const response = await TmapApi.post("routes/pedestrian", {
    signal,
    searchParams: { version: TMAP_API_VERSION },
    headers: { appKey: tmapAppKey, Accept: "application/json" },
    json: {
      startX: String(from.lng),
      startY: String(from.lat),
      endX: String(to.lng),
      endY: String(to.lat),
      reqCoordType: COORD_TYPE,
      resCoordType: COORD_TYPE,
      // TMAP은 출발/도착 명칭을 필수로 요구하고 URL 인코딩된 값을 기대한다.
      startName: encodeURIComponent("출발"),
      endName: encodeURIComponent("도착"),
    },
  });

  const parsed = TmapPedestrianResponseSchema.parse(await response.json());
  const properties = parsed.features[0]?.properties;
  if (properties?.totalTime === undefined || properties.totalDistance === undefined) {
    return undefined;
  }

  const leg: WalkLeg = { meters: properties.totalDistance, seconds: properties.totalTime };
  if (walkLegCache.size >= WALK_LEG_CACHE_LIMIT) {
    const oldest = walkLegCache.keys().next();
    if (!oldest.done) walkLegCache.delete(oldest.value);
  }
  walkLegCache.set(cacheKey, leg);

  return leg;
};

export const toWalkLegMinutes = (leg: WalkLeg): number => Math.max(1, Math.ceil(leg.seconds / 60));

export const runWithConcurrency = async <TItem>(
  items: readonly TItem[],
  limit: number,
  worker: (item: TItem) => Promise<void>,
): Promise<void> => {
  if (items.length === 0) return;

  let cursor = 0;
  const runner = async (): Promise<void> => {
    while (cursor < items.length) {
      const item = items[cursor];
      cursor += 1;
      if (item === undefined) continue;
      await worker(item);
    }
  };

  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, runner));
};
