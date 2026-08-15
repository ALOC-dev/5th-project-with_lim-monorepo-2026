import type { EnrichmentSourceDetail } from "../utils/enrichment-types.js";
import type { CandidateScoringEvidence } from "../utils/evidence.js";
import type { UrlScrapeCache } from "../utils/scrape-cache.js";
import {
  hasReferenceEntityEvidence,
  type ReferenceUrlMatch,
  scoreTextReferenceIdentity,
} from "./shared/reference-query.js";
import type { PlaywrightBrowser, UrlScrapeResult } from "./types.js";
import { resolveKakaoMapReferenceUrl } from "./vendors/kakao-local.js";
import { resolveNaverMapReferenceUrl } from "./vendors/naver-map.js";

type CandidateReferenceUrls = {
  kakaoMap?: string;
  naverMap?: string;
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
      distanceMeters?: number;
      distanceScore?: number;
      acceptedReason: string;
    };

export type ReferenceUrlResolverOptions = {
  kakaoRestApiKey?: string;
  getBrowser: () => Promise<PlaywrightBrowser>;
  naverMapScrapeCache?: UrlScrapeCache;
  scrapeRequests: Map<string, Promise<UrlScrapeResult>>;
  timeoutMs: number;
  settleMs: number;
  /** Test seam for identity-policy regressions; production uses the vendor resolvers. */
  resolveKakaoMapReferenceUrl?: (
    evidence: CandidateScoringEvidence,
  ) => Promise<ReferenceUrlMatch | undefined>;
  resolveNaverMapReferenceUrl?: (
    evidence: CandidateScoringEvidence,
    options: Pick<
      ReferenceUrlResolverOptions,
      "getBrowser" | "naverMapScrapeCache" | "scrapeRequests" | "timeoutMs" | "settleMs"
    >,
  ) => Promise<ReferenceUrlMatch | undefined>;
};

const MIN_REFERENCE_IDENTITY_SCORE = 0.75;

type ExistingReference = {
  url: string;
  provenance: "seed-kakao" | "source-detail";
  detail?: EnrichmentSourceDetail;
};

export const resolveCandidateReferenceUrls = async (
  evidence: CandidateScoringEvidence,
  options: ReferenceUrlResolverOptions,
): Promise<ReferenceUrlResolution> => {
  const existingKakaoMap = findExistingKakaoMapReference(evidence);
  const existingNaverMap = findExistingNaverMapReference(evidence);
  const canUseExistingKakaoMap =
    existingKakaoMap !== undefined && hasStrongExistingReference(existingKakaoMap, evidence);
  const canUseExistingNaverMap =
    existingNaverMap !== undefined && hasStrongExistingReference(existingNaverMap, evidence);
  const naverResolverOptions = {
    getBrowser: options.getBrowser,
    naverMapScrapeCache: options.naverMapScrapeCache,
    scrapeRequests: options.scrapeRequests,
    timeoutMs: options.timeoutMs,
    settleMs: options.settleMs,
  };
  // Kakao의 provider entity 또는 강한 Kakao entity match 하나면 public reference
  // hard gate는 충족한다. 이때 Naver Map을 추가로 Playwright로 확인하는 것은 결과의
  // 동일성/영업 판정에 아무 근거도 더하지 않고, 후보 하나당 수 초~수십 초를 더한다.
  // Kakao가 약하거나 없을 때만 Naver를 보조 근거로 조회한다.
  const kakaoMapMatch =
    !canUseExistingKakaoMap
      ? await (options.resolveKakaoMapReferenceUrl
          ? options.resolveKakaoMapReferenceUrl(evidence)
          : resolveKakaoMapReferenceUrl(evidence, {
              kakaoRestApiKey: options.kakaoRestApiKey,
            })
        ).catch(() => undefined)
      : undefined;
  const kakaoMap = canUseExistingKakaoMap ? existingKakaoMap?.url : kakaoMapMatch?.url;
  const hasStrongKakaoReference =
    canUseExistingKakaoMap ||
    (kakaoMapMatch !== undefined && hasReferenceEntityEvidence(kakaoMapMatch.identity));
  const naverMapMatch =
    !hasStrongKakaoReference && !canUseExistingNaverMap
      ? await (options.resolveNaverMapReferenceUrl
          ? options.resolveNaverMapReferenceUrl(evidence, naverResolverOptions)
          : resolveNaverMapReferenceUrl(evidence, naverResolverOptions)
        ).catch(() => undefined)
      : undefined;
  const naverMap = canUseExistingNaverMap ? existingNaverMap?.url : naverMapMatch?.url;
  const hasWeakLoneNaverReference =
    naverMapMatch !== undefined && !hasReferenceEntityEvidence(naverMapMatch.identity);

  // Naver Map search text can contain a same-name branch and still clear the broad
  // discovery-time score. Do not let a low-address, no-coordinate Naver URL become
  // the sole public reference. A strong Kakao entity is allowed as the fallback, but
  // the weak Naver link itself is omitted so it cannot route users to that other branch.
  if (hasWeakLoneNaverReference && !hasStrongKakaoReference) {
    return {
      evidence,
      rejectedReason: "insufficient_reference_identity_evidence",
      source: buildReferenceSourceLogs({
        existingKakaoMap,
        existingNaverMap,
        kakaoMapMatch,
        naverMapMatch,
        useExistingKakaoMap: canUseExistingKakaoMap,
        useExistingNaverMap: canUseExistingNaverMap,
      }),
    };
  }
  const acceptedNaverMap = hasWeakLoneNaverReference ? undefined : naverMap;

  if (!kakaoMap && !acceptedNaverMap) {
    return {
      evidence,
      rejectedReason: [
        !kakaoMap ? "missing_verified_kakao_map_url" : undefined,
        !acceptedNaverMap ? "missing_verified_naver_map_url" : undefined,
      ]
        .filter(Boolean)
        .join(","),
      source: buildReferenceSourceLogs({
        existingKakaoMap,
        existingNaverMap,
        kakaoMapMatch,
        naverMapMatch,
        useExistingKakaoMap: canUseExistingKakaoMap,
        useExistingNaverMap: canUseExistingNaverMap,
      }),
    };
  }

  return {
    evidence: {
      ...evidence,
      referenceUrls: {
        ...(kakaoMap ? { kakaoMap } : {}),
        ...(acceptedNaverMap ? { naverMap: acceptedNaverMap } : {}),
      },
    },
    referenceUrls: {
      ...(kakaoMap ? { kakaoMap } : {}),
      ...(acceptedNaverMap ? { naverMap: acceptedNaverMap } : {}),
    },
    source: buildReferenceSourceLogs({
      existingKakaoMap,
      existingNaverMap,
      kakaoMapMatch,
      naverMapMatch,
      useExistingKakaoMap: canUseExistingKakaoMap,
      useExistingNaverMap: canUseExistingNaverMap,
    }),
  };
};

