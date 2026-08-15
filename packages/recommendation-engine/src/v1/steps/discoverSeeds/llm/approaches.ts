import type { UserInput } from "../../../interfaces/input.contracts.js";
import { generateRecommendationObject, RECOMMENDATION_LLM_MODEL_ID } from "../../../llm/ai-sdk.js";
import { type SearchQuery, TMAP_SEARCH_COUNT_MAX } from "../contracts.js";
import {
  LlmDiscoveryContextResponseSchema,
  MAX_DISCOVERY_TERM_COUNT,
  MIN_DISCOVERY_TERM_COUNT,
} from "./approaches.contracts.js";

const DISCOVERY_CONTEXT_MODEL_ID = RECOMMENDATION_LLM_MODEL_ID;

const DISCOVERY_CONTEXT_SYSTEM_PROMPT = `너는 지역 추천 엔진의 DiscoveryContext 생성기다.
사용자가 자연어로 적은 요청을 받아, TMap POI 검색 API에 그대로 넣을 수 있는
짧은 검색어 후보를 만든다.

규칙:
- 검색어는 ${MIN_DISCOVERY_TERM_COUNT}~${MAX_DISCOVERY_TERM_COUNT}개 사이로 만든다.
- 각 query는 TMap 검색창에 입력하는 1~4 단어의 짧은 한국어 명사(구)로 작성한다.
  장소 유형 또는 업종명 중심으로 작성하고, 형용사·부사·조사·조건절은 포함하지 않는다.
  올바른 예) "파스타", "이탈리안 레스토랑", "파스타 맛집", "양식 레스토랑"
  잘못된 예) "분위기 좋은 와인바", "친구랑 가기 좋은 파스타집", "비 오는 날 가기 좋은 실내 카페"
- 사용자 조건이 좁으면, 모든 query를 좁게 만들지 말고 최소 하나는 업종 중심의 넓은 query로 만든다.
- 동일/유사 의미의 query를 중복 생성하지 않는다.
- 출력은 검색어 문자열만 담은 JSON 스키마를 그대로 따른다. 설명/주석/마크다운을 붙이지 않는다.`;

/**
 * 재시도용 프롬프트.
 *
 * 예전에는 재시도해도 같은 검색어의 다음 페이지만 봤다. 검색어 자체가 나쁘면
 * 5번을 시도해도 같은 실패를 반복하다 DISCOVER_SEEDS_EXHAUSTED로 끝났다.
 * 왜 실패했는지 알려주고 다른 각도의 검색어를 새로 만들게 한다.
 */
const DISCOVERY_RETRY_SYSTEM_PROMPT = `${DISCOVERY_CONTEXT_SYSTEM_PROMPT}

이번 호출은 재시도다. 이전 검색어로는 추천 가능한 장소를 충분히 찾지 못했다.
- previousQueries와 같거나 사실상 같은 검색어를 다시 만들지 않는다.
- previousFailureReason에 맞춰 전략을 바꾼다.
  ZERO_SEEDS: 검색어가 너무 좁았다. 더 넓은 상위 업종어로 바꾼다.
  TOO_FEW_OPEN_NOW: 영업 중인 곳이 적었다. 영업시간이 긴 업종이나 체인이 나올 검색어를 섞는다.
  LOW_QUALITY, REFERENCE_URL_REJECTED_HEAVY: 지도에서 확인되지 않는 장소가 많았다.
    널리 알려진 상호가 나올 만한 일반적인 업종어로 바꾼다.`;

const buildDiscoveryContextUserPrompt = (input: {
  userInput: UserInput;
  targetSeedCount: number;
  retry?: DiscoveryRetryContext;
}): string =>
  [
    input.retry
      ? "이전 검색어로는 부족했다. 다른 각도의 검색어를 새로 만들어줘."
      : "다음 사용자 입력에서 지도 검색어를 만들어줘.",
    "```json",
    JSON.stringify(
      {
        userNaturalLanguageRequest: input.userInput.userNaturalLanguageRequest,
        partyType: input.userInput.partyType,
        numberOfPeople: input.userInput.numberOfPeople,
        budgetPerPerson: input.userInput.budgetPerPerson,
        schedule: input.userInput.schedule,
        location: input.userInput.location,
        ...(input.retry
          ? {
              previousQueries: input.retry.previousQueries,
              previousFailureReason: input.retry.previousFailureReason,
            }
          : {}),
      },
      null,
      2,
    ),
    "```",
  ].join("\n");

