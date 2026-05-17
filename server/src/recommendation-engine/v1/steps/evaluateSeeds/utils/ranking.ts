import type { ScoringWeights } from "../../../configs/types.js";
import type { LlmCandidateEvaluation } from "../llm/scoring.js";
import { ScoreBreakdownSchema, type ScoreBreakdown } from "../types.js";
import type { CandidateScoringEvidence } from "./evidence.js";
import { getSemanticScoreAdjustment } from "./semantic-fit.js";

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
  // LLM 응답은 순서나 개수가 흔들릴 수 있으므로 candidateId로 evidence에 다시 붙인다.
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
    .filter(
      (candidate): candidate is RankedCandidate => candidate !== undefined,
    )
    .sort(compareByScore);
};

const computeWeightedScore = (
  evaluation: LlmCandidateEvaluation,
  weights: ScoringWeights,
  evidence: CandidateScoringEvidence,
): ScoreBreakdown => {
  // EngineConfig의 weight 비율만 사용한다. weight 총합이 100일 필요는 없다.
  const totalWeight =
    weights.inputMatch +
    weights.trust +
    weights.accessibility +
    weights.diversity;
  const normalize = (value: number) =>
    totalWeight === 0 ? 0 : value / totalWeight;

  const total =
    evaluation.inputMatch * normalize(weights.inputMatch) +
    evaluation.trust * normalize(weights.trust) +
    evaluation.accessibility * normalize(weights.accessibility) +
    evaluation.diversity * normalize(weights.diversity);

  const semanticAdjustment = getSemanticAdjustment(evidence);
  const adjustedTotal = Math.max(
    0,
    Math.min(
      total - semanticAdjustment.appliedPenalty,
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

const getSemanticAdjustment = (
  evidence: CandidateScoringEvidence,
): ReturnType<typeof getSemanticScoreAdjustment> => {
  if (!evidence.semanticFit) {
    throw new Error(
      `Missing semanticFit for ranked candidate ${evidence.candidateId}`,
    );
  }
  return getSemanticScoreAdjustment(evidence.semanticFit);
};

const compareByScore = (
  a: { scores: ScoreBreakdown },
  b: { scores: ScoreBreakdown },
): number => {
  // 추천 품질의 1차 기준은 total, tie-break는 사용자 적합도와 신뢰도 중심이다.
  if (a.scores.total !== b.scores.total) return b.scores.total - a.scores.total;
  if (a.scores.inputMatch !== b.scores.inputMatch)
    return b.scores.inputMatch - a.scores.inputMatch;
  if (a.scores.trust !== b.scores.trust) return b.scores.trust - a.scores.trust;
  if (a.scores.accessibility !== b.scores.accessibility)
    return b.scores.accessibility - a.scores.accessibility;
  return 0;
};

const round = (value: number, digits = 2): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};
