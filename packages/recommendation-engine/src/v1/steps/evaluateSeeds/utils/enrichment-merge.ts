import type { CandidateEnrichment, EnrichmentSourceName } from "./enrichment-types.js";
import type { CandidateScoringEvidence } from "./evidence.js";
import { type OperationVerifier } from "./operation-hours.js";

export const mergeEvidenceWithEnrichment = (
  evidence: CandidateScoringEvidence,
  enrichment: CandidateEnrichment,
): CandidateScoringEvidence => ({
  ...evidence,
  // enrichment가 실제 메뉴/가격 근거를 찾은 경우 seed보다 우선한다.
  // 없으면 userInput echo가 아니라 category fallback이 output 단계에서 적용된다.
  placeInfo: {
    ...evidence.placeInfo,
    priceRangePerPerson: enrichment.priceRangePerPerson ?? evidence.placeInfo.priceRangePerPerson,
  },
  // source URL은 중복 제거해서 LLM scoring과 최종 referenceUrl 생성에 함께 쓴다.
  trustSignals: {
    ...evidence.trustSignals,
    ...enrichment.trustSignals,
    evidenceUrls: Array.from(
      new Set([...evidence.trustSignals.evidenceUrls, ...enrichment.sourceUrls]),
    ),
  },
  // OPEN 검증을 통과한 후보만 여기까지 오므로 openTimeBufferMinutes는 가벼운 접근성 신호로만 둔다.
  accessibilitySignals: {
    ...evidence.accessibilitySignals,
    openTimeBufferMinutes: enrichment.operationVerification.status === "OPEN" ? 0 : undefined,
  },
  enrichment,
});

// UNKNOWN을 OPEN으로 승격하지 않는다. 실제 operationInfo가 있어야 scoring 대상이 된다.
export const shouldRecommendByOperationHours = (enrichment: CandidateEnrichment): boolean =>
  enrichment.operationVerification.status === "OPEN" && enrichment.operationInfo !== undefined;

export const unique = (values: string[]): string[] => Array.from(new Set(values.filter(Boolean)));

export const buildUnknownEnrichment = (
  candidateId: string,
  operationVerifier: OperationVerifier,
  reason: string,
  source: EnrichmentSourceName = "none",
): CandidateEnrichment => ({
  candidateId,
  source,
  sourceUrls: [],
  operationVerification: operationVerifier.unknown({ reason }),
  sourceDetails:
    source === "none"
      ? undefined
      : [
          {
            source,
            status: "UNKNOWN",
            reason,
            sourceUrls: [],
            confidence: 0,
          },
        ],
});
