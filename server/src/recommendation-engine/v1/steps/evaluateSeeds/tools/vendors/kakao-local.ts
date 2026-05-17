import {
  searchKakaoLocalRaw,
  type KakaoLocalItem,
} from "../../../discoverSeeds/vendors/kakao-local.js";
import type { CandidateScoringEvidence } from "../../utils/evidence.js";
import { parseOperationInfoWithLlmFallback } from "../../llm/operation-info.js";
import { buildUnknownEnrichment } from "../../utils/enrichment-merge.js";
import type { CandidateEnrichment } from "../../utils/enrichment-types.js";
import { OperationVerifier } from "../../utils/operation-hours.js";
import { inferPriceRangePerPersonFromText } from "../../utils/price.js";
import { getOrScrapeGenericUrl } from "../shared/generic-url-scraper.js";
import {
  buildPlaceLookupQuery,
} from "../shared/place-match.js";
import {
  buildReferenceQueryVariants,
  scoreStructuredReferenceIdentity,
  type ReferenceIdentityScore,
  type ReferenceUrlMatch,
} from "../shared/reference-query.js";
import type { KakaoLocalCandidateOptions } from "../types.js";

const MIN_REFERENCE_MATCH_SCORE = 0.65;

export const enrichWithKakaoLocal = async (
  evidence: CandidateScoringEvidence,
  operationVerifier: OperationVerifier,
  options: KakaoLocalCandidateOptions,
): Promise<CandidateEnrichment> => {
  const query = buildPlaceLookupQuery(evidence);
  const response = await searchKakaoCandidate(query, evidence);
  const primaryMatch = chooseBestKakaoLocalMatch(response.documents, evidence);
  const fallbackResponse = primaryMatch
    ? undefined
    : await searchKakaoCandidate(evidence.name, evidence);
  const fallbackMatch = fallbackResponse
    ? chooseBestKakaoLocalMatch(fallbackResponse.documents, evidence)
    : undefined;
  const effectiveResponse =
    fallbackResponse && fallbackMatch ? fallbackResponse : response;
  const match = primaryMatch ?? fallbackMatch;

  if (!match) {
    return buildUnknownEnrichment(
      evidence.candidateId,
      operationVerifier,
      "Kakao Local returned no usable place match",
      "kakao-local",
    );
  }

  const sourceUrls = match.item.place_url ? [match.item.place_url] : [];
  const scraped =
    sourceUrls[0] && options.scrapePlaceDetails
      ? await getOrScrapeGenericUrl(sourceUrls[0], options)
      : undefined;
  const searchableText = scraped?.snapshot.frameTexts
    .map((frame) => frame.text)
    .join("\n");
  const operationParse = await parseOperationInfoWithLlmFallback({
    text: searchableText,
    evidence,
    operationVerifier,
    sourceName: "kakao-local",
    sourceTextKind: "scraped_page",
  });
  const operationInfo = operationParse.operationInfo;
  const operationVerification = operationInfo
    ? operationVerifier.verify(operationInfo, sourceUrls)
    : operationVerifier.unknown({
        reason: operationParse.reason,
        sourceUrls,
        confidence: match.identity.identityScore >= 0.75 ? 0.25 : 0.1,
      });

  return {
    candidateId: evidence.candidateId,
    source: "kakao-local",
    sourceUrls,
    operationInfo,
    operationVerification,
    trustSignals: {
        sourceAgreementCount: 1,
      placeMatchScore: match.identity.identityScore,
      webMentionCount: effectiveResponse.meta.total_count,
    },
    priceRangePerPerson: inferPriceRangePerPersonFromText(
      searchableText,
      evidence.category,
    ),
    rawTextSnippet: searchableText?.slice(0, 2_000),
    scrapeCache: scraped?.cache,
    sourceDetails: [
      {
        source: "kakao-local",
        status: operationVerification.status,
        reason: operationVerification.reason,
        sourceUrls,
        confidence: operationVerification.confidence,
        identityMatchScore: match.identity.identityScore,
        operationParser: operationParse.parser,
        operationParseReason: operationParse.reason,
        sourceTextKind: "scraped_page",
        rawTextSnippet: searchableText?.slice(0, 700),
        scrapeCache: scraped?.cache,
      },
    ],
  };
};

export const resolveKakaoMapReferenceUrl = async (
  evidence: CandidateScoringEvidence,
): Promise<ReferenceUrlMatch | undefined> => {
  for (const query of buildReferenceQueryVariants(evidence)) {
    const response = await searchKakaoCandidate(query.query, evidence);
    const match = chooseBestKakaoLocalMatch(
      response.documents,
      evidence,
      MIN_REFERENCE_MATCH_SCORE,
      true,
    );
    if (match?.item.place_url) {
      return {
        url: match.item.place_url,
        query,
        identity: match.identity,
      };
    }
  }
  return undefined;
};

const searchKakaoCandidate = (
  query: string,
  evidence: CandidateScoringEvidence,
) =>
  searchKakaoLocalRaw({
    query,
    pagination: { page: 1, count: 5 },
    location: {
      longitude: evidence.placeInfo.lng,
      latitude: evidence.placeInfo.lat,
      radiusKm: 2,
    },
  });

const chooseBestKakaoLocalMatch = (
  items: KakaoLocalItem[],
  evidence: CandidateScoringEvidence,
  minScore = 0.35,
  requireAccepted = false,
): { item: KakaoLocalItem; identity: ReferenceIdentityScore } | undefined =>
  items
    .map((item) => ({
      item,
      identity: scoreKakaoLocalMatch(item, evidence),
    }))
    .filter(
      ({ identity }) =>
        identity.identityScore >= minScore &&
        (!requireAccepted || identity.accepted),
    )
    .sort((a, b) => b.identity.identityScore - a.identity.identityScore)[0];

const scoreKakaoLocalMatch = (
  item: KakaoLocalItem,
  evidence: CandidateScoringEvidence,
): ReferenceIdentityScore =>
  scoreStructuredReferenceIdentity({
    actualName: item.place_name,
    actualRoadAddress: item.road_address_name,
    actualAddress: item.address_name,
    expected: evidence,
    distanceMeters: item.distance ? Number(item.distance) : undefined,
  });
