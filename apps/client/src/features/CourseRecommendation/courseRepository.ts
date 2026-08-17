import type {
  CourseCandidateDecision as ApiCourseCandidateDecision,
  CourseOptionAnyDetail,
  CourseOptionAnySummary,
  CourseResult,
  CreateCourseRequest,
  CreateCourseV2Request,
  ListFavoriteCourseOptionsV2ResponseData,
} from "@monorepo/api-contracts";

import {
  cancelCourse,
  createCourse,
  deleteCourse,
  getBookmarkedCourseOptions,
  getCourse,
  getCourseOption,
  getCourses,
  removeSavedCourseBookmark,
  renameCourse,
  searchCourseCandidates,
  setCourseOptionBookmark,
} from "../../apis/server/courses";
import { getSavedPlaces, type SavedRecommendationPlace } from "../../apis/server/savedPlaces";
import type {
  CourseCandidateDecision,
  CourseDraft,
  CourseOption,
  CoursePlace,
  CourseRecommendation,
  CourseRecommendationRepository,
} from "./course.types";

const KAKAO_PLACE_ID_PATTERN = /place\.map\.kakao\.com\/(\d+)/u;

const toLegacyPlace = (place: {
  readonly source: "FAVORITE" | "KAKAO";
  readonly kakaoPlaceId: string;
  readonly favoritePlaceId?: string | null;
  readonly name: string;
  readonly address?: string | null;
  readonly category?: string | null;
  readonly lat: number;
  readonly lng: number;
}): CoursePlace => ({
  // `favoritePlaceId` belongs to the retired favorite_places table. It is not a
  // saved_places id, so legacy rows retry as a direct snapshot instead of a bad FK.
  source: "DIRECT_SEARCH",
  kakaoPlaceId: place.kakaoPlaceId,
  id: `DIRECT_SEARCH:${place.kakaoPlaceId}`,
  name: place.name,
  address: place.address ?? "주소 정보 없음",
  category: place.category ?? "분류 정보 없음",
  lat: place.lat,
  lng: place.lng,
});

export const toSavedCoursePlace = (savedPlace: SavedRecommendationPlace): CoursePlace => {
  const place = savedPlace.placeData;
  const kakaoPlaceUrl = place.referenceUrls.kakaoMap;
  const kakaoPlaceId = kakaoPlaceUrl
    ? (KAKAO_PLACE_ID_PATTERN.exec(kakaoPlaceUrl)?.[1] ?? undefined)
    : undefined;

  return {
    id: savedPlace.id,
    source: "SAVED_PLACE",
    savedPlaceId: savedPlace.id,
    ...(kakaoPlaceId ? { kakaoPlaceId } : {}),
    name: place.name,
    address: place.location.roadAddressKo,
    category: place.subCategory || place.mainCategory,
    lat: place.location.lat,
    lng: place.location.lng,
    ...(place.phoneNumber ? { phone: place.phoneNumber } : {}),
    ...(kakaoPlaceUrl ? { placeUrl: kakaoPlaceUrl } : {}),
  };
};

export const toCourseDraft = (input: CreateCourseRequest): CourseDraft => {
  if ("candidates" in input) {
    return {
      places: input.candidates.map((candidate) =>
        candidate.source === "SAVED_PLACE"
          ? {
              id: candidate.savedPlaceId,
              source: "SAVED_PLACE",
              savedPlaceId: candidate.savedPlaceId,
              name: "저장한 장소",
              address: "",
              category: "",
              lat: 0,
              lng: 0,
            }
          : {
              id: `DIRECT_SEARCH:${candidate.kakaoPlaceId}`,
              source: "DIRECT_SEARCH",
              kakaoPlaceId: candidate.kakaoPlaceId,
              name: candidate.name,
              address: candidate.address,
              category: candidate.category,
              lat: candidate.lat,
              lng: candidate.lng,
              ...(candidate.phone ? { phone: candidate.phone } : {}),
              ...(candidate.placeUrl ? { placeUrl: candidate.placeUrl } : {}),
            },
      ),
      date: input.date,
      startTime: input.startTime,
      durationHours: input.durationHours,
      numberOfPeople: input.numberOfPeople,
      ...(input.budgetPerPersonWon !== undefined
        ? { budgetPerPersonWon: input.budgetPerPersonWon }
        : {}),
      pacePreference: input.pacePreference,
    };
  }

  return {
    places: input.places.map(toLegacyPlace),
    date: input.date,
    startTime: input.startTime,
    durationHours: input.durationHours,
    numberOfPeople: 2,
    pacePreference: "NORMAL",
  };
};

const toDecision = (decision: ApiCourseCandidateDecision): CourseCandidateDecision => ({
  candidateId: decision.candidateKey,
  candidateName: decision.name ?? "선택한 장소",
  code: decision.decision,
  message: decision.message,
});

