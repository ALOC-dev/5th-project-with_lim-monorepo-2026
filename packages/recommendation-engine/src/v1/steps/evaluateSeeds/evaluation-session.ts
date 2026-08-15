import type { ReferenceUrlResolution } from "./tools/reference-urls.js";
import type { CandidateEnrichment } from "./utils/enrichment-types.js";
import type { CandidateScoringEvidence } from "./utils/evidence.js";

type CacheEntry<T> = {
  fingerprint: string;
  value: T;
};

type CachedReferenceResolution = Omit<ReferenceUrlResolution, "evidence">;

export type EvaluationCacheLookup<T> =
  | { status: "HIT"; value: T }
  | { status: "MISS"; reason: "EMPTY" | "FINGERPRINT_MISMATCH" };

/**
 * 한 RecommendationEngine.process() 안의 discovery attempt들이 공유하는 캐시다.
 * 외부 정보가 요청 사이에서 오래 살아남지 않도록 엔진 인스턴스에도 보관하지 않는다.
 */
export class RecommendationEvaluationSession {
  private readonly enrichmentCache = new Map<string, CacheEntry<CandidateEnrichment>>();
  private readonly referenceCache = new Map<string, CacheEntry<CachedReferenceResolution>>();

  getEnrichment(
    evidence: CandidateScoringEvidence,
  ): EvaluationCacheLookup<CandidateEnrichment> {
    return lookup(this.enrichmentCache, evidence);
  }

  setEnrichment(evidence: CandidateScoringEvidence, enrichment: CandidateEnrichment): boolean {
    if (!isStableEnrichment(enrichment)) return false;
    this.enrichmentCache.set(evidence.candidateId, {
      fingerprint: getCandidateFingerprint(evidence),
      value: enrichment,
    });
    return true;
  }

  getReference(
    evidence: CandidateScoringEvidence,
  ): EvaluationCacheLookup<ReferenceUrlResolution> {
    const result = lookup(this.referenceCache, evidence);
    if (result.status === "MISS") return result;

    return {
      status: "HIT",
      value: {
        ...result.value,
        evidence: {
          ...evidence,
          referenceUrls: result.value.referenceUrls,
        },
      },
    };
  }

  setReference(evidence: CandidateScoringEvidence, resolution: ReferenceUrlResolution): boolean {
    if (!resolution.referenceUrls) return false;
    const { evidence: _resolvedEvidence, ...cached } = resolution;
    this.referenceCache.set(evidence.candidateId, {
      fingerprint: getCandidateFingerprint(evidence),
      value: cached,
    });
    return true;
  }
}

export const createRecommendationEvaluationSession = (): RecommendationEvaluationSession =>
  new RecommendationEvaluationSession();

export const getCandidateFingerprint = (evidence: CandidateScoringEvidence): string => {
  const seed = evidence.raw.seed;
  return [
    seed.provider,
    seed.providerPlaceId ?? "",
    normalize(evidence.name),
    evidence.placeInfo.lng.toFixed(6),
    evidence.placeInfo.lat.toFixed(6),
  ].join("|");
};

export const isStableEnrichment = (enrichment: CandidateEnrichment): boolean =>
  enrichment.operationInfo !== undefined &&
  enrichment.sourceUrls.length > 0 &&
  (enrichment.operationVerification.status === "OPEN" ||
    enrichment.operationVerification.status === "CLOSED");

const lookup = <T>(
  cache: Map<string, CacheEntry<T>>,
  evidence: CandidateScoringEvidence,
): EvaluationCacheLookup<T> => {
  const entry = cache.get(evidence.candidateId);
  if (!entry) return { status: "MISS", reason: "EMPTY" };
  if (entry.fingerprint !== getCandidateFingerprint(evidence)) {
    return { status: "MISS", reason: "FINGERPRINT_MISMATCH" };
  }
  return { status: "HIT", value: entry.value };
};

const normalize = (value: string): string => value.trim().toLowerCase().replace(/\s+/gu, " ");
