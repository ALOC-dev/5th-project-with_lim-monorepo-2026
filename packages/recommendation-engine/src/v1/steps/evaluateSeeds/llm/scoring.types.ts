import type { CandidateScoringEvidence } from "../utils/evidence.js";
import type { LlmCandidateEvaluation } from "./scoring.contracts.js";

export type LlmScoringRequest = {
  evidences: CandidateScoringEvidence[];
  openAiApiKey?: string;
};

export type LlmScoringClient = (request: LlmScoringRequest) => Promise<LlmCandidateEvaluation[]>;
