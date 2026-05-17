import { z } from "zod";

import {
  generateRecommendationObject,
  RECOMMENDATION_LLM_MODEL_ID,
} from "../../../llm/ai-sdk.js";
import type { CandidateScoringEvidence } from "../utils/evidence.js";

export const LlmCandidateEvaluationSchema = z
  .object({
    candidateId: z.string().min(1),
    inputMatch: z.number().min(0).max(100),
    trust: z.number().min(0).max(100),
    accessibility: z.number().min(0).max(100),
    diversity: z.number().min(0).max(100),
    matchedSignals: z.array(
      z.object({
        label: z.string().min(1),
        evidenceRefs: z.array(z.string()),
        confidence: z.number().min(0).max(1),
      }),
    ),
    negativeSignals: z.array(
      z.object({
        label: z.string().min(1),
        evidenceRefs: z.array(z.string()),
        severity: z.enum(["LOW", "MEDIUM", "HIGH"]),
      }),
    ),
    rationaleFacts: z.array(z.string().min(1)),
  })
  .strict();

export type LlmCandidateEvaluation = z.infer<
  typeof LlmCandidateEvaluationSchema
>;

export type LlmScoringRequest = {
  evidences: CandidateScoringEvidence[];
};

export type LlmScoringClient = (
  request: LlmScoringRequest,
) => Promise<LlmCandidateEvaluation[]>;

const LlmCandidateEvaluationsResponseSchema = z
  .object({
    evaluations: z.array(LlmCandidateEvaluationSchema),
  })
  .strict();

type LlmCandidateEvaluationsResponse = z.infer<
  typeof LlmCandidateEvaluationsResponseSchema
>;

const SCORING_MODEL_ID = RECOMMENDATION_LLM_MODEL_ID;
const LIVE_SCORING_MAX_CONCURRENCY = 4;

export const SCORING_SYSTEM_PROMPT = `너는 지역 추천 엔진의 후보 평가기다.
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
- semanticFit.status가 PENALIZE면 해당 negativeSignals를 반드시 반영하고 inputMatch를 낮춘다.
- 출력은 반드시 JSON schema만 따른다. 마크다운이나 설명 문장은 붙이지 않는다.`;

export const buildScoringUserPrompt = (
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
  async ({ evidences }) => {
    const object = await generateRecommendationObject({
      task: "evaluate.scoring",
      modelId,
      schema: LlmCandidateEvaluationsResponseSchema,
      system: SCORING_SYSTEM_PROMPT,
      prompt: buildScoringUserPrompt(evidences),
    });
    return validateEvaluationCoverage(object, evidences);
  };

const openAiLlmScoringClient = createOpenAiLlmScoringClient();

export const scoreCandidatesWithLlm: LlmScoringClient = async (request) => {
  return scoreCandidatesWithOpenAiInParallel(request);
};

const scoreCandidatesWithOpenAiInParallel: LlmScoringClient = async ({
  evidences,
}) => {
  if (evidences.length <= 1) return openAiLlmScoringClient({ evidences });

  // 후보별 scoring은 서로 의존하지 않는다.
  // 작은 batch를 병렬로 돌려 live test 지연을 줄이고, coverage 검증은 candidateId로 다시 수행한다.
  const evaluations = await mapWithConcurrency(
    evidences,
    LIVE_SCORING_MAX_CONCURRENCY,
    async (evidence) => openAiLlmScoringClient({ evidences: [evidence] }),
  );
  return evaluations.flat();
};

const validateEvaluationCoverage = (
  response: LlmCandidateEvaluationsResponse,
  evidences: CandidateScoringEvidence[],
): LlmCandidateEvaluation[] => {
  // generateObject가 schema를 맞춰도 candidate 누락/중복은 별도로 검증해야 한다.
  // 누락 후보를 조용히 ranking에서 떨어뜨리면 품질 이슈 추적이 어려워진다.
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
  // LLM에는 user-facing scoring에 필요한 축만 넘긴다.
  // 전체 raw enrichment는 로그에 남기고, prompt에는 검증 결과와 source URL 중심으로 축약한다.
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
