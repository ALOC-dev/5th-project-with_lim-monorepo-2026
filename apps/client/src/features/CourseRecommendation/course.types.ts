import type {
  CourseRoutePoint as ApiCourseRoutePoint,
  CreateCourseRequest,
} from "@monorepo/api-contracts";

export type CourseRoutePoint = ApiCourseRoutePoint;

export type CourseRecommendationStatus =
  | "PENDING"
  | "RUNNING"
  | "SUCCESS"
  | "FAILED"
  | "EMPTY"
  | "CANCELLED";

export type CoursePlaceSource = "SAVED_PLACE" | "DIRECT_SEARCH";
export type CoursePacePreference = "RELAXED" | "NORMAL" | "PACKED";

export type CoursePlace = {
  readonly id: string;
  readonly source: CoursePlaceSource;
  readonly kakaoPlaceId?: string;
  readonly savedPlaceId?: string;
  readonly name: string;
  readonly address: string;
  readonly category: string;
  readonly lat: number;
  readonly lng: number;
  readonly phone?: string;
  readonly placeUrl?: string;
};

export type CourseDraft = {
  readonly places: readonly CoursePlace[];
  readonly date: string;
  readonly startTime: string;
  readonly durationHours: number;
  readonly numberOfPeople: number;
  readonly budgetPerPersonWon?: number;
  readonly pacePreference: CoursePacePreference;
};

export type CourseStop = CoursePlace & {
  readonly visitTime: string;
  readonly stayMinutes: number;
  readonly activityLabel: string;
  readonly travelMinutesFromPrevious: number;
  readonly waitMinutesFromPrevious: number;
};

export type CourseCandidateDecisionCode =
  | "INCLUDED"
  | "DUPLICATE"
  | "UNAVAILABLE_AT_TIME"
  | "OUTSIDE_TRAVEL_BUDGET"
  | "DURATION_LIMIT"
  | "LOOKUP_UNAVAILABLE"
  | "NOT_IN_TOP_COMBINATION";

export type CourseCandidateDecision = {
  readonly candidateId: string;
  readonly candidateName: string;
  readonly code: CourseCandidateDecisionCode;
  readonly message: string;
};

export type CourseCostQuality = "VERIFIED" | "ESTIMATED" | "UNKNOWN";

export type CourseOption = {
  readonly id: string;
  readonly courseId: string;
  readonly rank: number;
  readonly type: string;
  readonly courseType: {
    readonly key: string;
    readonly label: string;
    readonly description: string;
  };
  readonly title: string;
  readonly reason: string;
  readonly reasonTexts: readonly string[];
  readonly tradeoffs: readonly string[];
  /** Engine-provided route geometry. Legacy records can fall back to stops. */
  readonly routePath: readonly CourseRoutePoint[];
  readonly routePathSource: string;
  readonly stops: readonly CourseStop[];
  readonly startTime: string;
  readonly endTime: string;
  readonly totalDurationMinutes: number;
  readonly totalTravelMinutes: number;
  readonly totalStayMinutes: number;
  readonly pricePerPersonWon: number | null;
  readonly estimatedCostPerPerson: {
    readonly min: number | null;
    readonly max: number | null;
    readonly quality: CourseCostQuality;
  };
  readonly mealPlan?: {
    readonly status: string;
    readonly reason: string;
  };
  readonly candidateDecisions: readonly CourseCandidateDecision[];
  readonly isFavorite: boolean;
  readonly legacy: boolean;
};

export type CourseRecommendation = {
  readonly id: string;
  readonly historyId: string;
  readonly status: CourseRecommendationStatus;
  readonly input: CreateCourseRequest;
  readonly options: readonly CourseOption[];
  readonly candidateDecisions: readonly CourseCandidateDecision[];
  readonly errorMessage?: string;
  readonly errorCode?: string;
  readonly retryable?: boolean;
  readonly legacy: boolean;
};

export type CourseHistoryItem = {
  readonly id: string;
  readonly title: string;
  readonly status: CourseRecommendationStatus;
  readonly requestedAt: string;
  readonly recommendationId?: string;
  readonly optionCount?: number;
  readonly legacy?: boolean;
};

export type CourseFavorite = {
  readonly savedOptionId?: string;
  readonly sourceCourseOptionId?: string | null;
  readonly optionId: string;
  readonly recommendationId: string;
  readonly savedAt: string | null;
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
  readonly removeFavorite: (favorite: CourseFavorite) => Promise<boolean>;
};
