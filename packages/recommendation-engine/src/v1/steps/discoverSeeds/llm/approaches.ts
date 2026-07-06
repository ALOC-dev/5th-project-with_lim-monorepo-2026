import type { UserInput } from "../../../interfaces/input.contracts.js";
import { generateRecommendationObject, RECOMMENDATION_LLM_MODEL_ID } from "../../../llm/ai-sdk.js";
import type { SearchQuery } from "../contracts.js";
import {
  LlmDiscoveryContextResponseSchema,
  MAX_DISCOVERY_TERM_COUNT,
  MIN_DISCOVERY_TERM_COUNT,
} from "./approaches.contracts.js";

const DISCOVERY_CONTEXT_MODEL_ID = RECOMMENDATION_LLM_MODEL_ID;

const DISCOVERY_CONTEXT_SYSTEM_PROMPT = `너는 지역 추천 엔진의 DiscoveryContext 생성기다.
사용자가 자연어로 적은 요청을 받아, 지도/로컬 검색 API에 그대로 넣을 수 있는
짧은 검색어 후보를 만든다.

규칙:
- 검색어는 ${MIN_DISCOVERY_TERM_COUNT}~${MAX_DISCOVERY_TERM_COUNT}개 사이로 만든다.
- 각 query는 로컬 검색 API에 넣을 짧은 한국어 키워드 묶음으로 작성한다.
  예) "와인바", "실내 카페", "조용한 한식", "동대문 맛집"
- 문장, 조사/어미가 붙은 긴 표현, 요청문은 금지한다.
  나쁜 예) "비 오는 날 가기 좋은 실내 카페를 찾아줘", "조용하고 오래 앉아있기 좋은 곳"
- 사용자 조건이 좁으면, 모든 query를 좁게 만들지 말고 최소 하나는 업종 중심의 넓은 query로 만든다.
- 동일/유사 의미의 query를 중복 생성하지 않는다.
- count는 페이지당 요청 개수(즉 pagination.count)이며, 모든 query의 count 합은 targetSeedCount와 같다.
- page는 최초 호출에서는 1로 시작한다.
- 출력은 반드시 다음 JSON 스키마만 사용한다. 어떤 설명/주석/마크다운도 붙이지 않는다.

{
  "queries": [
    { "query": string, "count": number, "page": number }
  ]
}`;

const buildDiscoveryContextUserPrompt = (input: {
  userInput: UserInput;
  targetSeedCount: number;
}): string =>
  [
    "다음 사용자 입력에서 DiscoveryContext를 만들어줘.",
    "```json",
    JSON.stringify(
      {
        userNaturalLanguageRequest: input.userInput.userNaturalLanguageRequest,
        partyType: input.userInput.partyType,
        numberOfPeople: input.userInput.numberOfPeople,
        budgetPerPerson: input.userInput.budgetPerPerson,
        schedule: input.userInput.schedule,
        location: input.userInput.location,
        targetSeedCount: input.targetSeedCount,
      },
      null,
      2,
    ),
    "```",
  ].join("\n");

export const createDiscoveryContextWithLlm = async (
  userInput: UserInput,
  options: {
    openAiApiKey?: string;
    targetSeedCount: number;
  },
): Promise<SearchQuery[]> => {
  const { queries } = await generateRecommendationObject({
    task: "discover.discovery_context",
    modelId: DISCOVERY_CONTEXT_MODEL_ID,
    openAiApiKey: options.openAiApiKey,
    schema: LlmDiscoveryContextResponseSchema,
    system: DISCOVERY_CONTEXT_SYSTEM_PROMPT,
    prompt: buildDiscoveryContextUserPrompt({
      userInput,
      targetSeedCount: options.targetSeedCount,
    }),
  });

  return normalizeQueryCounts(normalizeSearchQueries(queries, userInput), options.targetSeedCount);
};

const normalizeSearchQueries = (queries: SearchQuery[], userInput: UserInput): SearchQuery[] => {
  const normalized = queries.flatMap((query) => {
    const normalizedQuery = normalizeSearchQueryText(query.query);
    if (!normalizedQuery) return [];
    return [
      {
        ...query,
        query: normalizedQuery,
        page: 1,
      },
    ];
  });
  const fallbackQuery = inferBroadFallbackQuery(userInput);
  if (!fallbackQuery || normalized.some((query) => query.query.includes(fallbackQuery))) {
    return normalized;
  }

  if (normalized.length < MAX_DISCOVERY_TERM_COUNT) {
    return [
      ...normalized,
      {
        query: fallbackQuery,
        count: 1,
        page: 1,
      },
    ];
  }

  const lastQuery = normalized.at(-1);
  if (!lastQuery) return normalized;

  return [
    ...normalized.slice(0, -1),
    {
      ...lastQuery,
      query: fallbackQuery,
      page: 1,
    },
  ];
};

const normalizeSearchQueryText = (query: string): string =>
  query
    .replace(/[.,!?;:"'`()[\]{}<>]/gu, " ")
    .replace(/(?:추천|찾아|찾기|가고\s*싶은|갈\s*만한|가기\s*좋은|해줘|해주세요)/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();

const inferBroadFallbackQuery = (userInput: UserInput): string | undefined => {
  const request = userInput.userNaturalLanguageRequest;
  if (/카페|커피|디저트|브런치|베이커리|티룸|차\b|tea|coffee|cafe/iu.test(request)) {
    return "카페";
  }
  if (/술집|맥주|펍|호프|바\b|bar\b|포차|와인|칵테일|이자카야/iu.test(request)) {
    return "술집";
  }
  if (/맛집|식당|음식|곱창|고기|파스타|한식|중식|일식|양식|비건|점심|저녁/iu.test(request)) {
    return "맛집";
  }
  return undefined;
};

const normalizeQueryCounts = (queries: SearchQuery[], targetSeedCount: number): SearchQuery[] => {
  const total = queries.reduce((sum, query) => sum + query.count, 0);
  if (total === targetSeedCount) return queries;

  const normalized = queries.map((query) => ({ ...query }));
  if (total < targetSeedCount) {
    const firstQuery = normalized[0];
    if (!firstQuery) return normalized;
    normalized[0] = {
      ...firstQuery,
      count: firstQuery.count + targetSeedCount - total,
    };
    return normalized;
  }

  let remainingReduction = total - targetSeedCount;
  for (let index = normalized.length - 1; index >= 0 && remainingReduction > 0; index -= 1) {
    const query = normalized[index];
    if (!query) continue;

    const reduction = Math.min(query.count - 1, remainingReduction);
    normalized[index] = {
      ...query,
      count: query.count - reduction,
    };
    remainingReduction -= reduction;
  }

  return normalized;
};
