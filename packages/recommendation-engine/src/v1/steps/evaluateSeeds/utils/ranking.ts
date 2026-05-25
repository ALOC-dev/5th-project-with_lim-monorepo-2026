import type { ScoringWeights } from "../../../configs/types.js";
import { type ScoreBreakdown, ScoreBreakdownSchema } from "../contracts.js";
import type { LlmCandidateEvaluation } from "../llm/scoring.contracts.js";
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
  const adjustedTotal = Math.max(
    0,
    Math.min(total - semanticAdjustment.appliedPenalty, semanticAdjustment.scoreCap ?? 100),
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
