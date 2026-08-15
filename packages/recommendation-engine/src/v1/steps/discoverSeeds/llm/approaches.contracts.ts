import { z } from "zod";

export const MIN_DISCOVERY_TERM_COUNT = 1;
export const MAX_DISCOVERY_TERM_COUNT = 4;

/**
 * LLM에게는 검색어 문자열만 받는다.
 *
 * 예전에는 `count`(페이지당 개수)와 `page`까지 LLM이 만들게 하고 "모든 count의 합이
 * targetSeedCount와 같아야 한다"는 산술 제약을 프롬프트로 걸었다. LLM은 이런 산술에
 * 약해서 거의 항상 어긋났고, 그때마다 `normalizeQueryCounts`가 부족분을 첫 검색어에
 * 통째로 몰아줬다. 그 결과 검색어 1개가 대부분의 결과를 가져오고 나머지는 구색만
 * 갖추는 편중이 생겼다. 개수 배분은 코드가 균등하게 하는 게 정확하고 단순하다.
 */
const LlmDiscoveryContextQuerySchema = z
  .object({
    query: z.string().trim().min(1),
  })
  .strict();

/**
 * 장소 추천 엔진이 명시적으로 거절할 수 있는, 안정적인 사유 집합이다.
 *
 * 희소하거나 복합적인 장소 요청은 실패가 아니라 `AMBIGUOUS`로 계속 탐색한다.
 * 따라서 이 열거형은 실제로 장소를 찾을 수 없는 요청에만 쓴다.
 */
export const UnsupportedRecommendationReasonSchema = z.enum([
  "NONSENSE",
  "NON_PLACE_REQUEST",
  "CONTRADICTORY_REQUEST",
]);

export type UnsupportedRecommendationReason = z.infer<
  typeof UnsupportedRecommendationReasonSchema
>;

/**
 * OpenAI Structured Outputs에 전달하는 평면 wire 계약이다.
 *
 * `z.discriminatedUnion`은 JSON Schema의 root `oneOf`를 만들고, 현재 OpenAI
 * response_format은 이를 거절한다. 따라서 모델에는 모든 필드가 항상 존재하는
 * object만 전달하고, 아래의 semantic union으로 변환하기 전에 조합을 엄격히
 * 검증한다.
 */
export const LlmInitialDiscoveryPlanWireResponseSchema = z
  .object({
    intent: z.enum(["SUPPORTED", "AMBIGUOUS", "UNSUPPORTED"]),
    queries: z.array(LlmDiscoveryContextQuerySchema).max(MAX_DISCOVERY_TERM_COUNT),
    reason: z.enum(["NONE", "NONSENSE", "NON_PLACE_REQUEST", "CONTRADICTORY_REQUEST"]),
  })
  .strict();

export type LlmInitialDiscoveryPlanWireResponse = z.infer<
  typeof LlmInitialDiscoveryPlanWireResponseSchema
>;

/**
 * 첫 discovery 호출 결과의 내부 semantic 계약이다.
 *
 * 이 union은 모델에 직접 전달하지 않는다. OpenAI 호환 wire 계약을 검증·변환한
 * 뒤에만 사용하므로, 호출부는 계속 판별 가능한 엄격한 형태를 다룬다.
 */
export const LlmInitialDiscoveryPlanResponseSchema = z.discriminatedUnion("intent", [
  z
    .object({
      intent: z.literal("SUPPORTED"),
      queries: z
        .array(LlmDiscoveryContextQuerySchema)
        .min(MIN_DISCOVERY_TERM_COUNT)
        .max(MAX_DISCOVERY_TERM_COUNT),
    })
    .strict(),
  z
    .object({
      intent: z.literal("AMBIGUOUS"),
      queries: z
        .array(LlmDiscoveryContextQuerySchema)
        .min(MIN_DISCOVERY_TERM_COUNT)
        .max(MAX_DISCOVERY_TERM_COUNT),
    })
    .strict(),
  z
    .object({
      intent: z.literal("UNSUPPORTED"),
      reason: UnsupportedRecommendationReasonSchema,
    })
    .strict(),
]);

export type LlmInitialDiscoveryPlanResponse = z.infer<
  typeof LlmInitialDiscoveryPlanResponseSchema
>;

/**
 * 재시도용 query-only 계약. 최초 호출과 달리 의도를 다시 분류하지 않는다.
 */
export const LlmDiscoveryContextResponseSchema = z
  .object({
    queries: z
      .array(LlmDiscoveryContextQuerySchema)
      .min(MIN_DISCOVERY_TERM_COUNT)
      .max(MAX_DISCOVERY_TERM_COUNT),
  })
  .strict();
