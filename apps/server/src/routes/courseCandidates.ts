import {
  CourseCandidateSearchQuerySchema,
  createApiError,
  createApiResponse,
  type DirectSearchCourseCandidate,
  SearchCourseCandidatesResponseDataSchema,
} from "@monorepo/api-contracts";
import { Router } from "express";
import { z } from "zod";

import { asyncHandler } from "../lib/asyncHandler.js";
import { requireAuth } from "../middleware/auth.js";

const KakaoLocalDocumentSchema = z
  .object({
    id: z.string().trim().min(1),
    place_name: z.string().trim().min(1),
    category_name: z.string(),
    phone: z.string(),
    address_name: z.string(),
    road_address_name: z.string(),
    x: z.string(),
    y: z.string(),
    place_url: z.url(),
  })
  .passthrough();

const KakaoLocalResponseSchema = z
  .object({ documents: z.array(KakaoLocalDocumentSchema) })
  .passthrough();

export class KakaoCourseCandidateSearchError extends Error {
  readonly name = "KakaoCourseCandidateSearchError";
  readonly retryable: boolean;

  constructor(message: string, retryable: boolean, options?: ErrorOptions) {
    super(message, options);
    this.retryable = retryable;
  }
}

type SearchKakaoCourseCandidatesOptions = {
  readonly query: string;
  readonly kakaoRestApiKey: string;
  readonly lat?: number;
  readonly lng?: number;
  readonly signal?: AbortSignal;
};

export const searchKakaoCourseCandidates = async ({
  query,
  kakaoRestApiKey,
  lat,
  lng,
  signal,
}: SearchKakaoCourseCandidatesOptions): Promise<readonly DirectSearchCourseCandidate[]> => {
  const normalizedQuery = query.trim();
  if (normalizedQuery.length === 0) return [];

  const url = new URL("https://dapi.kakao.com/v2/local/search/keyword.json");
  url.searchParams.set("query", normalizedQuery);
  url.searchParams.set("size", "15");
  if (lat !== undefined && lng !== undefined) {
    url.searchParams.set("x", String(lng));
    url.searchParams.set("y", String(lat));
    url.searchParams.set("sort", "distance");
  }

  let response: Response;
  try {
    const timeoutSignal = AbortSignal.timeout(10_000);
    const requestSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
    response = await fetch(url, {
      headers: { Authorization: `KakaoAK ${kakaoRestApiKey}` },
      signal: requestSignal,
    });
  } catch (error: unknown) {
    if (signal?.aborted) throw error;
    throw new KakaoCourseCandidateSearchError("카카오 장소 검색에 연결하지 못했습니다.", true, {
      cause: error,
    });
  }

  if (!response.ok) {
    const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
    throw new KakaoCourseCandidateSearchError(
      `카카오 장소 검색이 실패했습니다. (${response.status})`,
      retryable,
    );
  }

  const parsed = KakaoLocalResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new KakaoCourseCandidateSearchError("카카오 장소 검색 응답을 해석하지 못했습니다.", false);
  }

  return parsed.data.documents.flatMap((item) => {
    const candidate = {
      source: "DIRECT_SEARCH" as const,
      kakaoPlaceId: item.id,
      name: item.place_name,
      address: item.road_address_name || item.address_name,
      roadAddress: item.road_address_name || null,
      category: item.category_name,
      lat: Number(item.y),
      lng: Number(item.x),
      ...(item.phone ? { phone: item.phone } : {}),
      ...(item.place_url ? { placeUrl: item.place_url } : {}),
    };
    return Number.isFinite(candidate.lat) && Number.isFinite(candidate.lng) && candidate.address
      ? [candidate]
      : [];
  });
};

export const createCourseCandidatesRouter = (kakaoRestApiKey: string): Router => {
  const router = Router();

  router.get(
    "/search",
    requireAuth,
    asyncHandler(async (req, res) => {
      const queryValue = req.query.query ?? req.query.q;
      const rawQuery = typeof queryValue === "string" ? queryValue.trim() : "";
      if (rawQuery.length === 0) {
        res
          .status(200)
          .json(createApiResponse(SearchCourseCandidatesResponseDataSchema.parse({ items: [] })));
        return;
      }
      const parsed = CourseCandidateSearchQuerySchema.safeParse({
        query: rawQuery,
        ...(req.query.lat !== undefined ? { lat: req.query.lat } : {}),
        ...(req.query.lng !== undefined ? { lng: req.query.lng } : {}),
      });
      if (!parsed.success) {
        res.status(400).json(createApiError("invalid input"));
        return;
      }

      try {
        const items = await searchKakaoCourseCandidates({
          query: parsed.data.query,
          kakaoRestApiKey,
          lat: parsed.data.lat,
          lng: parsed.data.lng,
        });
        res.status(200).json(
          createApiResponse(SearchCourseCandidatesResponseDataSchema.parse({ items })),
        );
      } catch (error: unknown) {
        if (error instanceof KakaoCourseCandidateSearchError) {
          res.status(error.retryable ? 503 : 502).json(createApiError(error.message));
          return;
        }
        throw error;
      }
    }),
  );

  return router;
};

export default createCourseCandidatesRouter;
