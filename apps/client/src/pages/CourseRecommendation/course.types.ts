import type { CourseRoutePoint as ApiCourseRoutePoint } from "@monorepo/api-contracts";

export type CourseRoutePoint = ApiCourseRoutePoint;

export type CourseRecommendationStatus = "PENDING" | "SUCCESS" | "FAILED" | "EMPTY" | "CANCELLED";

export type CoursePlaceSource = "FAVORITE" | "KAKAO";

export type CoursePlace = {
  readonly id: string;
  readonly source: CoursePlaceSource;
  readonly kakaoPlaceId: string;
  readonly favoritePlaceId?: string;
  readonly name: string;
  readonly address: string;
  readonly category: string;
  readonly lat: number;
  readonly lng: number;
};

export type CourseDraft = {
  readonly places: readonly CoursePlace[];
  readonly date: string;
  readonly startTime: string;
  readonly durationHours: number;
};

export type CourseStop = CoursePlace & {
  readonly visitTime: string;
  readonly stayMinutes: number;
  readonly activityLabel: string;
};

export type CourseOptionType = "이동 최소" | "느긋한 흐름" | "장소 다양성" | "식사 우선";

export type CourseOption = {
  readonly id: string;
  readonly courseId: string;
  readonly type: CourseOptionType;
  readonly title: string;
  readonly reason: string;
  /** Engine-provided route geometry. Legacy records can fall back to stops. */
  readonly routePath: readonly CourseRoutePoint[];
  readonly stops: readonly CourseStop[];
  readonly totalDurationMinutes: number;
  readonly totalTravelMinutes: number;
  readonly pricePerPersonWon: number;
  readonly isFavorite: boolean;
};

export type CourseRecommendation = {
  readonly id: string;
  readonly historyId: string;
  readonly status: CourseRecommendationStatus;
  readonly options: readonly CourseOption[];
  readonly errorMessage?: string;
};

export type CourseHistoryItem = {
  readonly id: string;
  readonly title: string;
  readonly status: CourseRecommendationStatus;
  readonly requestedAt: string;
  readonly recommendationId?: string;
  readonly optionCount?: number;
};

export type CourseFavorite = {
  readonly optionId: string;
  readonly recommendationId: string;
  readonly savedAt: string;
  readonly option: CourseOption;
};

export type CourseRecommendationRepository = {
  readonly listPickerPlaces: (
    query: string,
    source: CoursePlaceSource,
  ) => Promise<readonly CoursePlace[]>;
  readonly startRecommendation: (draft: CourseDraft) => Promise<CourseRecommendation>;
  readonly getRecommendation: (id: string) => Promise<CourseRecommendation | null>;
  readonly getOption: (recommendationId: string, optionId: string) => Promise<CourseOption | null>;
  readonly listHistory: () => Promise<readonly CourseHistoryItem[]>;
  readonly renameHistory: (id: string, title: string) => Promise<boolean>;
  readonly deleteHistory: (id: string) => Promise<boolean>;
  readonly cancelPendingHistory: (id: string) => Promise<boolean>;
  readonly listFavorites: () => Promise<readonly CourseFavorite[]>;
  readonly toggleFavorite: (
    recommendationId: string,
    optionId: string,
    favorite: boolean,
  ) => Promise<boolean>;
};
