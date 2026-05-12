/**
 * Groq(Llama)를 이용한 카카오 검색 키워드 추출
 *
 * 유저 자연어 요청 → 카카오 로컬 API에서 쓸 수 있는 짧은 검색어 2~3개
 * Groq 무료 티어 사용 (https://console.groq.com)
 */

import Groq from "groq-sdk";
import type { UserInput } from "@monorepo/common";

const PARTY_TYPE_KO: Record<UserInput["partyType"], string> = {
  FAMILY: "가족",
  FRIENDS: "친구",
  LOVERS: "연인",
  COLLEAGUES: "직장동료",
};

/**
 * 유저 입력을 받아 카카오 검색용 키워드 배열 반환
 * 예) "대화하기 좋은 저녁 식사" → ["분위기 좋은 레스토랑", "이탈리안", "파스타 맛집"]
 */
export const extractSearchKeywords = async (
  userInput: UserInput,
): Promise<string[]> => {
  const apiKey = process.env["GROQ_API_KEY"];
  if (!apiKey) throw new Error("GROQ_API_KEY 환경변수가 없음");

  const client = new Groq({ apiKey });

  const hour = parseInt(userInput.schedule.time24h.split(":")[0] ?? "19", 10);
  const isLunch = hour >= 10 && hour < 15;   // 10:00~14:59 = 점심
  const isDinner = hour >= 17 || hour < 4;   // 17:00~ 또는 새벽 = 저녁/야간

  const timeContext = isLunch
    ? "점심 시간대(낮)"
    : isDinner
      ? "저녁/야간 시간대"
      : "오후 시간대";

  // 유저가 명시적으로 술집 계열을 요청한 경우 점심 금지 규칙 적용 안 함
  const userWantsBar = /이자카야|술집|주점|포장마차|호프|맥주|와인바/.test(
    userInput.userNaturalLanguageRequest,
  );
  const barRule =
    isLunch && !userWantsBar
      ? "\n   금지(점심이라 영업 안 함): 이자카야, 술집, 주점, 바, 포장마차 같은 주류 중심 업종"
      : "";

  const prompt = `유저가 장소를 추천받고 싶어합니다.

- 요청: "${userInput.userNaturalLanguageRequest}"
- 방문 시간: ${userInput.schedule.time24h} (${timeContext})
- 동행: ${PARTY_TYPE_KO[userInput.partyType]} ${userInput.numberOfPeople}명
- 예산: 인당 ${userInput.budgetPerPerson[0].toLocaleString()}~${userInput.budgetPerPerson[1].toLocaleString()}원

유저가 방문할 장소 카테고리 키워드를 1~3개 추출해주세요.

규칙:
1. 키워드는 카카오맵에서 검색 가능한 실제 장소 업종이어야 합니다.
   식당 예시: "한정식", "이탈리안 레스토랑", "스테이크하우스", "국밥"
   카페 예시: "카페", "디저트카페", "베이커리카페"
   술집 예시: "이자카야", "호프집", "포장마차", "와인바", "칵테일바"
   놀거리 예시: "방탈출카페", "볼링장", "노래방", "보드게임카페"${barRule}
2. 유저가 특정 장소 종류("한식", "카페", "방탈출" 등)를 명시한 경우, 모든 키워드는 반드시 그 범위 안에서만 선택하세요. 개수를 채우려고 관계없는 업종을 추가하지 마세요.
3. 동행자(친구, 가족 등) 단어 금지
4. 분위기/상황 형용사(조용한, 시끌벅적한, 맛있는 등) 금지 - 업종명만 반환
5. 실제 카카오맵에서 검색되는 실제 업종명이어야 합니다. 존재하지 않는 업종명 금지.
6. 1~3개 범위에서 요청에 맞는 개수만 반환하세요.

JSON 배열 형식으로만 응답하세요.
예시(식사 미지정): ["이탈리안 레스토랑", "스테이크하우스", "한정식"]
예시(한식 지정): ["한정식", "국밥", "갈비탕"]
예시(카페): ["카페", "디저트카페"]
예시(놀거리): ["방탈출카페", "볼링장"]`;

  const completion = await client.chat.completions.create({
    model: "llama-3.3-70b-versatile", // 8b → 70b: 키워드 품질 향상, 속도 다소 느림
    max_tokens: 256,
    messages: [
      {
        role: "system",
        content: "You are a keyword extractor. Respond with a valid JSON array only. No explanations, no preamble, no markdown. Only the raw JSON array.",
      },
      { role: "user", content: prompt },
    ],
  });

  const text = completion.choices[0]?.message?.content?.trim() ?? "";
  if (!text) throw new Error("Groq 응답이 비어있음");

  // 혹시 ```json ... ``` 형태로 감쌀 경우 제거
  const jsonText = text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");

  const parsed = JSON.parse(jsonText) as unknown;
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error(`Groq 응답 파싱 실패: ${text}`);
  }

  const keywords = parsed
    .filter((k): k is string => typeof k === "string" && k.trim().length > 0)
    .slice(0, 3); // 모델이 규칙을 어기고 3개 초과 반환할 경우 잘라냄
  if (keywords.length === 0) {
    throw new Error(`Groq 응답에서 유효한 키워드 없음 (원본: ${text})`);
  }
  console.log(`[Groq 키워드 추출] "${userInput.userNaturalLanguageRequest}" → ${JSON.stringify(keywords)}`);

  return keywords;
};
