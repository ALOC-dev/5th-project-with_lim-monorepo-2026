import { z } from "zod";

import type { UserInput } from "../../../interfaces/input.js";
import {
  generateRecommendationObject,
  RECOMMENDATION_LLM_MODEL_ID,
} from "../../../llm/ai-sdk.js";
import type { SearchApproach } from "../types.js";

// discoverSeeds의 "접근 추출" LLM 호출 사이트.
// utils/ 내부에서는 LLM을 절대 부르지 않는다 — 호출은 이 파일에 한정한다.
// 외부(discoverSeeds/index.ts 오케스트레이터)가 extractApproachesFromLlm을 부르고
// 결과 SearchApproach[]를 utils의 순수 함수에 인자로 넘긴다.
//
// 현재 와이어링: Vercel AI SDK(`generateObject`) + 공통 OpenAI nano 모델.

// ---------------------------------------------------------------------------
// 접근 개수 상/하한
// ---------------------------------------------------------------------------
// 너무 많이 쪼개지면 query budget이 잘게 분산돼 각 검색이 빈약해진다.
const MIN_APPROACH_COUNT = 1;
const MAX_APPROACH_COUNT = 4;

// ---------------------------------------------------------------------------
// 샘플 프롬프트 (확정 시 그대로 운영 사용)
// ---------------------------------------------------------------------------
// system: 추출기의 역할/형식/제약을 못 박는다.
// user:   userInput을 JSON으로 직렬화해 전달한다.
//
// 응답은 반드시 아래 JSON만 출력하도록 강제:
// {
//   "approaches": [
//     { "name": "분위기 좋은 와인바", "weight": 0.6 },
//     { "name": "디저트 카페",        "weight": 0.4 }
//   ]
// }

export const APPROACH_SYSTEM_PROMPT = `너는 지역 추천 엔진의 "검색 접근 추출기"다.
사용자가 자연어로 적은 요청을 받아, 지도/로컬 검색 API에 그대로 넣을 수 있는
짧은 검색어 후보(=접근)로 분해한다.

규칙:
- 접근은 ${MIN_APPROACH_COUNT}~${MAX_APPROACH_COUNT}개 사이로 만든다.
- 각 name은 검색창에 입력할 수 있는 한국어 명사구로 작성한다.
  예) "분위기 좋은 와인바", "비 오는 날 가기 좋은 실내 카페"
- 동일/유사 의미의 name을 중복 생성하지 않는다.
- weight는 0~1 합이 1이 되도록 분배한다. 사용자가 강조한 접근에 더 높게 준다.
- 출력은 반드시 다음 JSON 스키마만 사용한다. 어떤 설명/주석/마크다운도 붙이지 않는다.

{
  "approaches": [
    { "name": string, "weight": number }
  ]
}`;

export const buildApproachUserPrompt = (userInput: UserInput): string =>
  [
    "다음 사용자 입력에서 검색 접근을 뽑아줘.",
    "```json",
    JSON.stringify(
      {
        userNaturalLanguageRequest: userInput.userNaturalLanguageRequest,
        partyType: userInput.partyType,
        numberOfPeople: userInput.numberOfPeople,
        budgetPerPerson: userInput.budgetPerPerson,
        schedule: userInput.schedule,
        location: userInput.location,
      },
      null,
      2,
    ),
    "```",
  ].join("\n");

// ---------------------------------------------------------------------------
// LLM 응답 스키마
// ---------------------------------------------------------------------------

const LlmApproachSchema = z
  .object({
    name: z.string().trim().min(1),
    weight: z.number().positive().max(1),
  })
  .strict();

export const LlmApproachesResponseSchema = z
  .object({
    approaches: z
      .array(LlmApproachSchema)
      .min(MIN_APPROACH_COUNT)
      .max(MAX_APPROACH_COUNT),
  })
  .strict();

export type LlmApproachesResponse = z.infer<typeof LlmApproachesResponseSchema>;

// ---------------------------------------------------------------------------
// LLM 호출
// ---------------------------------------------------------------------------
// Vercel AI SDK가 LlmApproachesResponseSchema로 응답을 검증해주므로
// 반환된 object는 이미 검증된 LlmApproachesResponse다.
// 모든 오류는 공통 AI SDK 래퍼에서 task prefix로 감싸 분류할 수 있게 한다.
const APPROACH_MODEL_ID = RECOMMENDATION_LLM_MODEL_ID;

const callApproachLlm = async (
  userInput: UserInput,
): Promise<LlmApproachesResponse> => {
  return generateRecommendationObject({
    task: "discover.approaches",
    modelId: APPROACH_MODEL_ID,
    schema: LlmApproachesResponseSchema,
    system: APPROACH_SYSTEM_PROMPT,
    prompt: buildApproachUserPrompt(userInput),
  });
};

// 진입점: SearchApproach[] 추출
// callApproachLlm은 이미 zod 검증된 값을 반환하므로 여기서 재검증하지 않는다.
export const extractApproachesFromLlm = async (
  userInput: UserInput,
): Promise<SearchApproach[]> => {
  const { approaches } = await callApproachLlm(userInput);

  return approaches.map((approach) => ({
    name: approach.name,
    weight: approach.weight,
  }));
};