const isV2Option = (
  option: CourseOptionAnySummary | CourseOptionAnyDetail,
): option is Extract<CourseOptionAnySummary, { rank: number }> => "rank" in option;

const toOption = (
  option: CourseOptionAnySummary | CourseOptionAnyDetail,
  fallbackRank = 1,
): CourseOption => {
  if (isV2Option(option)) {
    return {
      id: option.id,
      courseId: option.courseId,
      rank: option.rank,
      type: option.courseType.label,
      courseType: option.courseType,
      title: option.title,
      reason: option.selection.reasonTexts.join(" "),
      reasonTexts: option.selection.reasonTexts,
      tradeoffs: option.selection.tradeoffs,
      totalDurationMinutes: option.totalDurationMinutes,
      totalTravelMinutes: option.totalTravelMinutes,
      totalStayMinutes: option.totalStayMinutes,
      startTime: option.startTime,
      endTime: option.endTime,
      pricePerPersonWon: option.pricePerPersonWon,
      estimatedCostPerPerson: option.estimatedCostPerPerson,
      mealPlan: option.mealPlan,
      candidateDecisions: option.candidateDecisions.map(toDecision),
      isBookmarked: option.isFavorite,
      routePath: option.routePath,
      routePathSource: option.routePathSource,
      legacy: false,
      stops: option.stops.map((stop) => ({
        id: stop.id,
        source: stop.source,
        ...(stop.kakaoPlaceId ? { kakaoPlaceId: stop.kakaoPlaceId } : {}),
        ...(stop.savedPlaceId ? { savedPlaceId: stop.savedPlaceId } : {}),
        name: stop.name,
        address: stop.address ?? "주소 정보 없음",
        category: stop.categoryLabel,
        lat: stop.lat,
        lng: stop.lng,
        ...(stop.kakaoPlaceUrl ? { placeUrl: stop.kakaoPlaceUrl } : {}),
        visitTime: stop.visitTime,
        stayMinutes: stop.stayMinutes,
        activityLabel: stop.activityLabel ?? stop.mainCategory,
        travelMinutesFromPrevious: stop.travelMinutesFromPrevious,
        waitMinutesFromPrevious: stop.waitMinutesFromPrevious,
      })),
    };
  }

  const totalStayMinutes = option.stops.reduce((sum, stop) => sum + stop.stayMinutes, 0);
  const firstVisitTime = option.stops[0]?.visitTime ?? "";
  return {
    id: option.id,
    courseId: option.courseId,
    rank: fallbackRank,
    type: option.type,
    courseType: {
      key: "LEGACY",
      label: option.type,
      description: "이전 추천 방식으로 생성된 코스입니다.",
    },
    title: `${option.type} 코스`,
    reason: "reason" in option && option.reason ? option.reason : "이전 추천 결과입니다.",
    reasonTexts: ["reason" in option && option.reason ? option.reason : "이전 추천 결과입니다."],
    tradeoffs: [],
    totalDurationMinutes: option.totalDurationMinutes,
    totalTravelMinutes: option.totalTravelMinutes,
    totalStayMinutes,
    startTime: firstVisitTime,
    endTime: "",
    pricePerPersonWon: option.pricePerPersonWon,
    estimatedCostPerPerson: {
      min: option.pricePerPersonWon,
      max: option.pricePerPersonWon,
      quality: "ESTIMATED",
    },
    candidateDecisions: [],
    isBookmarked: option.isFavorite,
    routePath: option.routePath,
    routePathSource: "ORDER_ONLY",
    legacy: true,
    stops: option.stops.map((stop) => ({
      ...toLegacyPlace(stop),
      visitTime: stop.visitTime,
      stayMinutes: stop.stayMinutes,
      activityLabel: stop.activityLabel ?? "방문",
      travelMinutesFromPrevious: 0,
      waitMinutesFromPrevious: 0,
    })),
  };
};

const toRecommendation = (course: CourseResult): CourseRecommendation => {
  const isV2 = course.version === 2;
  const failure = isV2 ? course.failure : null;
  return {
    id: course.id,
    historyId: course.id,
    status: course.status,
    input: course.input,
    options: course.options
      .map((option, index) => toOption(option, index + 1))
      .sort((left, right) => left.rank - right.rank || left.id.localeCompare(right.id)),
    candidateDecisions: isV2 ? course.candidateDecisions.map(toDecision) : [],
    ...(failure?.message || course.errorMessage
      ? { errorMessage: failure?.message ?? course.errorMessage ?? undefined }
      : {}),
    ...(failure?.code || course.errorCode
      ? { errorCode: failure?.code ?? course.errorCode ?? undefined }
      : {}),
    ...(failure ? { retryable: failure.retryable } : {}),
    legacy: !isV2,
  };
};

