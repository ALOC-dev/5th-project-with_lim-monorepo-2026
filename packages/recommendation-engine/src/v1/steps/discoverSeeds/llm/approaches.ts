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
- 각 query는 검색창에 입력할 수 있는 한국어 명사구로 작성한다.
  예) "분위기 좋은 와인바", "비 오는 날 가기 좋은 실내 카페"
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

  return normalizeQueryCounts(queries, options.targetSeedCount);
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
