import type { EnrichmentSourceDetail } from "../utils/enrichment-types.js";
import type { CandidateScoringEvidence } from "../utils/evidence.js";
import type { UrlScrapeCache } from "../utils/scrape-cache.js";
import type { ReferenceUrlMatch } from "./shared/reference-query.js";
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
  /**
   * 카카오로 확인되지 않은 후보에 대해 네이버 지도 스크랩까지 시도할지.
   *
   * 이 경로는 후보마다 Playwright로 지도를 여러 번 긁는 가장 비싼 단계다.
   * 실측에서 두 시나리오 합쳐 70초를 쓰고 2건을 확인했는데, **그 2건 모두
   * 최종 추천에 들지 못했다**. 그래서 평소에는 끄고, 배치를 다 돌고도 후보가
   * 모자랄 때만 구제용으로 켠다.
   */
  allowNaverFallback?: boolean;
};

const MIN_REFERENCE_IDENTITY_SCORE = 0.75;

export const resolveCandidateReferenceUrls = async (
  evidence: CandidateScoringEvidence,
  options: ReferenceUrlResolverOptions,
): Promise<ReferenceUrlResolution> => {
  const existingKakaoMap = findExistingKakaoMapUrl(evidence);
  const existingNaverMap = findExistingNaverMapUrl(evidence);

  // 카카오를 먼저 본다. REST 호출 한 번이라 싸다.
  const kakaoMapMatch =
    existingKakaoMap === undefined
      ? await resolveKakaoMapReferenceUrl(evidence, {
          kakaoRestApiKey: options.kakaoRestApiKey,
        }).catch(() => undefined)
      : undefined;
  const kakaoMap = existingKakaoMap ?? kakaoMapMatch?.url;

  // 카카오로 이미 확인됐으면 네이버는 건너뛴다.
  //
  // 출력 계약(`ReferenceUrlsSchema`)은 카카오·네이버 **둘 중 하나**만 요구하는데
  // 예전에는 항상 둘 다 확인하려 했다. 네이버 확인은 후보마다 Playwright로 지도를
  // 여러 번 스크랩하는 가장 비싼 단계라, 실측에서 전체 271초 중 166초(61%)를
  // 혼자 썼다. 게다가 네이버는 봇 차단이 걸려 실패율도 높다.
  // 이미 충분한 근거가 있는데 더 비싼 확인을 반복할 이유가 없다.
  const naverMapMatch =
    options.allowNaverFallback === true &&
    existingNaverMap === undefined &&
    kakaoMap === undefined
      ? await resolveNaverMapReferenceUrl(evidence, options).catch(() => undefined)
      : undefined;
  const naverMap = existingNaverMap ?? naverMapMatch?.url;

  if (!kakaoMap && !naverMap) {
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
      referenceUrls: {
        ...(kakaoMap ? { kakaoMap } : {}),
        ...(naverMap ? { naverMap } : {}),
      },
    },
    referenceUrls: {
      ...(kakaoMap ? { kakaoMap } : {}),
      ...(naverMap ? { naverMap } : {}),
    },
    source: {
      ...(kakaoMap
        ? {
            kakaoMap: existingKakaoMap
              ? toExistingSourceLog(existingKakaoMap)
              : toResolvedSourceLog(kakaoMapMatch),
          }
        : {}),
      ...(naverMap
        ? {
            naverMap: existingNaverMap
              ? toExistingSourceLog(existingNaverMap)
              : toResolvedSourceLog(naverMapMatch),
          }
        : {}),
    },
  };
};

/**
 * 별도 조회 없이 이미 확보된 카카오 장소 URL.
 *
 * 탐색 단계에서 카카오로 찾은 seed는 여기서 바로 잡히므로 참조 확인이 공짜다.
 * 조사 순서를 정할 때도 같은 기준을 써야 해서 밖으로 내보낸다.
 */
export const findExistingKakaoMapUrl = (
  evidence: CandidateScoringEvidence,
): string | undefined =>
  findSourceDetailUrl(evidence, "kakao-local", isKakaoPlaceUrl) ??
  (evidence.raw.seed.provider === "kakao" && evidence.raw.seed.placeUrl
    ? evidence.raw.seed.placeUrl
    : undefined);

const findExistingNaverMapUrl = (evidence: CandidateScoringEvidence): string | undefined =>
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
  // 예전에는 네이버만 점수 없이도 믿었다. 네이버 참조 URL은 장소 URL이 아니라
  // **검색 URL**이라, 동일성 확인 없이 실으면 링크를 눌렀을 때 엉뚱한 가게가
  // 먼저 뜰 수 있다. 지금은 어느 출처든 점수를 낸 것만 쓴다(네이버 조회는
  // `scoreNaverMapTextIdentity`로 항상 점수를 낸다).
  if (detail.identityMatchScore === undefined) return false;
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
