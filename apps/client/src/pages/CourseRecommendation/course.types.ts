export type CourseRecommendationStatus = "PENDING" | "SUCCESS" | "FAILED" | "EMPTY" | "CANCELLED";

export type CoursePlaceSource = "FAVORITE" | "SEARCH";

export type CoursePlace = {
  readonly id: string;
  readonly source: CoursePlaceSource;
  readonly name: string;
  readonly address: string;
  readonly category: string;
  readonly lat: number;
  readonly lng: number;
};

export type CourseDraft = {
  readonly placeIds: readonly string[];
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
  readonly type: CourseOptionType;
  readonly title: string;
  readonly reason: string;
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
  readonly draft: CourseDraft;
  readonly options: readonly CourseOption[];
  readonly completedAt?: string;
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
};

export type CourseRecommendationRepository = {
  readonly listPickerPlaces: (
    query: string,
    source: "FAVORITE" | "SEARCH",
  ) => readonly CoursePlace[];
  readonly startRecommendation: (draft: CourseDraft) => CourseRecommendation;
  readonly completeRecommendation: (id: string) => Promise<CourseRecommendation>;
  readonly getRecommendation: (id: string) => CourseRecommendation | null;
  readonly getOption: (recommendationId: string, optionId: string) => CourseOption | null;
  readonly listHistory: () => readonly CourseHistoryItem[];
  readonly renameHistory: (id: string, title: string) => boolean;
  readonly deleteHistory: (id: string) => boolean;
  readonly cancelPendingHistory: (id: string) => boolean;
  readonly listFavorites: () => readonly CourseFavorite[];
  readonly toggleFavorite: (recommendationId: string, optionId: string) => boolean;
};
