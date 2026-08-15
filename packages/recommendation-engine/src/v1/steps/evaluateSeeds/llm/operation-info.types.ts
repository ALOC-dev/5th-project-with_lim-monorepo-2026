import type { OperationInfo } from "../../../interfaces/output.contracts.js";
import type { Logger } from "../../../observability/logger.js";
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
  sourceTextKind: "snippet" | "scraped_page" | "bounded_fetch";
  /** Cascade probe에서는 결정론 파서만 실행하고 targeted LLM은 별도 단계에서 직렬화한다. */
  allowLlmFallback?: boolean;
  /** Enrichment cascade의 tail을 제한하기 위한 operation-hours 전용 retry budget. */
  maxRetries?: number;
  logger?: Logger;
};
