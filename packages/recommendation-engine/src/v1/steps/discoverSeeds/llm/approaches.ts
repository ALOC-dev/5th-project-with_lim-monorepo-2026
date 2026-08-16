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
사용자가 자연어로 적은 요청을 받아, TMap POI 검색 API에 그대로 넣을 수 있는
짧은 검색어 후보를 만든다.

규칙:
- 검색어는 ${MIN_DISCOVERY_TERM_COUNT}~${MAX_DISCOVERY_TERM_COUNT}개 사이로 만든다.
- 각 query는 TMap 검색창에 입력하는 1~4 단어의 짧은 한국어 명사(구)로 작성한다.
  장소 유형 또는 업종명 중심으로 작성하고, 형용사·부사·조사·조건절은 포함하지 않는다.
  올바른 예) "파스타", "이탈리안 레스토랑", "파스타 맛집", "양식 레스토랑"
  잘못된 예) "분위기 좋은 와인바", "친구랑 가기 좋은 파스타집", "비 오는 날 가기 좋은 실내 카페"
- 지도는 **상호명과 업종 분류**로 찾는다. 격식·가격대·평판을 나타내는 말은 업종이
  아니라서 검색되지 않는다. 실측에서 "파인다이닝 코스요리", "미쉐린 레스토랑"은
  각각 0건이었다. 그런 요청은 실제 업종어로 바꿔라.
  예) "파인다이닝" → "레스토랑", "이탈리안 레스토랑", "일식당", "코스요리"
      "가성비" → 해당 업종어 그대로,  "핫플" → 해당 업종어 그대로
- 사용자 조건이 좁으면, 모든 query를 좁게 만들지 말고 최소 하나는 업종 중심의 넓은 query로 만든다.
- 동일/유사 의미의 query를 중복 생성하지 않는다.
- requestUnderstood: 요청에서 "어떤 장소를 찾는지"를 읽어낼 수 있으면 true.
  키보드를 아무렇게나 친 문자열, 뜻 없는 낱자·자모 나열처럼 장소 요청으로 볼 수
  없으면 false로 준다. false일 때도 queries는 스키마를 맞추기 위해 아무거나 하나
  넣어라 — 어차피 쓰이지 않는다.
  판단은 보수적으로 한다. 막연하지만 장소를 찾는 뜻이면("아무데나", "놀 곳") true다.
  정상 요청을 false로 막는 쪽이 훨씬 나쁘다.
- 출력은 JSON 스키마를 그대로 따른다. 설명/주석/마크다운을 붙이지 않는다.`;

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

/** 요청을 장소 검색으로 읽어낼 수 없을 때 던진다. 호출자가 즉시 끊는다. */
export class UninterpretableRequestError extends Error {
  constructor() {
    super("요청에서 어떤 장소를 찾아야 할지 읽어낼 수 없습니다.");
    this.name = "UninterpretableRequestError";
  }
}

export const createDiscoveryContextWithLlm = async (
  userInput: UserInput,
  options: {
    openAiApiKey?: string;
    targetSeedCount: number;
    retry?: DiscoveryRetryContext;
  },
): Promise<SearchQuery[]> => {
  const { queries, requestUnderstood } = await generateRecommendationObject({
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

  // 재시도 호출에서는 판정하지 않는다. 첫 호출에서 이미 통과한 요청이고,
  // 재시도는 "검색어가 나빴다"는 뜻이지 "요청이 이상하다"는 뜻이 아니다.
  if (!requestUnderstood && !options.retry) {
    throw new UninterpretableRequestError();
  }

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

/**
 * 사용자 조건이 좁으면 결과가 0건이 되기 쉬우므로 넓은 업종어를 하나 섞는다.
 *
 * 단, **자리가 남을 때만 덧붙인다.** 예전에는 검색어가 상한(4개)까지 차 있으면
 * 마지막 검색어를 "맛집" 같은 최광의어로 갈아치웠다. 그래서 잘 만들어진 특화
 * 검색어가 버려지고 반경 안의 아무 식당이나 쏟아져 들어왔다 — 실측에서 "회기 곱창"
 * 요청에 김밥집·꽈배기집·프랜차이즈 카페가 추천 10건 중 5건을 차지했다.
 *
 * 검색어가 전부 너무 좁아서 결과가 모자란 경우는 재시도가 이미 처리한다
 * (`DISCOVERY_RETRY_SYSTEM_PROMPT`의 ZERO_SEEDS 전략).
 */
const withBroadFallbackQuery = (queries: string[], userInput: UserInput): string[] => {
  const fallbackQuery = inferBroadFallbackQuery(userInput);
  if (!fallbackQuery || queries.some((query) => query.includes(fallbackQuery))) return queries;
  if (queries.length < MAX_DISCOVERY_TERM_COUNT) return [...queries, fallbackQuery];
  return queries;
};

/**
 * seed 목표치를 검색어들에 균등 배분한다.
 *
 * 예전에는 LLM이 만든 count를 쓰고 모자란 만큼을 전부 첫 검색어에 몰아줬다. 그래서
 * 검색어 하나가 결과 대부분을 가져오고 나머지는 구색만 갖췄다. 검색어를 여러 개
 * 만든 의미가 사라지는 배분이었다.
 *
 * `DiscoveryContextSchema`가 "count 합 == targetSeedCount"를 요구하므로 나머지를
 * 앞쪽 검색어에 1씩 나눠 정확히 맞춘다. 페이지당 개수에 상한을 걸면 이 불변식이
 * 깨져 컨텍스트 생성 자체가 실패한다.
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
    count: Math.max(1, base + (index < remainder ? 1 : 0)),
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
