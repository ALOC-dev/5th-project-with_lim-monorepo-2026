import type {
  EngineInput,
  EngineOutput,
  PlaceRecommendationItem,
} from "../contracts/index.js";

export type MaybePromise<T> = T | Promise<T>;

export type RecommendationCandidate = Omit<
  PlaceRecommendationItem,
  "score" | "reasons"
> &
  Partial<Pick<PlaceRecommendationItem, "score" | "reasons">> & {
    sourceRank?: number;
    status?: "ACTIVE" | "CLOSED" | "TEMPORARILY_CLOSED";
    signals?: {
      naverRating?: number;
      kakaoRating?: number;
      reviewCount?: number;
      mentionCount?: number;
      inputMatchScore?: number;
      trustScore?: number;
      accessibilityScore?: number;
      diversityScore?: number;
    };
  };

export type ScoringWeights = {
  inputMatch: number;
  trust: number;
  accessibility: number;
  diversity: number;
};

export type RequiredEngineConfig = {
  targetCount: number;
  candidatePoolMultiplier: number;
  maxDistanceKm: number;
  weights: ScoringWeights;
  now: () => Date;
};

export type EngineConfig = {
  targetCount?: number;
  candidatePoolMultiplier?: number;
  maxDistanceKm?: number;
  weights?: ScoringWeights;
  candidates?: RecommendationCandidate[];
  collectCandidates?: (
    input: EngineInput,
    config: RequiredEngineConfig,
  ) => MaybePromise<RecommendationCandidate[]>;
  now?: () => Date;
};

export type EngineProcessResult =
  | { ok: true; data: EngineOutput }
  | { ok: false; step: string; errorCode: string; message: string };

export type EngineProcessFailure = Extract<EngineProcessResult, { ok: false }>;

export type CandidateCollection = {
  candidates: RecommendationCandidate[];
  filteredOut: Array<{ id: string; reason: string }>;
};

export type ScoredCandidate = {
  candidate: RecommendationCandidate;
  score: number;
  reasons: string[];
  scoreBreakdown: ScoringWeights;
};
