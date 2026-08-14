import type {
  CourseCandidateDecision,
  CreateCourseRequest,
  CreateCourseV2Request,
  DirectSearchCourseCandidate,
} from "@monorepo/api-contracts";
import type { CourseInput } from "@monorepo/course-recommendation-engine";
import {
  PlaceRecommendationItemSchema,
  type PlaceRecommendationItem,
} from "@monorepo/recommendation-engine/v1/contracts";
import { and, eq, inArray } from "drizzle-orm";

import { db } from "../db/client.js";
import { savedPlaces } from "../db/schema.js";
import {
  KakaoCourseCandidateSearchError,
  searchKakaoCourseCandidates,
} from "../routes/courseCandidates.js";

const DAYS = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
] as const;

export const COURSE_CANDIDATE_DECISION_CODES = [
  "INCLUDED",
  "DUPLICATE",
  "UNAVAILABLE_AT_TIME",
  "OUTSIDE_TRAVEL_BUDGET",
  "DURATION_LIMIT",
  "LOOKUP_UNAVAILABLE",
  "NOT_IN_TOP_COMBINATION",
] as const;

export type CourseCandidateDecisionCode = (typeof COURSE_CANDIDATE_DECISION_CODES)[number];

export type ResolvedCandidateSource = {
  readonly source: "SAVED_PLACE" | "DIRECT_SEARCH";
  readonly candidateIndex: number;
  readonly candidateKey: string;
  readonly candidateId: string;
  readonly savedPlaceId: string | null;
  readonly kakaoPlaceId: string | null;
  readonly place: PlaceRecommendationItem;
};

export type CandidateResolutionDecision = CourseCandidateDecision;

export type ResolvedCourseCandidates = {
  readonly engineInput: CourseInput | null;
  readonly candidates: readonly ResolvedCandidateSource[];
  readonly decisions: readonly CandidateResolutionDecision[];
};

export class CourseCandidateResolutionError extends Error {
  readonly name = "CourseCandidateResolutionError";
  readonly code:
    | "COURSE_CANDIDATE_NOT_FOUND"
    | "COURSE_CANDIDATE_LOOKUP_UNAVAILABLE"
    | "COURSE_ENGINE_UNAVAILABLE";
  readonly retryable: boolean;

  constructor(
    message: string,
    retryable: boolean,
    options?: ErrorOptions & {
      readonly code?: CourseCandidateResolutionError["code"];
    },
  ) {
    super(message, options);
    this.code = options?.code ?? "COURSE_ENGINE_UNAVAILABLE";
    this.retryable = retryable;
  }
}

const isV2Request = (input: CreateCourseRequest): input is CreateCourseV2Request =>
  "version" in input && input.version === 2 && "candidates" in input;

const toKakaoPlaceId = (place: PlaceRecommendationItem): string | null => {
  const match = /place\.map\.kakao\.com\/(\d+)/u.exec(place.referenceUrls.kakaoMap ?? "");
  return match?.[1] ?? null;
};

const unknownOperationInfo = (): PlaceRecommendationItem["operationInfo"] => ({
  timezone: "Asia/Seoul",
  schedules: Object.fromEntries(DAYS.map((day) => [day, { status: "UNKNOWN" }])) as PlaceRecommendationItem["operationInfo"]["schedules"],
});

const categoryLabels = (category: string): { main: string; sub: string } => {
  const labels = category
    .split(">")
    .map((label) => label.trim())
    .filter(Boolean);
  return {
    main: labels[0] ?? "분류 미확인",
    sub: labels.at(-1) ?? "분류 미확인",
  };
};

const estimatedPriceRange = (category: string): readonly [number, number] => {
  if (/카페|커피/u.test(category)) return [5_000, 15_000];
  if (/주점|술집|바(?:\s|$)/u.test(category)) return [15_000, 35_000];
  if (/음식점|식당|한식|중식|일식|양식/u.test(category)) return [10_000, 30_000];
  return [10_000, 30_000];
};

