import ky from "ky";

import { parseOperationInfoWithLlmFallback } from "../../llm/operation-info.js";
import { unique } from "../../utils/enrichment-merge.js";
import type { CandidateEnrichment } from "../../utils/enrichment-types.js";
import type { CandidateScoringEvidence } from "../../utils/evidence.js";
import { type OperationVerifier, stripSearchMarkup } from "../../utils/operation-hours.js";
import { inferPriceRangePerPersonFromText } from "../../utils/price.js";
import { isUsableEvidenceUrl } from "../../utils/source-url.js";
import { DEFAULT_EXTERNAL_API_TIMEOUT_MS, NAVER_SEARCH_API_BASE_URL } from "../shared/constants.js";
import { buildPlaceLookupQuery, scoreTextMatch } from "../shared/place-match.js";
import type { NaverSearchCredentials } from "../types.js";
import {
  type NaverSearchItem,
  type NaverSearchResponse,
  NaverSearchResponseSchema,
} from "./naver-search.contracts.js";

const MIN_NAVER_SEARCH_IDENTITY_SCORE = 0.75;

export const enrichWithNaverSearch = async (
  evidence: CandidateScoringEvidence,
  operationVerifier: OperationVerifier,
  credentials: NaverSearchCredentials,
): Promise<CandidateEnrichment> => {
  const query = `${buildPlaceLookupQuery(evidence)} 영업시간`;
  const [blog, web] = await Promise.all([
    searchNaver("blog", query, credentials),
    searchNaver("webkr", query, credentials),
  ]);
  const allItems = [...blog.items, ...web.items];
  const matchedItems = allItems
    .map((item) => ({
      item,
      score: scoreNaverSearchItem(item, evidence),
    }))
    .filter((match) => match.score >= 0.35)
    .sort((a, b) => b.score - a.score);
  const itemsForEvidence = matchedItems
    .filter((match) => match.score >= MIN_NAVER_SEARCH_IDENTITY_SCORE)
    .map((match) => match.item);
  const sourceUrls = unique(
    itemsForEvidence
      .map((item) => item.link)
      .filter((link): link is string => Boolean(link) && isUsableEvidenceUrl(link)),
  );
  const text = itemsForEvidence
    .map((item) => [item.title, item.description].map(stripSearchMarkup).join("\n"))
    .join("\n");
  const operationParse = await parseOperationInfoWithLlmFallback({
    text,
    openAiApiKey: credentials.openAiApiKey,
    evidence,
    operationVerifier,
    sourceName: "naver-search",
    sourceTextKind: "snippet",
  });
  const operationInfo = operationParse.operationInfo;
  const operationVerification = operationInfo
    ? operationVerifier.verify(operationInfo, sourceUrls)
    : operationVerifier.unknown({
        reason: matchedItems.length
          ? operationParse.reason
          : "Naver Search returned no identity-matching snippets",
        sourceUrls,
        confidence: sourceUrls.length > 0 ? 0.2 : 0,
      });
  const bestIdentityScore = matchedItems[0]?.score ?? 0;

  return {
    candidateId: evidence.candidateId,
    source: "naver-search",
    sourceUrls,
    operationInfo,
    operationVerification,
    trustSignals: {
      naverBlogReviewCount: blog.total,
      webMentionCount: itemsForEvidence.length,
      sourceAgreementCount: sourceUrls.length > 0 ? 1 : 0,
      placeMatchScore: bestIdentityScore,
    },
    priceRangePerPerson: inferPriceRangePerPersonFromText(text, evidence.category),
    rawTextSnippet: text.slice(0, 2_000),
    sourceDetails: [
      {
        source: "naver-search",
        status: operationVerification.status,
        reason: operationVerification.reason,
        sourceUrls,
        confidence: operationVerification.confidence,
        identityMatchScore: bestIdentityScore,
        operationParser: operationParse.parser,
        operationParseReason: operationParse.reason,
        sourceTextKind: "snippet",
        rawTextSnippet: text.slice(0, 700),
      },
    ],
  };
};

const scoreNaverSearchItem = (
  item: NaverSearchItem,
  evidence: CandidateScoringEvidence,
): number => {
  const text = [item.title, item.description].map(stripSearchMarkup).join(" ");
  const nameScore = scoreTextMatch(text, evidence.name);
  const addressScore = Math.max(
    scoreTextMatch(text, evidence.placeInfo.roadAddress),
    scoreTextMatch(text, evidence.placeInfo.address),
  );
  return Math.max(nameScore, nameScore * 0.75 + addressScore * 0.25);
};

export const searchNaver = async (
  type: "blog" | "webkr",
  query: string,
  { clientId, clientSecret, abortSignal }: NaverSearchCredentials,
): Promise<NaverSearchResponse> => {
  const searchParams: Record<string, string | number> = {
    query,
    display: 5,
    start: 1,
  };
  if (type === "blog") searchParams.sort = "sim";

  const response = await ky
    .get(`${NAVER_SEARCH_API_BASE_URL}/${type}.json`, {
      timeout: DEFAULT_EXTERNAL_API_TIMEOUT_MS,
      signal: abortSignal,
      searchParams,
      headers: {
        "X-Naver-Client-Id": clientId,
        "X-Naver-Client-Secret": clientSecret,
      },
    })
    .json<unknown>();
  return NaverSearchResponseSchema.parse(response);
};
