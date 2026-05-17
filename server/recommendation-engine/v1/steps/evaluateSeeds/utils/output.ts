import {
  PlaceRecommendationItemSchema,
  type OperationInfo,
  type PlaceRecommendationItem,
} from "../../../interfaces/output.js";
import {
  EvaluateSeedsEvaluationSchema,
  type EvaluateSeedsEvaluation,
} from "../types.js";
import type {
  CandidateEnrichment,
  EnrichmentSourceDetail,
} from "./enrichment-types.js";
import { getRecommendationPriceRange } from "./price.js";
import type { RankedCandidate } from "./ranking.js";
import { isUsableEvidenceUrl } from "./source-url.js";

type VerifiedCandidateEnrichment = CandidateEnrichment & {
  operationInfo: OperationInfo;
};

const MIN_REFERENCE_IDENTITY_SCORE = 0.75;
const MIN_REFERENCE_CONFIDENCE = 0.4;

export const toPlaceRecommendationItem = ({
  evidence,
  scores,
}: RankedCandidate): PlaceRecommendationItem => {
  const seed = evidence.raw.seed;
  const enrichment = getVerifiedEnrichment(evidence);
  const referenceUrls = getVerifiedReferenceUrls(evidence);
  // UI에는 너무 긴 카테고리 체인을 노출하지 않도록 상위 태그만 사용한다.
  const tags =
    evidence.category.tags.length > 0
      ? evidence.category.tags.slice(0, 5)
      : [evidence.category.mainCategory];

  return PlaceRecommendationItemSchema.parse({
    id: evidence.candidateId,
    name: evidence.name,
    tags,
    contentSummary: buildContentSummary(evidence),
    mainCategory: evidence.category.mainCategory,
    subCategory: evidence.category.subCategory,
    operationInfo: enrichment.operationInfo,
    referenceUrls: {
      kakaoMap: referenceUrls.kakaoMap,
      naverMap: referenceUrls.naverMap,
      others: getOtherReferenceUrls(evidence),
    },
    location: {
      lat: seed.latitude,
      lng: seed.longitude,
      placeName: seed.name,
      roadAddressKo: seed.roadAddress || seed.address,
    },
    priceRangePerPerson: getRecommendationPriceRange(evidence),
    score: scores.total,
    reasons: [
      `입력 일치도 ${scores.inputMatch}/100`,
      `접근성 ${scores.accessibility}/100`,
      `다양성 보정 ${scores.diversity}/100`,
      enrichment.operationVerification.reason,
    ],
  });
};

const getOtherReferenceUrls = (
  evidence: RankedCandidate["evidence"],
): string[] | undefined => {
  // main Kakao/Naver URL과 중복되는 값은 others에서 제거한다.
  // 이 목록은 사용자가 근거를 더 확인할 때 쓰는 보조 reference다.
  const urls = getVerifiedSourceReferenceUrls(evidence);
  const { kakaoMap, naverMap } = getVerifiedReferenceUrls(evidence);
  const uniqueUrls = Array.from(new Set(urls)).filter(
    (url) => url !== kakaoMap && url !== naverMap,
  );
  return uniqueUrls.length > 0 ? uniqueUrls : undefined;
};

const getVerifiedReferenceUrls = (
  evidence: RankedCandidate["evidence"],
): NonNullable<RankedCandidate["evidence"]["referenceUrls"]> => {
  if (!evidence.referenceUrls) {
    throw new Error(
      `Missing verified referenceUrls for candidate ${evidence.candidateId}`,
    );
  }
  return evidence.referenceUrls;
};

const getVerifiedSourceReferenceUrls = (
  evidence: RankedCandidate["evidence"],
): string[] =>
  getVerifiedEnrichment(evidence).sourceDetails
    ?.filter(isTrustedReferenceDetail)
    .flatMap((detail) =>
      detail.sourceUrls.filter((url) =>
        isAllowedSourceReferenceUrl(url),
      ),
    ) ?? [];

const isTrustedReferenceDetail = (detail: EnrichmentSourceDetail): boolean => {
  if (detail.sourceUrls.length === 0) return false;
  if (detail.status !== "OPEN") return false;
  if (detail.confidence < MIN_REFERENCE_CONFIDENCE) return false;
  if (detail.identityMatchScore === undefined) {
    return detail.source === "naver-map";
  }
  return detail.identityMatchScore >= MIN_REFERENCE_IDENTITY_SCORE;
};

const isAllowedSourceReferenceUrl = (url: string): boolean =>
  isUsableEvidenceUrl(url) &&
  !/^https?:\/\/map\.kakao\.com\/link\/search\//iu.test(url);

export const toEvaluateSeedsEvaluation = ({
  evidence,
  llm,
  scores,
}: RankedCandidate): EvaluateSeedsEvaluation =>
  EvaluateSeedsEvaluationSchema.parse({
    itemId: evidence.candidateId,
    scores,
    matchedSignals: llm.matchedSignals,
    negativeSignals: llm.negativeSignals,
    rationaleFacts: llm.rationaleFacts,
  });

const buildContentSummary = ({
  category,
  placeInfo,
}: RankedCandidate["evidence"]): string => {
  const parts = [category.mainCategory];
  if (category.subCategory && category.subCategory !== category.mainCategory) {
    parts.push(category.subCategory);
  }
  parts.push(placeInfo.roadAddress || placeInfo.address);
  return parts.filter(Boolean).join(" · ");
};

const getVerifiedEnrichment = (
  evidence: RankedCandidate["evidence"],
): VerifiedCandidateEnrichment => {
  // evaluateSeeds의 hard gate를 통과한 후보만 output 변환에 들어와야 한다.
  // 여기서 누락되면 pipeline invariant가 깨진 것이므로 바로 실패시킨다.
  if (!evidence.enrichment?.operationInfo) {
    throw new Error(
      `Missing verified enrichment for candidate ${evidence.candidateId}`,
    );
  }
  return evidence.enrichment as VerifiedCandidateEnrichment;
};