const findExistingKakaoMapReference = (
  evidence: CandidateScoringEvidence,
): ExistingReference | undefined => {
  const fromDetail = findSourceDetailReference(evidence, "kakao-local", isKakaoPlaceUrl);
  if (fromDetail) return fromDetail;
  if (evidence.raw.seed.provider === "kakao" && evidence.raw.seed.placeUrl) {
    return { url: evidence.raw.seed.placeUrl, provenance: "seed-kakao" };
  }
  return undefined;
};

const findExistingNaverMapReference = (
  evidence: CandidateScoringEvidence,
): ExistingReference | undefined =>
  findSourceDetailReference(evidence, "naver-map", isNaverMapVerifiedSearchUrl);

const findSourceDetailReference = (
  evidence: CandidateScoringEvidence,
  source: EnrichmentSourceDetail["source"],
  isAllowedUrl: (url: string) => boolean,
): ExistingReference | undefined => {
  const detail = evidence.enrichment?.sourceDetails?.find(
    (candidate) =>
      candidate.source === source &&
      isTrustedReferenceDetail(candidate) &&
      candidate.sourceUrls.some(isAllowedUrl),
  );
  const url = detail?.sourceUrls.find(isAllowedUrl);
  return detail && url ? { url, provenance: "source-detail", detail } : undefined;
};

const hasStrongExistingReference = (
  reference: ExistingReference,
  evidence: CandidateScoringEvidence,
): boolean => {
  if (reference.provenance === "seed-kakao") return true;
  const identity =
    reference.detail?.referenceIdentity ??
    (reference.detail?.rawTextSnippet
      ? scoreTextReferenceIdentity(reference.detail.rawTextSnippet, evidence)
      : undefined);
  return identity !== undefined && hasReferenceEntityEvidence(identity);
};

const isTrustedReferenceDetail = (detail: EnrichmentSourceDetail): boolean => {
  if (detail.sourceUrls.length === 0) return false;
  // 영업시간은 Naver/다른 source에서 OPEN으로 확인될 수 있다. Kakao Local의 공식
  // place URL은 그 경우에도 장소 동일성의 독립 근거이므로, 강한 entity match가 있으면
  // Kakao 자체의 operation status가 UNKNOWN이어도 reference로 재사용할 수 있다.
  if (
    detail.source === "kakao-local" &&
    detail.referenceIdentity !== undefined &&
    hasReferenceEntityEvidence(detail.referenceIdentity)
  ) {
    return true;
  }
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

const toResolvedSourceLog = (match: ReferenceUrlMatch | undefined): ReferenceUrlSourceLog => {
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
    distanceMeters: match.identity.distanceMeters,
    distanceScore: match.identity.distanceScore,
    acceptedReason: match.identity.acceptedReason,
  };
};

const buildReferenceSourceLogs = ({
  existingKakaoMap,
  existingNaverMap,
  kakaoMapMatch,
  naverMapMatch,
  useExistingKakaoMap,
  useExistingNaverMap,
}: {
  existingKakaoMap?: ExistingReference;
  existingNaverMap?: ExistingReference;
  kakaoMapMatch?: ReferenceUrlMatch;
  naverMapMatch?: ReferenceUrlMatch;
  useExistingKakaoMap: boolean;
  useExistingNaverMap: boolean;
}): ReferenceUrlResolution["source"] => ({
  ...(useExistingKakaoMap && existingKakaoMap
    ? { kakaoMap: toExistingSourceLog(existingKakaoMap.url) }
    : kakaoMapMatch
      ? { kakaoMap: toResolvedSourceLog(kakaoMapMatch) }
      : existingKakaoMap
        ? { kakaoMap: toExistingSourceLog(existingKakaoMap.url) }
        : {}),
  ...(useExistingNaverMap && existingNaverMap
    ? { naverMap: toExistingSourceLog(existingNaverMap.url) }
    : naverMapMatch
      ? { naverMap: toResolvedSourceLog(naverMapMatch) }
      : existingNaverMap
        ? { naverMap: toExistingSourceLog(existingNaverMap.url) }
        : {}),
});

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
