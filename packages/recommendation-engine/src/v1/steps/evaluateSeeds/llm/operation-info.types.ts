import type { OperationInfo } from "../../../interfaces/output.contracts.js";
import type { EnrichmentSourceName } from "../utils/enrichment-types.js";
import type { CandidateScoringEvidence } from "../utils/evidence.js";
import type { OperationVerifier } from "../utils/operation-hours.js";

export type OperationInfoParseResult = {
  operationInfo?: OperationInfo;
  parser: "deterministic" | "llm" | "none";
  reason: string;
};

export type ParseOperationInfoOptions = {
  text: string | undefined;
  openAiApiKey?: string;
  evidence: CandidateScoringEvidence;
  operationVerifier: OperationVerifier;
  sourceName: EnrichmentSourceName;
  sourceTextKind: "snippet" | "scraped_page" | "agentic_fetch";
};
