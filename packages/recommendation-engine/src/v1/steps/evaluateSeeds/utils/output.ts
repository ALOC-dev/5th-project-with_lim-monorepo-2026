import type { UserInput } from "../../../interfaces/input.contracts.js";
import {
  type OperationInfo,
  type PlaceRecommendationItem,
  PlaceRecommendationItemSchema,
} from "../../../interfaces/output.contracts.js";
import { type EvaluateSeedsEvaluation, EvaluateSeedsEvaluationSchema } from "../contracts.js";
import type { CandidateEnrichment, EnrichmentSourceDetail } from "./enrichment-types.js";
import { getRecommendationPriceRange } from "./price.js";
import type { RankedCandidate } from "./ranking.js";
import { isUsableEvidenceUrl } from "./source-url.js";

type VerifiedCandidateEnrichment = CandidateEnrichment & {
  operationInfo: OperationInfo;
};

const MIN_REFERENCE_IDENTITY_SCORE = 0.75;
const MIN_REFERENCE_CONFIDENCE = 0.4;
const MAX_CONTENT_SUMMARY_LENGTH = 140;
const MAX_REASON_COUNT = 3;
const MAX_REASON_LENGTH = 90;
const EARTH_RADIUS_METERS = 6_371_000;

export const toPlaceRecommendationItem = (
  { evidence, llm, scores }: RankedCandidate,
  userInput: UserInput,
): PlaceRecommendationItem => {
  const seed = evidence.raw.seed;
  const enrichment = getVerifiedEnrichment(evidence);
  const referenceUrls = getVerifiedReferenceUrls(evidence);
  const instagramUrl = getInstagramReferenceUrl(evidence);
  const otherReferenceUrls = getOtherReferenceUrls(evidence, instagramUrl);
  const tags =
    evidence.category.tags.length > 0
      ? evidence.category.tags.slice(0, 5)
      : [evidence.category.mainCategory];

  return PlaceRecommendationItemSchema.parse({
    id: evidence.candidateId,
    name: evidence.name,
    phoneNumber: seed.phone.trim() || null,
    tags,
    contentSummary: buildContentSummary({ evidence, tags, facts: llm.rationaleFacts }),
    mainCategory: evidence.category.mainCategory,
    subCategory: evidence.category.subCategory,
    operationInfo: enrichment.operationInfo,
    availabilityAtRequestedTime: {
      status: enrichment.operationVerification.status,
      requestedDateISO: enrichment.operationVerification.requestedDateISO,
      requestedTime24h: enrichment.operationVerification.requestedTime24h,
      stayDurationMinutes: enrichment.operationVerification.stayDurationMinutes,
      reason: enrichment.operationVerification.reason,
    },
    referenceUrls: {
      kakaoMap: referenceUrls.kakaoMap,
      naverMap: referenceUrls.naverMap,
      ...(instagramUrl ? { instagram: instagramUrl } : {}),
      ...(otherReferenceUrls.length > 0 ? { others: otherReferenceUrls } : {}),
    },
    accessibility: {
      score: scores.accessibility,
      ...(evidence.accessibilitySignals.distanceMeters !== undefined
        ? { distanceMeters: evidence.accessibilitySignals.distanceMeters }
        : {}),
      ...(evidence.accessibilitySignals.estimatedTravelMinutes !== undefined
        ? { estimatedTravelMinutes: evidence.accessibilitySignals.estimatedTravelMinutes }
        : {}),
      perOrigin: buildPerOriginAccessibility(seed, userInput),
    },
    location: {
      lat: seed.latitude,
      lng: seed.longitude,
      placeName: seed.name,
      roadAddressKo: seed.roadAddress || seed.address,
    },
    priceRangePerPerson: getRecommendationPriceRange(evidence),
    score: Math.round(scores.total),
    scoreBreakdown: scores,
    reasons: buildRecommendationReasons({
      matchedSignals: llm.matchedSignals.map((signal) => signal.label),
      rationaleFacts: llm.rationaleFacts,
      operationReason: enrichment.operationVerification.reason,
    }),
  });
};

const getOtherReferenceUrls = (
  evidence: RankedCandidate["evidence"],
  instagramUrl: string | undefined,
): string[] => {
  const urls = getVerifiedSourceReferenceUrls(evidence);
  const { kakaoMap, naverMap } = getVerifiedReferenceUrls(evidence);
  return Array.from(new Set(urls)).filter(
    (url) => url !== kakaoMap && url !== naverMap && url !== instagramUrl,
  );
};

