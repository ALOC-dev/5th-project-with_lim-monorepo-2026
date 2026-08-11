import { z } from "zod";

export const TravelPlaceSchema = z
  .object({
    id: z.string().trim().min(1),
    lat: z.number(),
    lng: z.number(),
  })
  .strict();
export type TravelPlace = z.infer<typeof TravelPlaceSchema>;

/**
 * 도보 이동 시간 매트릭스.
 *
 * 도보는 자동차와 달리 일방통행이나 중앙분리대의 영향을 거의 받지 않아 A->B와 B->A가
 * 사실상 같다. 따라서 한 방향만 계측하고 양방향에 같은 값을 채운다.
 *
 * 계측에 성공한 쌍만 담는다. 빠진 쌍은 엔진이 직선거리로 추정한다.
 */
export const WalkCalibrationSchema = z
  .object({
    /** 실측에 쓴 표본 쌍 수. */
    sampledPairCount: z.number().int().gte(0),
    /** 실제 보행 경로 길이 / 직선거리. 서울 도심 실측 기준 대체로 1.25~1.4. */
    detourFactor: z.number().gt(0),
    /** 실측 보행 속도. TMAP 기준 대체로 80m/분 근처. */
    metersPerMinute: z.number().gt(0),
  })
  .strict();
export type WalkCalibration = z.infer<typeof WalkCalibrationSchema>;

export const WalkTravelMatrixSchema = z
  .object({
    minutesByPlaceId: z.record(z.string(), z.record(z.string(), z.number().int().gte(0))),
    /**
     * 경로 API로 실제 계측한 쌍 수. 나머지는 추정값이다.
     * 생략하면 돌려준 쌍을 전부 실측으로 본다.
     */
    measuredPairCount: z.number().int().gte(0).optional(),
    /** 표본 보정을 쓴 경우의 계수. 전 쌍 실측이면 null. */
    calibration: WalkCalibrationSchema.nullable().optional(),
  })
  .strict();
export type WalkTravelMatrix = z.infer<typeof WalkTravelMatrixSchema>;

export type TravelMatrixRequest = {
  places: readonly TravelPlace[];
  /** 직선거리가 이 값을 넘으면 도보 불가로 보고 API를 호출하지 않는다. */
  maxWalkableMeters: number;
  /** 동시 요청 수 상한. */
  concurrency: number;
  tmapAppKey?: string;
};

export type TravelMatrixClient = (request: TravelMatrixRequest) => Promise<WalkTravelMatrix>;
