import { generateRecommendationObject, RECOMMENDATION_LLM_MODEL_ID } from "../../../llm/ai-sdk.js";
import { mapWithConcurrency } from "../../../utils/concurrency.js";
import type { CandidateScoringEvidence } from "../utils/evidence.js";
import {
  type LlmCandidateEvaluation,
  type LlmCandidateEvaluationsResponse,
  LlmCandidateEvaluationsResponseSchema,
} from "./scoring.contracts.js";
import type { LlmScoringClient } from "./scoring.types.js";

export type { LlmCandidateEvaluation } from "./scoring.contracts.js";
export { LlmCandidateEvaluationSchema } from "./scoring.contracts.js";
export type { LlmScoringClient, LlmScoringRequest } from "./scoring.types.js";

const SCORING_MODEL_ID = RECOMMENDATION_LLM_MODEL_ID;
const LIVE_SCORING_MAX_CONCURRENCY = 4;
/** 한 번의 LLM 호출에 함께 넘길 후보 수. diversity 판단과 호출 수 절감을 함께 노린다. */
const SCORING_CHUNK_SIZE = 8;

const SCORING_SYSTEM_PROMPT = `너는 지역 추천 엔진의 후보 평가기다.
주어진 후보 evidence를 보고 각 후보별 점수를 0~100 정수/실수로 평가한다.
사용자의 자연어 요청에서 특정 평가 기준이 명시적으로 중요해 보이면 해당 기준을 더 엄격하게 평가한다.
중요 기준에 잘 맞는 후보는 그 기준의 점수를 높게, 명백히 어긋나는 후보는 낮게 준다.
단, 각 점수는 해당 기준의 정의에 맞게 산정하며 서로 다른 기준에 중복 반영하지 않는다.

평가 기준:
- inputMatch: 사용자 자연어 요청, 인원, 예산, 모임 유형과의 일치도
- trust: 평점, 리뷰 수, 근거 URL, 외부 언급 등 신뢰 신호
- accessibility: 거리, 이동 편의성, 영업 시간 적합성
- diversity: 이 후보만의 차별점이 얼마나 뚜렷한가. 특색 있는 대표 메뉴, 공간이나 컨셉,
  그 동네에서 이 집만의 이유가 분명하면 높다. 어디에나 있는 흔한 구성이면 낮다.
  **다른 후보와 비교하지 말고 후보 자체의 개성으로만** 평가한다.

규칙:
- 입력된 모든 candidateId에 대해 정확히 하나의 evaluation을 반환한다.
- candidateId는 입력값을 그대로 사용한다.
- matchedSignals는 긍정 근거 1~4개, negativeSignals는 부정 근거 0~3개로 만든다.
- evidenceRefs에는 입력 evidence의 URL만 넣고, 없으면 빈 배열을 넣는다.
- rationaleFacts는 후보 판단에 쓴 사실 2~5개를 한국어로 짧게 작성한다.
- rationaleFacts에는 사용자가 바로 읽을 수 있는 주력 메뉴/공간/이용 맥락을 최소 1개 포함한다.
- matchedSignals.label은 UI의 추천 근거로 그대로 노출될 수 있게 90자 이내의 자연스러운 한국어 문장으로 쓴다.
- semanticFit.status가 PENALIZE면 해당 negativeSignals를 반드시 반영하고 inputMatch를 낮춘다.
- 요청에 식이 제약(비건·채식·할랄·글루텐프리·알러지 등)이 있으면 가장 엄격하게 본다.
  지도 업종 분류는 "아시아음식", "양식"처럼 재료를 알려주지 않으므로, 상호와 스크랩
  원문에서 주력 메뉴를 읽어 판단한다. 케밥·바베큐·스테이크·정육처럼 육류가 주력인
  곳이 분명하면 inputMatch를 크게 낮추고 negativeSignals에 이유를 남긴다.
  해당 제약을 충족한다는 근거(비건 메뉴, 채식 옵션 등)가 있으면 높인다.
- userFit.numberOfPeople가 5명 이상이면, 함께 앉기 어려워 보이는 후보(카운터석 위주,
  포장·배달 전문, 1인석 중심, 좌석이 매우 적어 보이는 소형 매장)의 inputMatch를 낮춘다.
  단체석·룸·홀이 확인되면 높인다. 좌석을 알 수 없으면 이 항목으로 감점하지 않는다.
- userFit.partyType을 inputMatch에 반영한다.
  LOVERS: 마주 앉아 대화하기 좋은 조용하고 아늑한 곳을 높인다.
  FAMILY: 남녀노소가 함께 가기 무난하고 좌석이 넉넉한 곳을 높인다.
  COLLEAGUES: 여럿이 나눠 먹기 좋은 곳을 높인다.
  FRIENDS: 별도 제약을 두지 않는다.
  근거가 없으면 추측으로 깎지 않는다.
- placeInfo.priceRangePerPerson이 없으면 가격을 확인하지 못한 것이다. 예산에 맞는다고도
  안 맞는다고도 단정하지 말고, rationaleFacts에 가격을 지어내 적지 않는다.
- 출력은 반드시 JSON schema만 따른다. 마크다운이나 설명 문장은 붙이지 않는다.`;