const getVerifiedReferenceUrls = (
  evidence: RankedCandidate["evidence"],
): NonNullable<RankedCandidate["evidence"]["referenceUrls"]> => {
  if (!evidence.referenceUrls) {
    throw new Error(`Missing verified referenceUrls for candidate ${evidence.candidateId}`);
  }
  return evidence.referenceUrls;
};

const getVerifiedSourceReferenceUrls = (evidence: RankedCandidate["evidence"]): string[] =>
  getVerifiedEnrichment(evidence)
    .sourceDetails?.filter(isTrustedReferenceDetail)
    .flatMap((detail) => detail.sourceUrls.filter((url) => isAllowedSourceReferenceUrl(url))) ?? [];

const getInstagramReferenceUrl = (evidence: RankedCandidate["evidence"]): string | undefined =>
  getVerifiedSourceReferenceUrls(evidence).find(isInstagramUrl);

const isInstagramUrl = (url: string): boolean =>
  /^https?:\/\/(?:www\.)?instagram\.com\/[^/?#]+/iu.test(url);

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
  isUsableEvidenceUrl(url) && !/^https?:\/\/map\.kakao\.com\/link\/search\//iu.test(url);

const buildPerOriginAccessibility = (
  seed: RankedCandidate["evidence"]["raw"]["seed"],
  userInput: UserInput,
): PlaceRecommendationItem["accessibility"]["perOrigin"] =>
  userInput.location.map((origin, index) => ({
    originId: toOriginId(index),
    distanceMeters: toDistanceMeters(
      { lat: origin.lat, lng: origin.lng },
      { lat: seed.latitude, lng: seed.longitude },
    ),
  }));

const toOriginId = (index: number): string => (index === 0 ? "host" : `member-${index}`);

const toDistanceMeters = (
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
): number => {
  const dLat = toRadians(destination.lat - origin.lat);
  const dLng = toRadians(destination.lng - origin.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(origin.lat)) *
      Math.cos(toRadians(destination.lat)) *
      Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(EARTH_RADIUS_METERS * c);
};

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

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
  evidence,
  facts,
  tags,
}: {
  evidence: RankedCandidate["evidence"];
  facts: string[];
  tags: string[];
}): string => {
  const contentLikeFact = facts.find(isContentSummaryFact);
  if (contentLikeFact) {
    return toCompactSentence(contentLikeFact, MAX_CONTENT_SUMMARY_LENGTH);
  }

  const categoryText =
    evidence.category.subCategory === evidence.category.mainCategory
      ? evidence.category.mainCategory
      : `${evidence.category.mainCategory} · ${evidence.category.subCategory}`;
  const tagText = tags.slice(0, 3).join(", ");
  const fallback = tagText
    ? `${tagText} 특성이 있는 ${categoryText} 후보입니다.`
    : `${categoryText} 후보입니다.`;
  return toCompactSentence(fallback, MAX_CONTENT_SUMMARY_LENGTH);
};

const isContentSummaryFact = (fact: string): boolean => {
  const text = fact.trim();
  if (text.length === 0) return false;

  const operationalOnly = /영업|휴무|라스트\s*오더|브레이크|운영\s*시간/u.test(text);
  const scoreOnly = /점수|신뢰|접근성|다양성|입력\s*일치/u.test(text);
  return !operationalOnly && !scoreOnly;
};

const buildRecommendationReasons = ({
  matchedSignals,
  rationaleFacts,
  operationReason,
}: {
  matchedSignals: string[];
  rationaleFacts: string[];
  operationReason: string;
}): string[] => {
  const candidates = [...matchedSignals, ...rationaleFacts, operationReason]
    .map((reason) => toCompactSentence(reason, MAX_REASON_LENGTH))
    .filter((reason) => reason.length > 0);

  const uniqueReasons = Array.from(new Set(candidates)).slice(0, MAX_REASON_COUNT);
  return uniqueReasons.length > 0
    ? uniqueReasons
    : ["요청 조건과 검증 정보를 종합해 상위 추천으로 선정했습니다."];
};

const toCompactSentence = (value: string, maxLength: number): string => {
  const compact = value.trim().replace(/\s+/gu, " ");
  if (compact.length <= maxLength) return compact;
  return compact.slice(0, maxLength - 1).trimEnd();
};

const getVerifiedEnrichment = (
  evidence: RankedCandidate["evidence"],
): VerifiedCandidateEnrichment => {
  if (!evidence.enrichment?.operationInfo) {
    throw new Error(`Missing verified enrichment for candidate ${evidence.candidateId}`);
  }
  return evidence.enrichment as VerifiedCandidateEnrichment;
};