export const toUnknownPlaceRecommendationItem = (
  candidate: Omit<DirectSearchCourseCandidate, "source">,
  schedule: { readonly date: string; readonly startTime: string },
): PlaceRecommendationItem => {
  const category = categoryLabels(candidate.category);
  return PlaceRecommendationItemSchema.parse({
    id: `kakao:${candidate.kakaoPlaceId}`,
    name: candidate.name,
    phoneNumber: candidate.phone ?? null,
    tags: [category.sub],
    contentSummary: `${candidate.name} — 사용자가 직접 선택한 후보`,
    mainCategory: category.main,
    subCategory: category.sub,
    operationInfo: unknownOperationInfo(),
    availabilityAtRequestedTime: {
      status: "UNKNOWN",
      requestedDateISO: schedule.date,
      requestedTime24h: schedule.startTime,
      stayDurationMinutes: 60,
      reason: "영업시간을 확인하지 못해 방문 가능 여부를 알 수 없어요.",
    },
    referenceUrls: {
      kakaoMap: candidate.placeUrl ?? `https://place.map.kakao.com/${candidate.kakaoPlaceId}`,
    },
    accessibility: { score: 50, perOrigin: [] },
    location: {
      lat: candidate.lat,
      lng: candidate.lng,
      placeName: candidate.name,
      roadAddressKo: candidate.address,
    },
    priceRangePerPerson: estimatedPriceRange(candidate.category),
    score: 50,
    scoreBreakdown: {
      inputMatch: 50,
      trust: 50,
      accessibility: 50,
      diversity: 50,
      total: 50,
    },
    reasons: ["사용자가 코스 후보로 직접 선택했어요."],
  });
};

export const refreshSavedPlaceSchedule = (
  place: PlaceRecommendationItem,
  schedule: { readonly date: string; readonly startTime: string },
): PlaceRecommendationItem =>
  PlaceRecommendationItemSchema.parse({
    ...place,
    availabilityAtRequestedTime: {
      ...place.availabilityAtRequestedTime,
      status: "UNKNOWN",
      requestedDateISO: schedule.date,
      requestedTime24h: schedule.startTime,
      reason: "저장 후 일정이 변경되어 이번 방문 가능 여부는 코스 엔진에서 다시 확인해요.",
    },
  });

export const assertOwnedSavedCandidates = async (
  userId: string,
  input: CreateCourseRequest,
): Promise<void> => {
  if (!isV2Request(input)) return;
  const ids = [...new Set(input.candidates.flatMap((candidate) =>
    candidate.source === "SAVED_PLACE" ? [candidate.savedPlaceId] : [],
  ))];
  if (ids.length === 0) return;

  const owned = await db
    .select({ id: savedPlaces.id })
    .from(savedPlaces)
    .where(and(eq(savedPlaces.userId, userId), inArray(savedPlaces.id, ids)));
  if (owned.length !== ids.length) {
    throw new CourseCandidateResolutionError("저장한 장소를 찾을 수 없어요.", false, {
      code: "COURSE_CANDIDATE_NOT_FOUND",
    });
  }
};

type ResolveCourseCandidatesOptions = {
  readonly kakaoRestApiKey: string;
  readonly signal: AbortSignal;
  readonly onProgress: (step: "resolving_candidates" | "enriching_places") => void;
  readonly verifyDirectSearch?: boolean;
};

