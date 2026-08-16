import type { ScoringWeights } from "../../../configs/types.js";
import { type ScoreBreakdown, ScoreBreakdownSchema } from "../contracts.js";
import type { LlmCandidateEvaluation } from "../llm/scoring.contracts.js";
import type { CandidateScoringEvidence } from "./evidence.js";
import { getSemanticScoreAdjustment } from "./semantic-fit.js";

/** 영업시간 미확인 후보에 적용하는 감점. 확인된 후보가 항상 우선되게 한다. */
const UNVERIFIED_OPERATION_PENALTY = 20;

/**
 * 예산을 확실히 넘는 후보에 적용하는 감점.
 *
 * 예산은 사용자가 직접 넣은 조건인데, 지금까지는 LLM의 `inputMatch` 안에서만
 * 느슨하게 반영됐다. 실제 가격 근거를 찾은 후보에 한해서만 적용한다 — 가격을
 * 못 찾아 업종 추정치를 넣은 후보까지 이 잣대로 재면, 근거 없는 값으로
 * 멀쩡한 가게를 떨어뜨리게 된다.
 */
const OVER_BUDGET_PENALTY = 15;

export type RankedCandidate = {
  evidence: CandidateScoringEvidence;
  llm: LlmCandidateEvaluation;
  scores: ScoreBreakdown;
};

export const buildRankedCandidates = (
  evidences: CandidateScoringEvidence[],
  llmEvaluations: LlmCandidateEvaluation[],
  weights: ScoringWeights,
): RankedCandidate[] => {
  const evaluationByCandidateId = new Map(
    llmEvaluations.map((evaluation) => [evaluation.candidateId, evaluation]),
  );

  return evidences
    .map((evidence) => {
      const llm = evaluationByCandidateId.get(evidence.candidateId);
      if (!llm) return undefined;

      return {
        evidence,
        llm,
        scores: computeWeightedScore(llm, weights, evidence),
      };
    })
    .filter((candidate): candidate is RankedCandidate => candidate !== undefined)
    .sort(compareByScore);
};

const computeWeightedScore = (
  evaluation: LlmCandidateEvaluation,
  weights: ScoringWeights,
  evidence: CandidateScoringEvidence,
): ScoreBreakdown => {
  const totalWeight =
    weights.inputMatch + weights.trust + weights.accessibility + weights.diversity;

  const total =
    evaluation.inputMatch * (weights.inputMatch / totalWeight) +
    evaluation.trust * (weights.trust / totalWeight) +
    evaluation.accessibility * (weights.accessibility / totalWeight) +
    evaluation.diversity * (weights.diversity / totalWeight);

  const semanticAdjustment = getSemanticAdjustment(evidence);
  // 영업시간이 확인된 후보가 확인 안 된 후보보다 항상 위에 오도록 감점한다.
  // 미확인 후보는 목표 개수를 못 채울 때의 예비이지 동등한 후보가 아니다.
  const unverifiedPenalty = evidence.operationUnverified ? UNVERIFIED_OPERATION_PENALTY : 0;
  const overBudgetPenalty = isClearlyOverBudget(evidence) ? OVER_BUDGET_PENALTY : 0;
  const adjustedTotal = Math.max(
    0,
    Math.min(
      total - semanticAdjustment.appliedPenalty - unverifiedPenalty - overBudgetPenalty,
      semanticAdjustment.scoreCap ?? 100,
    ),
  );

  return ScoreBreakdownSchema.parse({
    inputMatch: evaluation.inputMatch,
    trust: evaluation.trust,
    accessibility: evaluation.accessibility,
    diversity: evaluation.diversity,
    total: round(adjustedTotal),
  });
};

/**
 * 가장 싼 메뉴조차 예산 상한을 넘는가.
 *
 * 실제 가격 근거가 있을 때만 판단한다. 또 "예산보다 싸다"는 감점 사유가 아니다 —
 * 예산은 상한이지 맞춰야 할 목표가 아니다.
 */
export const isClearlyOverBudget = (evidence: CandidateScoringEvidence): boolean => {
  const priceRange = evidence.placeInfo.priceRangePerPerson;
  if (!priceRange) return false;

  const budgetMax = evidence.userFit.budgetPerPerson?.[1];
  if (budgetMax === undefined) return false;

  return priceRange[0] > budgetMax;
};

const getSemanticAdjustment = (
  evidence: CandidateScoringEvidence,
): ReturnType<typeof getSemanticScoreAdjustment> => {
  if (!evidence.semanticFit) {
    throw new Error(`Missing semanticFit for ranked candidate ${evidence.candidateId}`);
  }
  return getSemanticScoreAdjustment(evidence.semanticFit);
};

const compareByScore = (a: { scores: ScoreBreakdown }, b: { scores: ScoreBreakdown }): number => {
  if (a.scores.total !== b.scores.total) return b.scores.total - a.scores.total;
  if (a.scores.inputMatch !== b.scores.inputMatch) return b.scores.inputMatch - a.scores.inputMatch;
  if (a.scores.trust !== b.scores.trust) return b.scores.trust - a.scores.trust;
  if (a.scores.accessibility !== b.scores.accessibility)
    return b.scores.accessibility - a.scores.accessibility;
  return 0;
};

const round = (value: number, digits = 2): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};
