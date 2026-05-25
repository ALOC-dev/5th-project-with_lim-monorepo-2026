import type { EngineConfig } from "../../../configs/types.js";
import type { UserInput } from "../../../interfaces/input.contracts.js";
import type { Logger } from "../../../observability/logger.js";
import { type ReferenceUrlResolution, toReferenceUrlLog } from "../tools/reference-urls.js";
import {
  mergeEvidenceWithEnrichment,
  shouldRecommendByOperationHours,
} from "./enrichment-merge.js";
import type { CandidateEnrichment, CandidateEnrichmentRequest } from "./enrichment-types.js";
import type { CandidateScoringEvidence } from "./evidence.js";
import { assessSemanticFit, getSemanticScoreAdjustment } from "./semantic-fit.js";

export const ENRICHMENT_BATCH_SIZE = 10;

type EnrichCandidates = (
  request: CandidateEnrichmentRequest,
  logger: Logger,
) => Promise<CandidateEnrichment[]>;

type ResolveReferenceUrls = (
  evidences: CandidateScoringEvidence[],
) => Promise<ReferenceUrlResolution[]>;

type SemanticAssessment = {
  evidence: CandidateScoringEvidence;
  semanticFit: ReturnType<typeof assessSemanticFit>;
};

type EnrichmentBatchLog = {
  batchNo: number;
  offset: number;
  evidenceCount: number;
  enrichmentCount: number;
  operationVerifiedCount: number;
  semanticPassedCount: number;
  semanticRejectedCount: number;
  semanticPenalizedCount: number;
  referenceVerifiedCount: number;
  referenceRejectedCount: number;
  selectedSoFar: number;
};

export type EnrichmentBatchCollection = {
  enrichments: CandidateEnrichment[];
  enrichedEvidences: CandidateScoringEvidence[];
  referenceUrlResolutions: ReferenceUrlResolution[];
  semanticRejected: SemanticAssessment[];
  semanticPenalizedCount: number;
  notSemanticallyEvaluatedDueToOperationUnknown: Array<{
    candidateId: string;
    source: CandidateEnrichment["source"];
    status: CandidateEnrichment["operationVerification"]["status"];
    reason: string;
  }>;
  operationVerifiedCount: number;
  referenceRejectedCount: number;
  evaluatedEvidenceCount: number;
  batches: EnrichmentBatchLog[];
};

