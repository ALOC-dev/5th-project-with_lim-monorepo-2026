import { z } from "zod";

/** 장소 종류. 체류 시간 기본 범위를 결정한다. */
export const PLACE_KINDS = [
  "ACTIVITY",
  "BAR",
  "MEAL",
  "CAFE",
  "OUTDOOR",
  "SHOPPING",
  "OTHER",
] as const;
export const PlaceKindSchema = z.enum(PLACE_KINDS);
export type PlaceKind = z.infer<typeof PlaceKindSchema>;

/**
 * 체류 시간을 점이 아니라 범위로 잡는다.
 *
 * 카페에 40분 있을지 90분 있을지는 장소가 아니라 코스 전체 사정이 정한다.
 * 탐색은 `typical`로 하고, 코스가 확정된 뒤 남는 시간을 `max`까지 재분배한다.
 */
export const StayRangeSchema = z
  .object({
    min: z.number().int().positive(),
    typical: z.number().int().positive(),
    max: z.number().int().positive(),
  })
  .strict()
  .refine((range) => range.min <= range.typical && range.typical <= range.max, {
    message: "stay range must satisfy min <= typical <= max",
  });
export type StayRange = z.infer<typeof StayRangeSchema>;

/** `typical`을 최종적으로 결정한 신호. 튜닝과 디버깅용으로 남긴다. */
export const STAY_SOURCES = ["CATEGORY", "LAST_ORDER", "PRICE", "LLM"] as const;
export const StaySourceSchema = z.enum(STAY_SOURCES);
export type StaySource = z.infer<typeof StaySourceSchema>;

export type PlaceStayEstimate = {
  kind: PlaceKind;
  range: StayRange;
  source: StaySource;
};

/** LLM 보정 요청에 넘길 장소 요약. 좌표나 영업시간은 넘기지 않는다. */
export const StayEstimateCandidateSchema = z
  .object({
    placeId: z.string().trim().min(1),
    name: z.string().trim().min(1),
    category: z.string().trim().min(1),
    tags: z.array(z.string().trim().min(1)),
    contentSummary: z.string().trim().min(1),
    pricePerPersonWon: z.tuple([z.number().int().gte(0), z.number().int().gte(0)]),
    /** 카테고리 기준 허용 범위. LLM은 이 범위 안에서만 답해야 한다. */
    minMinutes: z.number().int().positive(),
    maxMinutes: z.number().int().positive(),
    baselineMinutes: z.number().int().positive(),
  })
  .strict();
export type StayEstimateCandidate = z.infer<typeof StayEstimateCandidateSchema>;

export const StayEstimateResponseSchema = z
  .object({
    estimates: z
      .array(
        z
          .object({
            placeId: z.string().trim().min(1),
            typicalStayMinutes: z.number().int().min(10).max(300),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();
export type StayEstimateResponse = z.infer<typeof StayEstimateResponseSchema>;

export type StayEstimateRequest = {
  candidates: StayEstimateCandidate[];
  openAiApiKey?: string;
};

export type StayEstimatorClient = (
  request: StayEstimateRequest,
) => Promise<StayEstimateResponse>;
