import type { Logger } from "../../../observability/logger.js";
import type { CandidateScoringEvidence } from "../utils/evidence.js";
import type { LlmCandidateEvaluation } from "./scoring.contracts.js";

export type LlmScoringRequest = {
  evidences: CandidateScoringEvidence[];
  openAiApiKey?: string;
  logger?: Logger;
};

export type LlmScoringClient = (request: LlmScoringRequest) => Promise<LlmCandidateEvaluation[]>;
