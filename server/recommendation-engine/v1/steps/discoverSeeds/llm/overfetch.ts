import { z } from "zod";

import type { UserInput } from "../../../interfaces/input.js";
import {
  generateRecommendationObject,
  RECOMMENDATION_LLM_MODEL_ID,
} from "../../../llm/ai-sdk.js";

// discoverSeeds의 "overfetch 배수" LLM 호출 사이트.
// utils/ 내부에서는 LLM을 절대 부르지 않는다 — 호출은 이 파일에 한정한다.
// 외부(discoverSeeds/index.ts 오케스트레이터)가 computeOverfetchMultiplierFromLlm을 부르고
// 결과 number를 utils의 순수 함수에 인자로 넘긴다.
//
// 현재 와이어링: Vercel AI SDK(`generateObject`) + 공통 OpenAI nano 모델.

// ---------------------------------------------------------------------------
// multiplier 상/하한
// ---------------------------------------------------------------------------
// 1.0 = overfetch 없음 (목표 seed 수만큼만)
// 3.0 = 매우 복잡한 요청. 그 이상은 provider 비용 대비 한계 효용이 급감.
const MIN_MULTIPLIER = 1.0;
const MAX_MULTIPLIER = 3.0;

// ---------------------------------------------------------------------------
// 샘플 프롬프트 (확정 시 그대로 운영 사용)
// ---------------------------------------------------------------------------
// 응답은 반드시 아래 JSON만:
// {
//   "multiplier": 1.75
// }

export const OVERFETCH_SYSTEM_PROMPT = `너는 지역 추천 엔진의 "검색 오버페치 비율 산정기"다.
사용자 요청을 분석해, discoverSeeds가 provider에 얼마나 많은 seed를 추가 확보해야 하는지
multiplier(=오버페치 배수)를 결정한다.

배경:
- multiplier가 1.0이면 목표 seed 수만큼만 가져온다.
- 사용자 요청이 복잡하거나 특수할수록 evaluateSeeds 평가 단계에서 탈락하는 비율이 높다.
- 따라서 까다로운 요청일수록 더 큰 multiplier를 줘서 후보를 미리 넉넉히 확보해야 한다.

판단 기준 (대략적 가중치 순):
1. 자연어 요청의 모호성 / 특수성
   - 예시(낮음): "강남역 점심", "근처 카페"
   - 예시(높음): "비건 옵션 있고 노트북 작업 가능한 조용한 카페", "비 와도 분위기 있게 데이트할 만한 곳"
2. 예산/체류시간/위치 제약의 좁음 정도
   - 예산 범위가 좁거나, 체류 시간이 길거나 짧을수록 후보가 더 탈락한다.
3. 인원 수 + partyType 조합의 까다로움
   - LOVERS / FAMILY / COLLEAGUES / FRIENDS 별로 선호 가게의 종류와 분위기 폭이 다르다.
4. 사용자가 지정한 위치 후보의 다양성
   - 여러 위치를 줬다면 검색면이 분산되므로 multiplier를 약간 올린다.

규칙:
- multiplier는 ${MIN_MULTIPLIER} ~ ${MAX_MULTIPLIER} 사이의 실수(소수 2자리 권장)다.
- 출력은 반드시 다음 JSON 스키마만 사용한다. 어떤 설명/주석/마크다운도 붙이지 않는다.

{
  "multiplier": number
}`;

export const buildOverfetchUserPrompt = (userInput: UserInput): string =>
  [
    "다음 사용자 입력을 보고 오버페치 multiplier를 산정해줘.",
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

export const LlmOverfetchResponseSchema = z
  .object({
    multiplier: z.number().min(MIN_MULTIPLIER).max(MAX_MULTIPLIER),
  })
  .strict();

export type LlmOverfetchResponse = z.infer<typeof LlmOverfetchResponseSchema>;

// ---------------------------------------------------------------------------
// LLM 호출
// ---------------------------------------------------------------------------
// Vercel AI SDK가 LlmOverfetchResponseSchema로 응답을 검증해주므로
// 반환된 object는 이미 검증된 LlmOverfetchResponse다(메모리 규칙).
// 모든 오류는 공통 AI SDK 래퍼에서 task prefix로 감싸 분류할 수 있게 한다.
const OVERFETCH_MODEL_ID = RECOMMENDATION_LLM_MODEL_ID;

const callOverfetchLlm = async (
  userInput: UserInput,
): Promise<LlmOverfetchResponse> => {
  return generateRecommendationObject({
    task: "discover.overfetch",
    modelId: OVERFETCH_MODEL_ID,
    schema: LlmOverfetchResponseSchema,
    system: OVERFETCH_SYSTEM_PROMPT,
    prompt: buildOverfetchUserPrompt(userInput),
  });
};

// ---------------------------------------------------------------------------
// 진입점: overfetchMultiplier(number) 반환
// ---------------------------------------------------------------------------
// callOverfetchLlm은 이미 zod 검증된 값을 반환하므로 여기서 재검증하지 않는다 (메모리 규칙).
export const computeOverfetchMultiplierFromLlm = async (
  userInput: UserInput,
): Promise<number> => {
  const { multiplier } = await callOverfetchLlm(userInput);
  return multiplier;
};
