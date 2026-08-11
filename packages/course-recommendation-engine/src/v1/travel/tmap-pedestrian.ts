import type { TravelMatrixClient, TravelPlace } from "./contracts.js";
import { toDistanceMeters } from "./distance.js";
import {
  fetchTmapWalkLeg,
  runWithConcurrency,
  toWalkLegMinutes,
  type WalkLegFetcher,
} from "./tmap-client.js";

/**
 * 모든 도보권 쌍을 TMAP 보행자 경로안내로 실측한다.
 *
 * 가장 정확하지만 가장 비싸다. 이 API는 1:1이라 장소 15개면 대칭을 감안해도
 * 105회가 나가는데, 무료 한도가 일 1,000회라 추천 9번이면 소진된다.
 * 한도가 넉넉하거나 장소가 적을 때만 쓰고, 평소에는
 * `createCalibratedTmapMatrixClient`를 쓰는 편이 낫다.
 */

export type TmapPedestrianMatrixOptions = {
  /** 테스트용 주입 지점. 기본값은 실제 TMAP 호출이다. */
  fetchLeg?: WalkLegFetcher;
};

export const createTmapPedestrianMatrixClient = (
  options: TmapPedestrianMatrixOptions = {},
): TravelMatrixClient =>
  async ({ places, maxWalkableMeters, concurrency, tmapAppKey }) => {
    if (!tmapAppKey) {
      throw new Error("TMAP app key is required for pedestrian travel times");
    }

    const fetchLeg = options.fetchLeg ?? fetchTmapWalkLeg;

    const pairs: [TravelPlace, TravelPlace][] = [];
    for (let left = 0; left < places.length; left += 1) {
      for (let right = left + 1; right < places.length; right += 1) {
        const from = places[left];
        const to = places[right];
        if (!from || !to) continue;
        // 걸어갈 수 있는 거리가 아니면 호출하지 않는다. 엔진이 직선거리로 추정한다.
        if (toDistanceMeters(from, to) > maxWalkableMeters) continue;
        pairs.push([from, to]);
      }
    }

    const minutesByPlaceId: Record<string, Record<string, number>> = {};
    let measuredPairCount = 0;
    const record = (from: TravelPlace, to: TravelPlace, minutes: number): void => {
      (minutesByPlaceId[from.id] ??= {})[to.id] = minutes;
      (minutesByPlaceId[to.id] ??= {})[from.id] = minutes;
      measuredPairCount += 1;
    };

    // 첫 쌍은 순차로 처리한다. 키가 잘못됐거나 네트워크가 죽었으면 여기서 바로 실패해
    // 나머지 수십 건을 헛되이 던지지 않는다.
    const [head, ...rest] = pairs;
    if (!head) return { minutesByPlaceId, measuredPairCount: 0, calibration: null };

    const headLeg = await fetchLeg(head[0], head[1], tmapAppKey);
    if (headLeg) record(head[0], head[1], toWalkLegMinutes(headLeg));

    // 이후 개별 실패는 무시한다. 빠진 쌍은 엔진이 직선거리로 메운다.
    await runWithConcurrency(rest, concurrency, async ([from, to]) => {
      try {
        const leg = await fetchLeg(from, to, tmapAppKey);
        if (leg) record(from, to, toWalkLegMinutes(leg));
      } catch {
        // 이 쌍만 추정으로 떨어진다.
      }
    });

    return { minutesByPlaceId, measuredPairCount, calibration: null };
  };
