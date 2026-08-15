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

export const LlmDiscoveryContextResponseSchema = z
  .object({
    queries: z
      .array(LlmDiscoveryContextQuerySchema)
      .min(MIN_DISCOVERY_TERM_COUNT)
      .max(MAX_DISCOVERY_TERM_COUNT),
  })
  .strict();
