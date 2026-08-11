import { generateCourseObject } from "../llm/ai-sdk.js";
import {
  type StayEstimateCandidate,
  StayEstimateResponseSchema,
  type StayEstimatorClient,
} from "./contracts.js";

/**
 * 장소별 평균 체류 시간을 LLM으로 보정한다.
 *
 * 이 단계가 코스 엔진의 안전성을 해치지 않는 이유:
 * - 장소당 숫자 하나만 만들고, 타임라인/이동/영업시간은 건드리지 않는다.
 * - 응답은 카테고리 기준 [min, max] 범위로 강제 clamp된다. 범위 밖은 잘린다.
 * - 실패하면 결정론 추정값을 그대로 쓴다.
 * - 장소 단위로 캐싱되므로 같은 장소는 두 번 묻지 않는다.
 *
 * 전체 장소를 한 번의 호출로 처리한다.
 */

const STAY_SYSTEM_PROMPT = `너는 장소별 평균 체류 시간을 추정한다.

규칙:
- 입력된 placeId마다 정확히 하나씩 답한다.
- typicalStayMinutes는 반드시 각 장소의 minMinutes 이상 maxMinutes 이하로 답한다.
- baselineMinutes는 카테고리 평균이다. 특별한 근거가 없으면 그 값에 가깝게 답한다.
- 가격대가 높은 식당이나 코스요리는 더 길게, 회전이 빠른 분식이나 테이크아웃 위주는 짧게 본다.
- 장소 설명에 웨이팅, 코스요리, 오마카세, 예약제 같은 단서가 있으면 반영한다.
- 새 장소를 만들거나 입력에 없는 placeId를 답하지 않는다.
- 출력은 JSON schema만 따른다.`;

/** 장소 단위 캐시. 체류 시간은 장소 속성이라 요청 간 재사용해도 안전하다. */
const typicalMinutesCache = new Map<string, number>();
const STAY_CACHE_LIMIT = 5_000;

const toCacheKey = (candidate: StayEstimateCandidate): string =>
  [
    candidate.name,
    candidate.category,
    candidate.pricePerPersonWon[0],
    candidate.pricePerPersonWon[1],
  ].join("|");

export const clearStayEstimateCache = (): void => typicalMinutesCache.clear();

const writeCache = (key: string, minutes: number): void => {
  if (typicalMinutesCache.size >= STAY_CACHE_LIMIT) {
    const oldest = typicalMinutesCache.keys().next();
    if (!oldest.done) typicalMinutesCache.delete(oldest.value);
  }
  typicalMinutesCache.set(key, minutes);
};

export const createOpenAiStayEstimatorClient = (modelId?: string): StayEstimatorClient =>
  async ({ candidates, openAiApiKey }) => {
    const estimates: { placeId: string; typicalStayMinutes: number }[] = [];
    const uncached: StayEstimateCandidate[] = [];

    for (const candidate of candidates) {
      const cached = typicalMinutesCache.get(toCacheKey(candidate));
      if (cached === undefined) uncached.push(candidate);
      else estimates.push({ placeId: candidate.placeId, typicalStayMinutes: cached });
    }

    if (uncached.length === 0) {
      if (estimates.length === 0) throw new Error("No stay estimate candidates provided");
      return { estimates };
    }

    const response = await generateCourseObject({
      task: "course.stayEstimate",
      modelId,
      openAiApiKey,
      schema: StayEstimateResponseSchema,
      system: STAY_SYSTEM_PROMPT,
      prompt: [
        "다음 장소들의 평균 체류 시간을 추정해줘.",
        "```json",
        JSON.stringify({ places: uncached }, null, 2),
        "```",
      ].join("\n"),
    });

    const candidateById = new Map(uncached.map((candidate) => [candidate.placeId, candidate]));
    for (const estimate of response.estimates) {
      const candidate = candidateById.get(estimate.placeId);
      if (!candidate) continue;
      writeCache(toCacheKey(candidate), estimate.typicalStayMinutes);
      estimates.push(estimate);
    }

    if (estimates.length === 0) {
      throw new Error("Stay estimation returned no usable place estimate");
    }

    return { estimates };
  };
