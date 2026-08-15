import type { UserInput } from "../../../interfaces/input.contracts.js";
import type { OperationInfo } from "../../../interfaces/output.contracts.js";
import type { Logger } from "../../../observability/logger.js";
import type { PlaywrightBrowser } from "../tools/types.js";
import type { CandidateScoringEvidence } from "./evidence.js";
import type { UrlScrapeCache } from "./scrape-cache.js";

export type OperationVerificationStatus = "OPEN" | "CLOSED" | "UNKNOWN";

export type OperationVerification = {
  status: OperationVerificationStatus;
  requestedDateISO: string;
  requestedTime24h: string;
  stayDurationMinutes: number;
  reason: string;
  sourceUrls: string[];
  confidence: number;
};

export type EnrichmentSourceName =
  | "multi-source"
  | "naver-map"
  | "kakao-local"
  | "naver-search"
  | "agentic-web"
  | "none";

export type UrlScrapeCacheMetadata = {
  status: "HIT" | "MISS" | "WRITE_SKIPPED" | "DISABLED";
  key?: string;
  path?: string;
  capturedAt?: string;
};

export type EnrichmentSourceDetail = {
  source: EnrichmentSourceName;
  status: OperationVerificationStatus;
  reason: string;
  sourceUrls: string[];
  confidence: number;
  identityMatchScore?: number;
  /**
   * 지도 entity와 후보 seed의 동일성을 다시 검증할 때 쓰는 구조화된 근거다.
   * source URL만 재사용하면 같은 상호의 다른 지점으로 잘못 연결될 수 있으므로,
   * 주소·좌표 기반 신호를 URL과 함께 보존한다.
   */
  referenceIdentity?: {
    nameScore: number;
    addressScore: number;
    distanceMeters?: number;
    identityScore: number;
    acceptedReason: string;
  };
  operationParser?: "deterministic" | "llm" | "none";
  operationParseReason?: string;
  sourceTextKind?: "snippet" | "scraped_page" | "agentic_fetch";
  rawTextSnippet?: string;
  scrapeCache?: UrlScrapeCacheMetadata;
};

/**
 * 식이 제약은 검색 결과 전체의 원문이 아니라, 후보 상호와 일치한 개별 네이버
 * 검색 결과에서만 보관한다. 이 값은 외부 출력 계약이 아닌 내부 semantic gate용
 * 증거이며, sourceUrl과 identityMatchScore를 함께 남겨 다른 장소의 리뷰가 섞인
 * 스니펫으로 후보를 통과시키지 않는다.
 */
export type DietaryConstraint = "VEGAN" | "VEGETARIAN" | "HALAL";

export type DietaryClaim = {
  constraint: DietaryConstraint;
  source: "naver-search";
  sourceUrl: string;
  identityMatchScore: number;
  matchedTerms: string[];
};

/**
 * 맥주/펍 요청은 일반 바·와인바와 구분해야 한다. 이 값도 합쳐진 스니펫이 아니라
 * 후보 상호가 일치한 단일 Naver Search 결과에서만 만든 내부 semantic gate 근거다.
 */
export type BeerVenueClaim = {
  source: "naver-search";
  sourceUrl: string;
  identityMatchScore: number;
  /** Same-name branches require an independently strong candidate-address match. */
  addressMatchScore: number;
  matchedTerms: string[];
};

/**
 * 가격 상한 gate가 읽는 내부 provenance다. 합쳐진 스니펫이나 카테고리 추정 가격은
 * 후보별 메뉴 가격이 아니므로 여기에 넣지 않는다. 단일 Naver Search item에서 후보
 * 상호와 주소가 함께 확인되고 실제 가격 표기가 있을 때만 만든다.
 */
export type VerifiedPriceClaim = {
  source: "naver-search";
  sourceUrl: string;
  identityMatchScore: number;
  addressMatchScore: number;
  minimumPrice: number;
};

export type CandidateEnrichment = {
  candidateId: string;
  source: EnrichmentSourceName;
  sourceUrls: string[];
  operationInfo?: OperationInfo;
  operationVerification: OperationVerification;
  trustSignals?: {
    naverRating?: number;
    kakaoRating?: number;
    naverVisitorReviewCount?: number;
    naverBlogReviewCount?: number;
    webMentionCount?: number;
    sourceAgreementCount?: number;
    placeMatchScore?: number;
  };
  priceRangePerPerson?: [number, number];
  rawTextSnippet?: string;
  scrapeCache?: UrlScrapeCacheMetadata;
  sourceDetails?: EnrichmentSourceDetail[];
  dietaryClaims?: DietaryClaim[];
  beerVenueClaims?: BeerVenueClaim[];
  verifiedPriceClaims?: VerifiedPriceClaim[];
};

export type CandidateEnrichmentRequest = {
  userInput: UserInput;
  evidences: CandidateScoringEvidence[];
};

export type CandidateEnrichmentClient = (
  request: CandidateEnrichmentRequest,
) => Promise<CandidateEnrichment[]>;

export type AgenticEnrichmentSource = "agentic" | "kakao-local" | "naver-search" | "naver-map";

export type AgenticWebEnrichmentToolEvent =
  | {
      type: "search";
      candidateId: string;
      query: string;
      resultCount: number;
      sourceUrls: string[];
    }
  | {
      type: "fetch";
      candidateId: string;
      url: string;
      cache: UrlScrapeCacheMetadata;
      textLength: number;
    }
  | {
      type: "lookup";
      candidateId: string;
      source: Exclude<AgenticEnrichmentSource, "agentic">;
      status: OperationVerificationStatus;
      sourceUrls: string[];
      placeMatchScore?: number;
    }
  | {
      type: "finalize";
      candidateId: string;
      source: AgenticEnrichmentSource;
      status: OperationVerificationStatus;
      reason: string;
      sourceUrls: string[];
      confidence: number;
    };

export type AgenticWebEnrichmentOptions = {
  modelId?: string;
  openAiApiKey?: string;
  kakaoRestApiKey?: string;
  clientId?: string;
  clientSecret?: string;
  maxCandidates?: number;
  maxConcurrency?: number;
  maxFetchesPerCandidate?: number;
  maxToolSteps?: number;
  timeoutMs?: number;
  fetchCache?: UrlScrapeCache;
  headless?: boolean;
  /**
   * 공유 브라우저 공급자. 주면 클라이언트가 브라우저를 직접 띄우거나 닫지 않는다.
   * 배치마다 Chromium을 새로 기동하면 1~3초씩 그냥 버려지므로 실행 1건당 하나만 쓴다.
   */
  getBrowser?: () => Promise<PlaywrightBrowser>;
  scrapeTimeoutMs?: number;
  scrapeSettleMs?: number;
  kakaoScrapeCache?: UrlScrapeCache;
  kakaoScrapePlaceDetails?: boolean;
  naverMapScrapeCache?: UrlScrapeCache;
  onToolEvent?: (event: AgenticWebEnrichmentToolEvent) => void;
  logger?: Logger;
};
