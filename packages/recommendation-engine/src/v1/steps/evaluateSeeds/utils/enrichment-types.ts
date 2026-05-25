import type { UserInput } from "../../../interfaces/input.contracts.js";
import type { OperationInfo } from "../../../interfaces/output.contracts.js";
import type { Logger } from "../../../observability/logger.js";
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
  operationParser?: "deterministic" | "llm" | "none";
  operationParseReason?: string;
  sourceTextKind?: "snippet" | "scraped_page" | "agentic_fetch";
  rawTextSnippet?: string;
  scrapeCache?: UrlScrapeCacheMetadata;
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
};

export type CandidateEnrichmentRequest = {
  userInput: UserInput;
  evidences: CandidateScoringEvidence[];
};

export type CandidateEnrichmentClient = (
  request: CandidateEnrichmentRequest,
) => Promise<CandidateEnrichment[]>;

export type AgenticEnrichmentSource =
  | "agentic"
  | "kakao-local"
  | "naver-search"
  | "naver-map";

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
  scrapeTimeoutMs?: number;
  scrapeSettleMs?: number;
  kakaoScrapeCache?: UrlScrapeCache;
  kakaoScrapePlaceDetails?: boolean;
  naverMapScrapeCache?: UrlScrapeCache;
  onToolEvent?: (event: AgenticWebEnrichmentToolEvent) => void;
  logger?: Logger;
};
