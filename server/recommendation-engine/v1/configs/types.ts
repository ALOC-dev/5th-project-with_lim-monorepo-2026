export type EngineConfig = {
  targetCount: number;
  candidatePoolMultiplier: number;
  weights: ScoringWeights;
};

export type ScoringWeights = {
  inputMatch: number;
  trust: number;
  accessibility: number;
  diversity: number;
};
