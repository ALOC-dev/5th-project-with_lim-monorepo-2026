import type { TravelMatrixClient, TravelPlace, WalkCalibration } from "./contracts.js";
import { toDistanceMeters } from "./distance.js";
import {
  fetchTmapWalkLeg,
  runWithConcurrency,
  toWalkLegMinutes,
  type WalkLeg,
  type WalkLegFetcher,
} from "./tmap-client.js";

/**
 * 표본 몇 쌍만 실측해 보정계수를 구하고, 나머지는 직선거리에 그 계수를 적용한다.
 *
 * TMAP 보행자 API는 1:1이라 전 쌍을 재면 장소 15개에 105회가 나간다. 무료 한도가
 * 일 1,000회라 추천 9번이면 끝이다. 그런데 같은 동네 안에서는 우회 계수가 거의
 * 일정하다(홍대/연남/합정 실측 1.25~1.37). 그래서 몇 쌍만 재서 그 동네의 계수를
 * 뽑아 쓰면 호출을 20분의 1로 줄이면서 정확도는 대부분 지킬 수 있다.
 *
 * 실측한 쌍은 실측값을 그대로 쓰고, 나머지만 추정한다.
 */

export type CalibratedTmapMatrixOptions = {
  /** 실측할 표본 쌍 수. */
  sampleSize?: number;
  /** 테스트용 주입 지점. 기본값은 실제 TMAP 호출이다. */
  fetchLeg?: WalkLegFetcher;
};

type Pair = {
  from: TravelPlace;
  to: TravelPlace;
  straightMeters: number;
};

/**
 * 거리 순으로 정렬한 뒤 균등 간격으로 고른다. 가까운 쌍과 먼 쌍이 모두 표본에
 * 들어가야 보정계수가 특정 거리대에 치우치지 않는다. 무작위가 아니라 결정론적이라
 * 같은 입력이면 같은 표본을 고르고, 따라서 캐시도 그대로 재사용된다.
 */
const pickSamples = (pairs: readonly Pair[], sampleSize: number): Pair[] => {
  if (sampleSize <= 0) return [];
  if (pairs.length <= sampleSize) return [...pairs];
  if (sampleSize === 1) {
    const middle = pairs[Math.floor(pairs.length / 2)];
    return middle ? [middle] : [];
  }

  const step = (pairs.length - 1) / (sampleSize - 1);
  const picked: Pair[] = [];
  for (let index = 0; index < sampleSize; index += 1) {
    const pair = pairs[Math.round(index * step)];
    if (pair) picked.push(pair);
  }

  return picked;
};

const toCalibration = (
  samples: readonly { pair: Pair; leg: WalkLeg }[],
): WalkCalibration | null => {
  if (samples.length === 0) return null;

  let straightMeterSum = 0;
  let routeMeterSum = 0;
  let routeSecondSum = 0;
  for (const { pair, leg } of samples) {
    straightMeterSum += pair.straightMeters;
    routeMeterSum += leg.meters;
    routeSecondSum += leg.seconds;
  }

  if (straightMeterSum <= 0 || routeSecondSum <= 0 || routeMeterSum <= 0) return null;

  return {
    sampledPairCount: samples.length,
    // 실제 보행 경로가 직선거리보다 몇 배 긴가.
    detourFactor: routeMeterSum / straightMeterSum,
    // 실측 보행 속도. TMAP 기준 대체로 80m/분 근처로 나온다.
    metersPerMinute: routeMeterSum / (routeSecondSum / 60),
  };
};

export const createCalibratedTmapMatrixClient = (
  options: CalibratedTmapMatrixOptions = {},
): TravelMatrixClient =>
  async ({ places, maxWalkableMeters, concurrency, tmapAppKey }) => {
    if (!tmapAppKey) {
      throw new Error("TMAP app key is required for pedestrian travel times");
    }

    const fetchLeg = options.fetchLeg ?? fetchTmapWalkLeg;
    const sampleSize = options.sampleSize ?? 5;

    const allPairs: Pair[] = [];
    for (let left = 0; left < places.length; left += 1) {
      for (let right = left + 1; right < places.length; right += 1) {
        const from = places[left];
        const to = places[right];
        if (!from || !to) continue;
        allPairs.push({ from, to, straightMeters: toDistanceMeters(from, to) });
      }
    }

    if (allPairs.length === 0) {
      return { minutesByPlaceId: {}, measuredPairCount: 0, calibration: null };
    }

    // 표본은 도보권 쌍에서만 고른다. 애초에 걸어갈 수 없는 거리의 우회 계수는
    // 코스에 쓰이지도 않을뿐더러 계수를 왜곡시킨다.
    const walkablePairs = allPairs
      .filter((pair) => pair.straightMeters <= maxWalkableMeters)
      .sort((left, right) => left.straightMeters - right.straightMeters);
    const samples = pickSamples(walkablePairs, sampleSize);

    const measured: { pair: Pair; leg: WalkLeg }[] = [];

    // 첫 표본은 순차로 처리한다. 키가 잘못됐거나 네트워크가 죽었으면 여기서 바로
    // 실패해 엔진이 정적 추정으로 떨어지게 한다.
    const [head, ...rest] = samples;
    if (head) {
      const headLeg = await fetchLeg(head.from, head.to, tmapAppKey);
      if (headLeg) measured.push({ pair: head, leg: headLeg });

      await runWithConcurrency(rest, concurrency, async (pair) => {
        try {
          const leg = await fetchLeg(pair.from, pair.to, tmapAppKey);
          if (leg) measured.push({ pair, leg });
        } catch {
          // 이 표본만 버린다. 남은 표본으로 보정한다.
        }
      });
    }

    const calibration = toCalibration(measured);
    const minutesByPlaceId: Record<string, Record<string, number>> = {};
    const record = (pair: Pair, minutes: number): void => {
      (minutesByPlaceId[pair.from.id] ??= {})[pair.to.id] = minutes;
      (minutesByPlaceId[pair.to.id] ??= {})[pair.from.id] = minutes;
    };

    // 보정에 실패하면 아무것도 돌려주지 않는다. 엔진이 설정된 기본 속도로 추정한다.
    if (!calibration) return { minutesByPlaceId, measuredPairCount: 0, calibration: null };

    for (const pair of allPairs) {
      record(
        pair,
        Math.max(
          1,
          Math.ceil((pair.straightMeters * calibration.detourFactor) / calibration.metersPerMinute),
        ),
      );
    }

    // 실측한 쌍은 추정값을 실측값으로 덮어쓴다.
    for (const { pair, leg } of measured) record(pair, toWalkLegMinutes(leg));

    return { minutesByPlaceId, measuredPairCount: measured.length, calibration };
  };