export type DiscoveryRetryContext = {
  previousQueries: string[];
  previousFailureReason: string;
};

export const createDiscoveryContextWithLlm = async (
  userInput: UserInput,
  options: {
    openAiApiKey?: string;
    targetSeedCount: number;
    retry?: DiscoveryRetryContext;
  },
): Promise<SearchQuery[]> => {
  const { queries } = await generateRecommendationObject({
    task: "discover.discovery_context",
    modelId: DISCOVERY_CONTEXT_MODEL_ID,
    openAiApiKey: options.openAiApiKey,
    schema: LlmDiscoveryContextResponseSchema,
    system: options.retry ? DISCOVERY_RETRY_SYSTEM_PROMPT : DISCOVERY_CONTEXT_SYSTEM_PROMPT,
    prompt: buildDiscoveryContextUserPrompt({
      userInput,
      targetSeedCount: options.targetSeedCount,
      ...(options.retry ? { retry: options.retry } : {}),
    }),
  });

  return toSearchQueries(
    queries.map((query) => query.query),
    userInput,
    options.targetSeedCount,
  );
};

/**
 * LLM이 준 검색어 문자열을 실제 호출 가능한 SearchQuery로 만든다.
 * 개수 배분은 여기서 균등하게 한다. LLM에게 산술을 시키지 않는다.
 */
const toSearchQueries = (
  rawQueries: string[],
  userInput: UserInput,
  targetSeedCount: number,
): SearchQuery[] => {
  const texts = withBroadFallbackQuery(
    [...new Set(rawQueries.map(normalizeSearchQueryText).filter(Boolean))],
    userInput,
  );
  return distributeSeedCounts(texts, targetSeedCount);
};

const withBroadFallbackQuery = (queries: string[], userInput: UserInput): string[] => {
  const fallbackQuery = inferBroadFallbackQuery(userInput);
  if (!fallbackQuery || queries.some((query) => query.includes(fallbackQuery))) return queries;
  // 사용자 조건이 좁으면 결과가 0건이 되기 쉬우므로 넓은 업종어를 하나 섞는다.
  if (queries.length < MAX_DISCOVERY_TERM_COUNT) return [...queries, fallbackQuery];
  return [...queries.slice(0, -1), fallbackQuery];
};

/**
 * seed 목표치를 검색어들에 균등 배분한다.
 *
 * 예전에는 LLM이 만든 count를 쓰고 모자란 만큼을 전부 첫 검색어에 몰아줬다. 그래서
 * 검색어 하나가 결과 대부분을 가져오고 나머지는 구색만 갖췄다. 검색어를 여러 개
 * 만든 의미가 사라지는 배분이었다.
 */
export const distributeSeedCounts = (
  queries: string[],
  targetSeedCount: number,
): SearchQuery[] => {
  if (queries.length === 0) return [];

  const base = Math.floor(targetSeedCount / queries.length);
  const remainder = targetSeedCount % queries.length;

  return queries.map((query, index) => ({
    query,
    count: Math.max(1, Math.min(TMAP_SEARCH_COUNT_MAX, base + (index < remainder ? 1 : 0))),
    page: 1,
  }));
};

const normalizeSearchQueryText = (query: string): string =>
  query
    .replace(/[.,!?;:"'`()[\]{}<>]/gu, " ")
    .replace(/(?:추천|찾아|찾기|가고\s*싶은|갈\s*만한|가기\s*좋은|해줘|해주세요)/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();

const inferBroadFallbackQuery = (userInput: UserInput): string | undefined => {
  const request = userInput.userNaturalLanguageRequest;
  // `차\b`, `바\b`를 쓰면 안 된다. JS의 `\b`는 ASCII 단어경계라 한글 뒤에서는
  // 성립하지 않아 한국어 입력에서 절대 매칭되지 않는 죽은 패턴이 된다.
  if (/카페|커피|디저트|브런치|베이커리|티룸|찻집|tea|coffee|cafe/iu.test(request)) {
    return "카페";
  }
  if (/술집|맥주|펍|호프|와인바|칵테일바|위스키바|bar\b|포차|와인|칵테일|이자카야|한잔/iu.test(request)) {
    return "술집";
  }
  if (/맛집|식당|음식|곱창|고기|파스타|한식|중식|일식|양식|비건|점심|저녁/iu.test(request)) {
    return "맛집";
  }
  return undefined;
};
