import type { CandidateScoringEvidence } from "../utils/evidence.js";
import type {
  EnrichmentSourceDetail,
} from "../utils/enrichment-types.js";
import type { UrlScrapeCache } from "../utils/scrape-cache.js";
import type {
  PlaywrightBrowser,
  UrlScrapeResult,
} from "./types.js";
import type { ReferenceUrlMatch } from "./shared/reference-query.js";
import { resolveKakaoMapReferenceUrl } from "./vendors/kakao-local.js";
import { resolveNaverMapReferenceUrl } from "./vendors/naver-map.js";

type CandidateReferenceUrls = {
  kakaoMap: string;
  naverMap: string;
};

export type ReferenceUrlResolution = {
  evidence: CandidateScoringEvidence;
  referenceUrls?: CandidateReferenceUrls;
  rejectedReason?: string;
  source: {
    kakaoMap?: ReferenceUrlSourceLog;
    naverMap?: ReferenceUrlSourceLog;
  };
};

type ReferenceUrlSourceLog =
  | {
      status: "existing";
      url: string;
    }
  | {
      status: "resolved";
      url: string;
      query: string;
      queryKind: ReferenceUrlMatch["query"]["kind"];
      nameAlias: string;
      identityScore: number;
      nameScore: number;
      addressScore: number;
      distanceScore?: number;
      acceptedReason: string;
    };

type ReferenceUrlResolverOptions = {
  kakaoRestApiKey?: string;
  getBrowser: () => Promise<PlaywrightBrowser>;
  naverMapScrapeCache?: UrlScrapeCache;
  scrapeRequests: Map<string, Promise<UrlScrapeResult>>;
  timeoutMs: number;
  settleMs: number;
};

const MIN_REFERENCE_IDENTITY_SCORE = 0.75;

export const resolveCandidateReferenceUrls = async (
  evidence: CandidateScoringEvidence,
  options: ReferenceUrlResolverOptions,
): Promise<ReferenceUrlResolution> => {
  const existingKakaoMap = findExistingKakaoMapUrl(evidence);
  const existingNaverMap = findExistingNaverMapUrl(evidence);
  const kakaoMapMatch =
    existingKakaoMap === undefined
      ? await resolveKakaoMapReferenceUrl(evidence, {
          kakaoRestApiKey: options.kakaoRestApiKey,
        })
      : undefined;
  const naverMapMatch =
    existingNaverMap === undefined
      ? await resolveNaverMapReferenceUrl(evidence, options)
      : undefined;
  const kakaoMap = existingKakaoMap ?? kakaoMapMatch?.url;
  const naverMap = existingNaverMap ?? naverMapMatch?.url;

  if (!kakaoMap || !naverMap) {
    return {
      evidence,
      rejectedReason: [
        !kakaoMap ? "missing_verified_kakao_map_url" : undefined,
        !naverMap ? "missing_verified_naver_map_url" : undefined,
      ]
        .filter(Boolean)
        .join(","),
      source: {
        ...(existingKakaoMap
          ? { kakaoMap: toExistingSourceLog(existingKakaoMap) }
          : kakaoMapMatch
            ? { kakaoMap: toResolvedSourceLog(kakaoMapMatch) }
            : {}),
        ...(existingNaverMap
          ? { naverMap: toExistingSourceLog(existingNaverMap) }
          : naverMapMatch
            ? { naverMap: toResolvedSourceLog(naverMapMatch) }
            : {}),
      },
    };
  }

  return {
    evidence: {
      ...evidence,
      referenceUrls: { kakaoMap, naverMap },
    },
    referenceUrls: { kakaoMap, naverMap },
    source: {
      kakaoMap: existingKakaoMap
        ? toExistingSourceLog(existingKakaoMap)
        : toResolvedSourceLog(kakaoMapMatch),
      naverMap: existingNaverMap
        ? toExistingSourceLog(existingNaverMap)
        : toResolvedSourceLog(naverMapMatch),
    },
  };
};

const findExistingKakaoMapUrl = (
  evidence: CandidateScoringEvidence,
): string | undefined =>
  findSourceDetailUrl(evidence, "kakao-local", isKakaoPlaceUrl) ??
  (evidence.raw.seed.provider === "kakao" && evidence.raw.seed.placeUrl
    ? evidence.raw.seed.placeUrl
    : undefined);

const findExistingNaverMapUrl = (
  evidence: CandidateScoringEvidence,
): string | undefined =>
  findSourceDetailUrl(evidence, "naver-map", isNaverMapVerifiedSearchUrl);

const findSourceDetailUrl = (
  evidence: CandidateScoringEvidence,
  source: EnrichmentSourceDetail["source"],
  isAllowedUrl: (url: string) => boolean,
): string | undefined =>
  evidence.enrichment?.sourceDetails
    ?.find(
      (detail) =>
        detail.source === source &&
        isTrustedReferenceDetail(detail) &&
        detail.sourceUrls.some(isAllowedUrl),
    )
    ?.sourceUrls.find(isAllowedUrl);

const isTrustedReferenceDetail = (detail: EnrichmentSourceDetail): boolean => {
  if (detail.sourceUrls.length === 0) return false;
  if (detail.status !== "OPEN") return false;
  if (detail.identityMatchScore === undefined) {
    return detail.source === "naver-map";
  }
  return detail.identityMatchScore >= MIN_REFERENCE_IDENTITY_SCORE;
};

const isKakaoPlaceUrl = (url: string): boolean =>
  /^https?:\/\/place\.map\.kakao\.com\/\d+/iu.test(url);

const isNaverMapVerifiedSearchUrl = (url: string): boolean =>
  /^https?:\/\/map\.naver\.com\/(?:v5|p)\/search\//iu.test(url);

const toExistingSourceLog = (url: string): ReferenceUrlSourceLog => ({
  status: "existing",
  url,
});

const toResolvedSourceLog = (
  match: ReferenceUrlMatch | undefined,
): ReferenceUrlSourceLog => {
  if (!match) {
    throw new Error("Missing resolved reference URL match");
  }
  return {
    status: "resolved",
    url: match.url,
    query: match.query.query,
    queryKind: match.query.kind,
    nameAlias: match.query.nameAlias,
    identityScore: match.identity.identityScore,
    nameScore: match.identity.nameScore,
    addressScore: match.identity.addressScore,
    distanceScore: match.identity.distanceScore,
    acceptedReason: match.identity.acceptedReason,
  };
};

export const toReferenceUrlLog = ({
  referenceUrls,
  rejectedReason,
  source,
}: ReferenceUrlResolution): Record<string, unknown> => ({
  status: referenceUrls ? "VERIFIED" : "REJECTED",
  referenceUrls,
  rejectedReason,
  source,
});
