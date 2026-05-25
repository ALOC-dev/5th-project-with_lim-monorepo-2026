import {
  generateRecommendationObject,
  RECOMMENDATION_LLM_MODEL_ID,
} from "../../../llm/ai-sdk.js";
import type { CandidateScoringEvidence } from "../utils/evidence.js";
import {
  LlmCandidateEvaluationsResponseSchema,
  type LlmCandidateEvaluation,
  type LlmCandidateEvaluationsResponse,
} from "./scoring.contracts.js";
import type { LlmScoringClient } from "./scoring.types.js";

export {
  LlmCandidateEvaluationSchema,
} from "./scoring.contracts.js";
export type { LlmCandidateEvaluation } from "./scoring.contracts.js";
export type {
  LlmScoringClient,
  LlmScoringRequest,
} from "./scoring.types.js";

const SCORING_MODEL_ID = RECOMMENDATION_LLM_MODEL_ID;
const LIVE_SCORING_MAX_CONCURRENCY = 4;

const SCORING_SYSTEM_PROMPT = `너는 지역 추천 엔진의 후보 평가기다.
주어진 후보 evidence를 보고 각 후보별 점수를 0~100 정수/실수로 평가한다.

평가 기준:
- inputMatch: 사용자 자연어 요청, 인원, 예산, 모임 유형과의 일치도
- trust: 평점, 리뷰 수, 근거 URL, 외부 언급 등 신뢰 신호
- accessibility: 거리, 이동 편의성, 영업 시간 적합성
- diversity: 후보 목록 안에서 중복 카테고리/경험을 피하는 다양성

규칙:
- 입력된 모든 candidateId에 대해 정확히 하나의 evaluation을 반환한다.
- candidateId는 입력값을 그대로 사용한다.
- matchedSignals는 긍정 근거 1~4개, negativeSignals는 부정 근거 0~3개로 만든다.
- evidenceRefs에는 입력 evidence의 URL만 넣고, 없으면 빈 배열을 넣는다.
- rationaleFacts는 후보 판단에 쓴 사실 2~5개를 한국어로 짧게 작성한다.
- rationaleFacts에는 사용자가 바로 읽을 수 있는 주력 메뉴/공간/이용 맥락을 최소 1개 포함한다.
- matchedSignals.label은 UI의 추천 근거로 그대로 노출될 수 있게 90자 이내의 자연스러운 한국어 문장으로 쓴다.
- semanticFit.status가 PENALIZE면 해당 negativeSignals를 반드시 반영하고 inputMatch를 낮춘다.
- 출력은 반드시 JSON schema만 따른다. 마크다운이나 설명 문장은 붙이지 않는다.`;

const buildScoringUserPrompt = (
  evidences: CandidateScoringEvidence[],
): string =>
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

export const scoreCandidatesWithLlm: LlmScoringClient = async ({
  evidences,
  openAiApiKey,
}) => {
  if (evidences.length <= 1) {
    return openAiLlmScoringClient({ evidences, openAiApiKey });
  }

  const evaluations = await mapWithConcurrency(
    evidences,
    LIVE_SCORING_MAX_CONCURRENCY,
    async (evidence) =>
      openAiLlmScoringClient({ evidences: [evidence], openAiApiKey }),
  );
  return evaluations.flat();
};

const validateEvaluationCoverage = (
  response: LlmCandidateEvaluationsResponse,
  evidences: CandidateScoringEvidence[],
): LlmCandidateEvaluation[] => {
  const expectedCandidateIds = new Set(
    evidences.map((evidence) => evidence.candidateId),
  );
  const seenCandidateIds = new Set<string>();

  for (const evaluation of response.evaluations) {
    if (!expectedCandidateIds.has(evaluation.candidateId)) {
      throw new Error(`unexpected candidateId: ${evaluation.candidateId}`);
    }
    if (seenCandidateIds.has(evaluation.candidateId)) {
      throw new Error(`duplicate candidateId: ${evaluation.candidateId}`);
    }
    seenCandidateIds.add(evaluation.candidateId);
  }

  const missingCandidateIds = [...expectedCandidateIds].filter(
    (candidateId) => !seenCandidateIds.has(candidateId),
  );
  if (missingCandidateIds.length > 0) {
    throw new Error(
      `missing candidate evaluations: ${missingCandidateIds.join(", ")}`,
    );
  }

  return response.evaluations;
};

const mapWithConcurrency = async <TItem, TResult>(
  items: TItem[],
  concurrency: number,
  mapper: (item: TItem, index: number) => Promise<TResult>,
): Promise<TResult[]> => {
  const results = new Array<TResult>(items.length);
  let nextIndex = 0;
  const workerCount = normalizeConcurrency(concurrency, items.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        const item = items[index];
        if (item === undefined) continue;
        results[index] = await mapper(item, index);
      }
    }),
  );

  return results;
};

const normalizeConcurrency = (
  requestedConcurrency: number,
  itemCount: number,
): number => {
  if (itemCount <= 0) return 1;
  if (!Number.isFinite(requestedConcurrency)) return 1;
  return Math.max(1, Math.min(itemCount, Math.floor(requestedConcurrency)));
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