export const resolveCourseCandidates = async (
  input: CreateCourseRequest,
  userId: string,
  options: ResolveCourseCandidatesOptions,
): Promise<ResolvedCourseCandidates> => {
  const schedule = { date: input.date, startTime: input.startTime };
  options.onProgress("resolving_candidates");

  const resolved: ResolvedCandidateSource[] = [];
  const decisions: CandidateResolutionDecision[] = [];

  if (isV2Request(input)) {
    const savedIds = [...new Set(input.candidates.flatMap((candidate) =>
      candidate.source === "SAVED_PLACE" ? [candidate.savedPlaceId] : [],
    ))];
    const savedRows = savedIds.length === 0
      ? []
      : await db
          .select()
          .from(savedPlaces)
          .where(and(eq(savedPlaces.userId, userId), inArray(savedPlaces.id, savedIds)));
    const savedById = new Map(savedRows.map((row) => [row.id, row]));

    options.onProgress("enriching_places");
    for (const [candidateIndex, candidate] of input.candidates.entries()) {
      if (options.signal.aborted) throw new DOMException("Course recommendation cancelled", "AbortError");

      if (candidate.source === "SAVED_PLACE") {
        const row = savedById.get(candidate.savedPlaceId);
        const parsed = row ? PlaceRecommendationItemSchema.safeParse(row.placeData) : null;
        if (!row || !parsed?.success) {
          decisions.push({
            candidateIndex,
            candidateKey: `saved:${candidate.savedPlaceId}`,
            source: "SAVED_PLACE",
            savedPlaceId: candidate.savedPlaceId,
            kakaoPlaceId: null,
            name: "저장한 장소",
            decision: "LOOKUP_UNAVAILABLE",
            message: "저장한 장소의 최신 정보를 불러오지 못했어요.",
          });
          continue;
        }
        const place = refreshSavedPlaceSchedule(parsed.data, schedule);
        resolved.push({
          source: "SAVED_PLACE",
          candidateIndex,
          candidateKey: `saved:${candidate.savedPlaceId}`,
          candidateId: candidate.savedPlaceId,
          savedPlaceId: candidate.savedPlaceId,
          kakaoPlaceId: toKakaoPlaceId(place),
          place,
        });
        continue;
      }

      let exact: DirectSearchCourseCandidate | undefined;
      if (options.verifyDirectSearch === false) {
        exact = candidate;
      } else {
        try {
          const matches = await searchKakaoCourseCandidates({
            query: candidate.name,
            kakaoRestApiKey: options.kakaoRestApiKey,
            lat: candidate.lat,
            lng: candidate.lng,
            signal: options.signal,
          });
          exact = matches.find((match) => match.kakaoPlaceId === candidate.kakaoPlaceId);
        } catch (error: unknown) {
          if (options.signal.aborted) throw error;
          if (error instanceof KakaoCourseCandidateSearchError) {
            throw new CourseCandidateResolutionError(error.message, error.retryable, {
              cause: error,
              code: "COURSE_CANDIDATE_LOOKUP_UNAVAILABLE",
            });
          }
          throw error;
        }
      }
      if (!exact) {
        decisions.push({
          candidateIndex,
          candidateKey: `kakao:${candidate.kakaoPlaceId}`,
          source: "DIRECT_SEARCH",
          savedPlaceId: null,
          kakaoPlaceId: candidate.kakaoPlaceId,
          name: candidate.name,
          decision: "LOOKUP_UNAVAILABLE",
          message: "카카오에서 같은 장소를 다시 확인하지 못했어요.",
        });
        continue;
      }
      resolved.push({
        source: "DIRECT_SEARCH",
        candidateIndex,
        candidateKey: `kakao:${candidate.kakaoPlaceId}`,
        candidateId: candidate.kakaoPlaceId,
        savedPlaceId: null,
        kakaoPlaceId: candidate.kakaoPlaceId,
        place: toUnknownPlaceRecommendationItem(exact, schedule),
      });
    }
  } else {
    options.onProgress("enriching_places");
    for (const [candidateIndex, place] of input.places.entries()) {
      resolved.push({
        source: "DIRECT_SEARCH",
        candidateIndex,
        candidateKey: `kakao:${place.kakaoPlaceId}`,
        candidateId: place.kakaoPlaceId,
        savedPlaceId: null,
        kakaoPlaceId: place.kakaoPlaceId,
        place: toUnknownPlaceRecommendationItem(
          {
            kakaoPlaceId: place.kakaoPlaceId,
            name: place.name,
            address: place.address ?? "주소 정보 미확인",
            category: place.category ?? "분류 미확인",
            lat: place.lat,
            lng: place.lng,
          },
          schedule,
        ),
      });
    }
  }

  const unique: ResolvedCandidateSource[] = [];
  const indexByCanonicalId = new Map<string, number>();
  for (const candidate of resolved) {
    const canonicalId = candidate.kakaoPlaceId
      ? `kakao:${candidate.kakaoPlaceId}`
      : `place:${candidate.place.id}`;
    const existingIndex = indexByCanonicalId.get(canonicalId);
    if (existingIndex === undefined) {
      indexByCanonicalId.set(canonicalId, unique.length);
      unique.push(candidate);
      continue;
    }

    const existing = unique[existingIndex];
    if (existing && existing.source !== "SAVED_PLACE" && candidate.source === "SAVED_PLACE") {
      decisions.push({
        candidateIndex: existing.candidateIndex,
        candidateKey: existing.candidateKey,
        source: existing.source,
        savedPlaceId: existing.savedPlaceId,
        kakaoPlaceId: existing.kakaoPlaceId,
        name: existing.place.name,
        decision: "DUPLICATE",
        message: "같은 장소가 저장 목록에도 있어 저장한 장소 정보로 한 번만 반영했어요.",
      });
      unique[existingIndex] = candidate;
      continue;
    }
    decisions.push({
      candidateIndex: candidate.candidateIndex,
      candidateKey: candidate.candidateKey,
      source: candidate.source,
      savedPlaceId: candidate.savedPlaceId,
      kakaoPlaceId: candidate.kakaoPlaceId,
      name: candidate.place.name,
      decision: "DUPLICATE",
      message: "같은 장소가 이미 후보에 있어 한 번만 반영했어요.",
    });
  }

  if (unique.length < 2) {
    return { engineInput: null, candidates: unique, decisions };
  }

  return {
    engineInput: {
      dateISO: input.date,
      startTime24h: input.startTime,
      totalDurationMinutes: input.durationHours * 60,
      places: unique.map((candidate) => candidate.place),
      numberOfPeople: isV2Request(input) ? input.numberOfPeople : 2,
      ...(isV2Request(input) && input.budgetPerPersonWon !== undefined
        ? { budgetPerPersonWon: input.budgetPerPersonWon }
        : {}),
      pacePreference: isV2Request(input) ? (input.pacePreference ?? "NORMAL") : "NORMAL",
    },
    candidates: unique,
    decisions,
  };
};