const buildScoringUserPrompt = (evidences: CandidateScoringEvidence[]): string =>
  [
    "다음 후보들을 평가해줘.",
    "```json",
    JSON.stringify({ evidences: evidences.map(toLlmEvidencePayload) }, null, 2),
    "```",
  ].join("\n");

export const createOpenAiLlmScoringClient =
  (modelId = SCORING_MODEL_ID): LlmScoringClient =>
  async ({ evidences, openAiApiKey }) => {
    const object = await generateRecommendationObject({
      task: "evaluate.scoring",
      modelId,
      openAiApiKey,
      schema: LlmCandidateEvaluationsResponseSchema,
      system: SCORING_SYSTEM_PROMPT,
      prompt: buildScoringUserPrompt(evidences),
    });
    return validateEvaluationCoverage(object, evidences);
  };

const openAiLlmScoringClient = createOpenAiLlmScoringClient();

/**
 * 후보를 청크로 묶어 평가한다.
 *
 * 후보를 1개씩 따로 넘기면 프롬프트가 요구하는 `diversity`("후보 목록 안에서 중복
 * 카테고리를 피하는 정도")를 LLM이 원리적으로 판단할 수 없다. 다른 후보를 볼 수
 * 없기 때문이다. 그런데도 diversity는 최종 점수의 1/4을 차지한다. 묶어서 넘기면
 * 실제로 측정 가능해지고 호출 수도 크게 줄어든다.
 *
 * 또 예전에는 후보 하나의 응답이 어긋나면 예외가 그대로 올라가 `evaluateSeeds`
 * 전체 실패가 됐다. 10개 중 9개가 정상이어도 결과가 0개였다. 이제 청크 실패는
 * 후보 단위 재시도로 낮추고, 그래도 안 되면 그 후보만 버린다.
 */
export const createScoringPipeline =
  (client: LlmScoringClient, chunkSize = SCORING_CHUNK_SIZE): LlmScoringClient =>
  async ({ evidences, openAiApiKey }) => {
    if (evidences.length === 0) return [];

    const scoredChunks = await mapWithConcurrency(
      toChunks(evidences, chunkSize),
      LIVE_SCORING_MAX_CONCURRENCY,
      async (chunk) => {
        try {
          return await client({ evidences: chunk, openAiApiKey });
        } catch {
          // 청크가 통째로 실패하면 후보 단위로 낮춰 재시도한다. 한 후보의 이상한
          // 응답 때문에 같은 청크의 나머지까지 잃지 않게 한다.
          const perCandidate = await mapWithConcurrency(
            chunk,
            LIVE_SCORING_MAX_CONCURRENCY,
            async (evidence) => {
              try {
                return await client({ evidences: [evidence], openAiApiKey });
              } catch {
                return [];
              }
            },
          );
          return perCandidate.flat();
        }
      },
    );

    const evaluations = scoredChunks.flat();
    if (evaluations.length === 0) {
      throw new Error("LLM scoring produced no usable evaluation for any candidate");
    }
    return evaluations;
  };

export const scoreCandidatesWithLlm: LlmScoringClient = createScoringPipeline(
  openAiLlmScoringClient,
);

const toChunks = <TItem>(items: TItem[], size: number): TItem[][] => {
  const chunks: TItem[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

/**
 * 응답에서 쓸 수 있는 평가만 남긴다.
 *
 * 예상 밖 candidateId와 중복은 조용히 버리고, 누락된 후보는 랭킹 단계에서 자연스럽게
 * 제외되므로 예외를 던지지 않는다. 하나도 못 건졌을 때만 호출자가 재시도할 수 있게
 * 예외를 던진다.
 */
const validateEvaluationCoverage = (
  response: LlmCandidateEvaluationsResponse,
  evidences: CandidateScoringEvidence[],
): LlmCandidateEvaluation[] => {
  const expectedCandidateIds = new Set(evidences.map((evidence) => evidence.candidateId));
  const seenCandidateIds = new Set<string>();
  const usable: LlmCandidateEvaluation[] = [];

  for (const evaluation of response.evaluations) {
    if (!expectedCandidateIds.has(evaluation.candidateId)) continue;
    if (seenCandidateIds.has(evaluation.candidateId)) continue;
    seenCandidateIds.add(evaluation.candidateId);
    usable.push(evaluation);
  }

  if (usable.length === 0) {
    throw new Error(
      `LLM returned no evaluation matching the requested candidates (requested ${evidences.length})`,
    );
  }

  return usable;
};



const toLlmEvidencePayload = (evidence: CandidateScoringEvidence) => ({
  candidateId: evidence.candidateId,
  name: evidence.name,
  category: evidence.category,
  userFit: evidence.userFit,
  placeInfo: {
    address: evidence.placeInfo.address,
    roadAddress: evidence.placeInfo.roadAddress,
    priceRangePerPerson: evidence.placeInfo.priceRangePerPerson,
    placeUrl: evidence.placeInfo.placeUrl,
  },
  trustSignals: evidence.trustSignals,
  accessibilitySignals: evidence.accessibilitySignals,
  operationVerification: evidence.enrichment?.operationVerification,
  semanticFit: evidence.semanticFit,
});