export const collectEnrichmentBatches = async ({
  userInput,
  evidences,
  config,
  logger,
  enrichCandidates,
  resolveReferenceUrls,
}: {
  userInput: UserInput;
  evidences: CandidateScoringEvidence[];
  config: EngineConfig;
  logger: Logger;
  enrichCandidates: EnrichCandidates;
  resolveReferenceUrls: ResolveReferenceUrls;
}): Promise<EnrichmentBatchCollection> => {
  const maxEvidenceCount = getMaxEvidenceCount(evidences.length, config);
  const scoringPoolSize = getScoringPoolSize(config);
  const allEnrichments: CandidateEnrichment[] = [];
  const selectedEvidences: CandidateScoringEvidence[] = [];
  const allReferenceUrlResolutions: ReferenceUrlResolution[] = [];
  const allSemanticRejected: SemanticAssessment[] = [];
  let semanticPenalizedCount = 0;
  const notSemanticallyEvaluatedDueToOperationUnknown: EnrichmentBatchCollection["notSemanticallyEvaluatedDueToOperationUnknown"] =
    [];
  const batches: EnrichmentBatchLog[] = [];
  let operationVerifiedCount = 0;
  let referenceRejectedCount = 0;
  let evaluatedEvidenceCount = 0;

  for (
    let offset = 0, batchNo = 1;
    offset < maxEvidenceCount && selectedEvidences.length < scoringPoolSize;
    offset += ENRICHMENT_BATCH_SIZE, batchNo += 1
  ) {
    const batchEvidences = evidences.slice(offset, offset + ENRICHMENT_BATCH_SIZE);
    evaluatedEvidenceCount += batchEvidences.length;
    logger.info("evaluateSeeds.enrichment.batch.start", {
      batchNo,
      offset,
      evidenceCount: batchEvidences.length,
      selectedSoFar: selectedEvidences.length,
      maxEvidenceCount,
      scoringPoolSize,
    });

    const batchEnrichments = await enrichCandidates(
      { userInput, evidences: batchEvidences },
      logger,
    );
    allEnrichments.push(...batchEnrichments);
    const enrichmentByCandidateId = new Map(
      batchEnrichments.map((enrichment) => [enrichment.candidateId, enrichment]),
    );

    const operationVerifiedEvidences = batchEvidences.flatMap((evidence) => {
      const enrichment = enrichmentByCandidateId.get(evidence.candidateId);
      if (!enrichment) return [];
      if (!shouldRecommendByOperationHours(enrichment)) return [];
      return [mergeEvidenceWithEnrichment(evidence, enrichment)];
    });
    operationVerifiedCount += operationVerifiedEvidences.length;
    notSemanticallyEvaluatedDueToOperationUnknown.push(
      ...batchEnrichments
        .filter((enrichment) => !shouldRecommendByOperationHours(enrichment))
        .map((enrichment) => ({
          candidateId: enrichment.candidateId,
          source: enrichment.source,
          status: enrichment.operationVerification.status,
          reason: enrichment.operationVerification.reason,
        })),
    );

    const semanticAssessments = operationVerifiedEvidences.map((evidence) => ({
      evidence,
      semanticFit: assessSemanticFit(evidence),
    }));
    const semanticRejected: SemanticAssessment[] = [];
    allSemanticRejected.push(...semanticRejected);
    const semanticPassed = semanticAssessments.map(({ evidence, semanticFit }) => ({
      ...evidence,
      semanticFit,
    }));
    const semanticPenalized = semanticAssessments.filter(
      ({ semanticFit }) => semanticFit.status === "PENALIZE",
    );
    semanticPenalizedCount += semanticPenalized.length;

    logger.info("evaluateSeeds.semantic_gate.filtered", {
      batchNo,
      evaluatedCount: semanticAssessments.length,
      passedCount: semanticPassed.length,
      rejectedCount: semanticRejected.length,
      penalizedCount: semanticPenalized.length,
      penalized: semanticPenalized.map(({ evidence, semanticFit }) => ({
        candidateId: evidence.candidateId,
        name: evidence.name,
        category: evidence.category,
        status: semanticFit.status,
        severity: semanticFit.severity,
        score: semanticFit.score,
        reason: semanticFit.reason,
        negativeSignals: semanticFit.negativeSignals,
        ...getSemanticScoreAdjustment(semanticFit),
      })),
      rejected: semanticRejected.map(({ evidence, semanticFit }) => ({
        candidateId: evidence.candidateId,
        name: evidence.name,
        category: evidence.category,
        reason: semanticFit.reason,
        negativeSignals: semanticFit.negativeSignals,
      })),
    });

    const finishReferenceUrls = logger.startTimer("evaluateSeeds.reference_urls.success");
    logger.info("evaluateSeeds.reference_urls.start", {
      batchNo,
      evidenceCount: semanticPassed.length,
    });
    const referenceUrlResolutions = await resolveReferenceUrls(semanticPassed);
    allReferenceUrlResolutions.push(...referenceUrlResolutions);
    const batchReferenceRejectedCount = referenceUrlResolutions.filter(
      (resolution) => !resolution.referenceUrls,
    ).length;
    referenceRejectedCount += batchReferenceRejectedCount;
    const verified = referenceUrlResolutions
      .filter(hasReferenceUrls)
      .map((resolution) => resolution.evidence);
    selectedEvidences.push(...verified);
    finishReferenceUrls({
      batchNo,
      verifiedCount: verified.length,
      rejectedCount: batchReferenceRejectedCount,
      selectedSoFar: selectedEvidences.length,
      results: referenceUrlResolutions.map((resolution) => ({
        candidateId: resolution.evidence.candidateId,
        name: resolution.evidence.name,
        ...toReferenceUrlLog(resolution),
      })),
    });

    const batchLog = {
      batchNo,
      offset,
      evidenceCount: batchEvidences.length,
      enrichmentCount: batchEnrichments.length,
      operationVerifiedCount: operationVerifiedEvidences.length,
      semanticPassedCount: semanticPassed.length,
      semanticRejectedCount: semanticRejected.length,
      semanticPenalizedCount: semanticPenalized.length,
      referenceVerifiedCount: verified.length,
      referenceRejectedCount: batchReferenceRejectedCount,
      selectedSoFar: selectedEvidences.length,
    };
    batches.push(batchLog);
    logger.info("evaluateSeeds.enrichment.batch.success", batchLog);
  }

  return {
    enrichments: allEnrichments,
    enrichedEvidences: selectedEvidences.slice(0, scoringPoolSize),
    referenceUrlResolutions: allReferenceUrlResolutions,
    semanticRejected: allSemanticRejected,
    semanticPenalizedCount,
    notSemanticallyEvaluatedDueToOperationUnknown,
    operationVerifiedCount,
    referenceRejectedCount,
    evaluatedEvidenceCount,
    batches,
  };
};

export const getMaxEvidenceCount = (evidenceCount: number, config: EngineConfig): number =>
  Math.min(
    evidenceCount,
    Math.max(ENRICHMENT_BATCH_SIZE, config.targetCount * config.candidatePoolMultiplier),
  );

const getScoringPoolSize = (config: EngineConfig): number =>
  config.scoringPoolSize ??
  Math.max(
    config.targetCount,
    Math.min(config.targetCount * 2, config.targetCount * config.candidatePoolMultiplier),
  );

const hasReferenceUrls = (
  resolution: ReferenceUrlResolution,
): resolution is ReferenceUrlResolution & {
  referenceUrls: NonNullable<ReferenceUrlResolution["referenceUrls"]>;
} => resolution.referenceUrls !== undefined;
