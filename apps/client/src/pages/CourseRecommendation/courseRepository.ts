import { searchLocationsByKeyword } from "../../apis/kakao/searchPlaces";
import {
  cancelCourse,
  createCourse,
  deleteCourse,
  getCourse,
  getCourseOption,
  getCourses,
  getFavoriteCourseOptions,
  renameCourse,
  setCourseOptionFavorite,
} from "../../apis/server/courses";
import { getFavoritePlaces } from "../../apis/server/favoritePlaces";
import type {
  CourseFavorite,
  CourseHistoryItem,
  CourseOption,
  CoursePlace,
  CourseRecommendation,
  CourseRecommendationRepository,
} from "./course.types";

const SEARCH_CENTER = { lat: 37.5665, lng: 126.978 };

const toPlace = (place: {
  readonly source: "FAVORITE" | "KAKAO";
  readonly kakaoPlaceId: string;
  readonly favoritePlaceId?: string | null;
  readonly name: string;
  readonly address?: string | null;
  readonly category?: string | null;
  readonly lat: number;
  readonly lng: number;
}): CoursePlace => ({
  source: place.source,
  kakaoPlaceId: place.kakaoPlaceId,
  ...(place.favoritePlaceId ? { favoritePlaceId: place.favoritePlaceId } : {}),
  id: place.favoritePlaceId ?? `${place.source}:${place.kakaoPlaceId}`,
  name: place.name,
  address: place.address ?? "주소 정보 없음",
  category: place.category ?? "장소",
  lat: place.lat,
  lng: place.lng,
});

const toOption = (option: {
  readonly id: string;
  readonly courseId: string;
  readonly type: CourseOption["type"];
  readonly totalDurationMinutes: number;
  readonly totalTravelMinutes: number;
  readonly pricePerPersonWon: number;
  readonly isFavorite: boolean;
  readonly reason?: string | null;
  readonly stops: readonly {
    readonly id: string;
    readonly visitTime: string;
    readonly stayMinutes: number;
    readonly activityLabel: string | null;
    readonly source: "FAVORITE" | "KAKAO";
    readonly kakaoPlaceId: string;
    readonly favoritePlaceId: string | null;
    readonly name: string;
    readonly address: string | null;
    readonly category: string | null;
    readonly lat: number;
    readonly lng: number;
  }[];
}): CourseOption => ({
  id: option.id,
  courseId: option.courseId,
  type: option.type,
  title: `${option.type} 코스`,
  reason: option.reason ?? "추천 동선을 구성했어요.",
  totalDurationMinutes: option.totalDurationMinutes,
  totalTravelMinutes: option.totalTravelMinutes,
  pricePerPersonWon: option.pricePerPersonWon,
  isFavorite: option.isFavorite,
  stops: option.stops.map((stop) => ({
    ...toPlace({
      source: stop.source,
      kakaoPlaceId: stop.kakaoPlaceId,
      favoritePlaceId: stop.favoritePlaceId,
      name: stop.name,
      address: stop.address,
      category: stop.category,
      lat: stop.lat,
      lng: stop.lng,
    }),
    visitTime: stop.visitTime,
    stayMinutes: stop.stayMinutes,
    activityLabel: stop.activityLabel ?? "방문",
  })),
});

const toRecommendation = (course: {
  readonly id: string;
  readonly status: CourseRecommendation["status"];
  readonly options: readonly Parameters<typeof toOption>[0][];
  readonly errorMessage: string | null;
}): CourseRecommendation => ({
  id: course.id,
  historyId: course.id,
  status: course.status,
  options: course.options.map(toOption),
  ...(course.errorMessage ? { errorMessage: course.errorMessage } : {}),
});

export const courseRepository: CourseRecommendationRepository = {
  listPickerPlaces: async (query, source) => {
    if (source === "FAVORITE") {
      const response = await getFavoritePlaces();
      if (!response.success) return [];
      return response.data.favorites.map((favorite) =>
        toPlace({
          source: "FAVORITE",
          kakaoPlaceId: favorite.kakaoPlaceId,
          favoritePlaceId: favorite.id,
          name: favorite.name,
          address: favorite.address,
          category: favorite.category,
          lat: favorite.lat,
          lng: favorite.lng,
        }),
      );
    }
    const response = await searchLocationsByKeyword({ query, currentLocation: SEARCH_CENTER });
    if (response.kind !== "success") return [];
    return response.places.map((place) =>
      toPlace({
        source: "KAKAO",
        kakaoPlaceId: place.id,
        name: place.placeName,
        address: place.roadNameAddress,
        lat: place.lat,
        lng: place.lng,
      }),
    );
  },
  startRecommendation: async (draft) => {
    const response = await createCourse({
      places: draft.places.map(
        ({ source, kakaoPlaceId, favoritePlaceId, name, address, category, lat, lng }) => ({
          source,
          kakaoPlaceId,
          ...(favoritePlaceId ? { favoritePlaceId } : {}),
          name,
          address,
          category,
          lat,
          lng,
        }),
      ),
      date: draft.date,
      startTime: draft.startTime,
      durationHours: draft.durationHours,
    });
    if (!response.success) throw new Error(response.error);
    return {
      id: response.data.courseId,
      historyId: response.data.courseId,
      status: "PENDING",
      options: [],
    };
  },
  getRecommendation: async (id) => {
    const response = await getCourse(id);
    return response.success ? toRecommendation(response.data) : null;
  },
  getOption: async (courseId, optionId) => {
    const response = await getCourseOption(courseId, optionId);
    return response.success ? toOption(response.data) : null;
  },
  listHistory: async () => {
    const response = await getCourses();
    if (!response.success) return [];
    return response.data.items.map((item) => ({
      id: item.id,
      title: item.title ?? "새 코스 추천",
      status: item.status,
      requestedAt: item.requestedAt,
      recommendationId: item.id,
      optionCount: item.optionCount ?? undefined,
    }));
  },
  renameHistory: async (id, title) => (await renameCourse(id, title)).success,
  deleteHistory: async (id) => (await deleteCourse(id)).success,
  cancelPendingHistory: async (id) => (await cancelCourse(id)).success,
  listFavorites: async () => {
    const response = await getFavoriteCourseOptions();
    if (!response.success) return [];
    return response.data.options.map((option) => ({
      optionId: option.id,
      recommendationId: option.courseId,
      savedAt: new Date().toISOString(),
      option: toOption(option),
    }));
  },
  toggleFavorite: async (_courseId, optionId, favorite) =>
    (await setCourseOptionFavorite(optionId, favorite)).success,
};