export const toCreateCourseV2Request = (draft: CourseDraft): CreateCourseV2Request => ({
  version: 2,
  candidates: draft.places.map((place) =>
    place.source === "SAVED_PLACE" && place.savedPlaceId
      ? { source: "SAVED_PLACE", savedPlaceId: place.savedPlaceId }
      : {
          source: "DIRECT_SEARCH",
          kakaoPlaceId: place.kakaoPlaceId ?? "",
          name: place.name,
          address: place.address,
          category: place.category,
          lat: place.lat,
          lng: place.lng,
          ...(place.phone ? { phone: place.phone } : {}),
          ...(place.placeUrl ? { placeUrl: place.placeUrl } : {}),
        },
  ),
  date: draft.date,
  startTime: draft.startTime,
  durationHours: draft.durationHours,
  numberOfPeople: draft.numberOfPeople,
  ...(draft.budgetPerPersonWon !== undefined
    ? { budgetPerPersonWon: draft.budgetPerPersonWon }
    : {}),
  pacePreference: draft.pacePreference,
});

const isV2FavoritesResponse = (value: {
  readonly options: readonly unknown[];
  readonly version?: number;
}): value is ListFavoriteCourseOptionsV2ResponseData => value.version === 2;

export const courseRepository: CourseRecommendationRepository = {
  listPickerPlaces: async (query, source) => {
    if (source === "SAVED_PLACE") {
      const response = await getSavedPlaces();
      if (!response.success) throw new Error(response.error);
      return response.data.savedPlaces.map(toSavedCoursePlace);
    }

    const response = await searchCourseCandidates({ query });
    if (!response.success) throw new Error(response.error);
    return response.data.items.map((place) => ({
      id: `DIRECT_SEARCH:${place.kakaoPlaceId}`,
      source: "DIRECT_SEARCH",
      kakaoPlaceId: place.kakaoPlaceId,
      name: place.name,
      address: place.roadAddress || place.address || "주소 정보 없음",
      category: place.category || "분류 정보 없음",
      lat: place.lat,
      lng: place.lng,
      ...(place.phone ? { phone: place.phone } : {}),
      ...(place.placeUrl ? { placeUrl: place.placeUrl } : {}),
    }));
  },
  startRecommendation: async (draft) => {
    const input = toCreateCourseV2Request(draft);
    const response = await createCourse(input);
    if (!response.success) throw new Error(response.error);
    return {
      id: response.data.courseId,
      historyId: response.data.courseId,
      status: "PENDING",
      input,
      options: [],
      candidateDecisions: [],
      legacy: false,
    };
  },
  getRecommendation: async (id) => {
    const response = await getCourse(id);
    if (!response.success) throw new Error(response.error);
    return toRecommendation(response.data);
  },
  getOption: async (courseId, optionId) => {
    const response = await getCourseOption(courseId, optionId);
    if (!response.success) throw new Error(response.error);
    return toOption(response.data);
  },
  listHistory: async () => {
    const response = await getCourses();
    if (!response.success) throw new Error(response.error);
    return response.data.items.map((item) => ({
      id: item.id,
      title: item.title ?? "새 코스 추천",
      status: item.status,
      requestedAt: item.requestedAt,
      recommendationId: item.id,
      optionCount: item.optionCount ?? undefined,
      ...(item.legacy === true ? { legacy: true } : {}),
    }));
  },
  renameHistory: async (id, title) => {
    const response = await renameCourse(id, title);
    if (!response.success) throw new Error(response.error);
    return true;
  },
  deleteHistory: async (id) => {
    const response = await deleteCourse(id);
    if (!response.success) throw new Error(response.error);
    return true;
  },
  cancelPendingHistory: async (id) => {
    const response = await cancelCourse(id);
    if (!response.success) throw new Error(response.error);
    return true;
  },
  listBookmarks: async () => {
    const response = await getBookmarkedCourseOptions();
    if (!response.success) throw new Error(response.error);
    if (isV2FavoritesResponse(response.data)) {
      return response.data.options.map((saved) => ({
        savedOptionId: saved.id,
        sourceCourseOptionId: saved.sourceCourseOptionId,
        optionId: saved.sourceCourseOptionId ?? saved.option.id,
        recommendationId: saved.option.courseId,
        savedAt: saved.savedAt,
        option: toOption(saved.option),
      }));
    }
    return response.data.options.map((option) => ({
      optionId: option.id,
      recommendationId: option.courseId,
      savedAt: null,
      option: toOption(option),
    }));
  },
  toggleBookmark: async (_courseId, optionId, bookmarked) => {
    const response = await setCourseOptionBookmark(optionId, bookmarked);
    if (!response.success) throw new Error(response.error);
    return response.data.favorite;
  },
  removeBookmark: async (bookmark) => {
    const response = bookmark.sourceCourseOptionId
      ? await setCourseOptionBookmark(bookmark.sourceCourseOptionId, false)
      : bookmark.savedOptionId
        ? await removeSavedCourseBookmark(bookmark.savedOptionId)
        : await setCourseOptionBookmark(bookmark.optionId, false);
    if (!response.success) throw new Error(response.error);
    return true;
  },
};
