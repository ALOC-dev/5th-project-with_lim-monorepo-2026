import { z } from "zod";

export const CourseStatusSchema = z.enum([
  "PENDING",
  "RUNNING",
  "SUCCESS",
  "EMPTY",
  "FAILED",
  "CANCELLED",
]);
export type CourseStatus = z.infer<typeof CourseStatusSchema>;

export const CourseFailureCodeSchema = z.enum([
  "COURSE_INVALID_INPUT",
  "COURSE_CANDIDATE_NOT_FOUND",
  "COURSE_CANDIDATE_FORBIDDEN",
  "COURSE_CANDIDATE_LOOKUP_UNAVAILABLE",
  "COURSE_ENGINE_UNAVAILABLE",
  "COURSE_ROUTE_UNAVAILABLE",
  "COURSE_NO_FEASIBLE_COURSES",
  "COURSE_ENGINE_FAILURE",
  "COURSE_PERSISTENCE_FAILURE",
]);
export type CourseFailureCode = z.infer<typeof CourseFailureCodeSchema>;

export const CourseFailureSchema = z
  .object({
    code: CourseFailureCodeSchema,
    retryable: z.boolean(),
    message: z.string().trim().min(1),
  })
  .strict();
export type CourseFailure = z.infer<typeof CourseFailureSchema>;

export const CoursePlaceSourceSchema = z.enum(["FAVORITE", "KAKAO"]);
export type CoursePlaceSource = z.infer<typeof CoursePlaceSourceSchema>;

export const CourseCandidateSourceSchema = z.enum(["SAVED_PLACE", "DIRECT_SEARCH"]);
export type CourseCandidateSource = z.infer<typeof CourseCandidateSourceSchema>;

export const SavedPlaceCourseCandidateSchema = z
  .object({
    source: z.literal("SAVED_PLACE"),
    savedPlaceId: z.uuid(),
  })
  .strict();
export type SavedPlaceCourseCandidate = z.infer<typeof SavedPlaceCourseCandidateSchema>;

export const DirectSearchCourseCandidateSchema = z
  .object({
    source: z.literal("DIRECT_SEARCH"),
    kakaoPlaceId: z.string().trim().min(1),
    name: z.string().trim().min(1).max(120),
    address: z.string().trim().max(240),
    category: z.string().trim().max(120),
    lat: z.number().finite().min(-90).max(90),
    lng: z.number().finite().min(-180).max(180),
    phone: z.string().trim().max(40).nullable().optional(),
    placeUrl: z.url().nullable().optional(),
  })
  .strict();
export type DirectSearchCourseCandidate = z.infer<typeof DirectSearchCourseCandidateSchema>;

export const CourseCandidateInputSchema = z.discriminatedUnion("source", [
  SavedPlaceCourseCandidateSchema,
  DirectSearchCourseCandidateSchema,
]);
export type CourseCandidateInput = z.infer<typeof CourseCandidateInputSchema>;

export const CoursePacePreferenceSchema = z.enum(["RELAXED", "NORMAL", "PACKED"]);
export type CoursePacePreference = z.infer<typeof CoursePacePreferenceSchema>;

export const CourseBudgetRangeSchema = z
  .tuple([z.number().int().min(5_000).max(500_000), z.number().int().min(5_000).max(500_000)])
  .refine(([min, max]) => min <= max, {
    message: "budget min must be less than or equal to max",
  });
export type CourseBudgetRange = z.infer<typeof CourseBudgetRangeSchema>;

/** Accept the previous single-value budget when reading stored v2 requests. */
export const CourseBudgetPerPersonWonSchema = z.preprocess(
  (value) => (typeof value === "number" ? [value, value] : value),
  CourseBudgetRangeSchema,
);

export const CreateCourseV2RequestSchema = z
  .object({
    version: z.literal(2),
    candidates: z.array(CourseCandidateInputSchema).min(2).max(15),
    date: z.iso.date(),
    startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/u),
    durationHours: z.number().int().min(2).max(8),
    numberOfPeople: z.number().int().min(1).max(20),
    budgetPerPersonWon: CourseBudgetPerPersonWonSchema.optional(),
    pacePreference: CoursePacePreferenceSchema,
  })
  .strict();
export type CreateCourseV2Request = z.infer<typeof CreateCourseV2RequestSchema>;

export const CourseCandidateSearchQuerySchema = z
  .object({
    query: z.string().trim().min(1).max(100),
    lat: z.coerce.number().finite().min(-90).max(90).optional(),
    lng: z.coerce.number().finite().min(-180).max(180).optional(),
  })
  .strict()
  .superRefine((query, context) => {
    if ((query.lat === undefined) !== (query.lng === undefined)) {
      context.addIssue({
        code: "custom",
        message: "lat and lng must be provided together",
      });
    }
  });
export type CourseCandidateSearchQuery = z.infer<typeof CourseCandidateSearchQuerySchema>;

export const CourseCandidateSearchItemSchema = DirectSearchCourseCandidateSchema.extend({
  roadAddress: z.string().trim().max(240).nullable().optional(),
}).strict();
export type CourseCandidateSearchItem = z.infer<typeof CourseCandidateSearchItemSchema>;

export const SearchCourseCandidatesResponseDataSchema = z
  .object({ items: z.array(CourseCandidateSearchItemSchema).max(15) })
  .strict();
export type SearchCourseCandidatesResponseData = z.infer<
  typeof SearchCourseCandidatesResponseDataSchema
>;

export const CoursePlaceInputSchema = z
  .object({
    source: CoursePlaceSourceSchema,
    kakaoPlaceId: z.string().trim().min(1),
    favoritePlaceId: z.uuid().optional(),
    name: z.string().trim().min(1).max(120),
    address: z.string().trim().max(240).nullable().optional(),
    category: z.string().trim().max(120).nullable().optional(),
    lat: z.number().finite().min(-90).max(90),
    lng: z.number().finite().min(-180).max(180),
  })
  .strict()
  .superRefine((place, context) => {
    if (place.source === "FAVORITE" && !place.favoritePlaceId) {
      context.addIssue({
        code: "custom",
        message: "favoritePlaceId is required for favorite places",
      });
    }
    if (place.source === "KAKAO" && place.favoritePlaceId) {
      context.addIssue({
        code: "custom",
        message: "favoritePlaceId is only valid for favorite places",
      });
    }
  });
export type CoursePlaceInput = z.infer<typeof CoursePlaceInputSchema>;

export const LegacyCreateCourseRequestSchema = z
  .object({
    places: z.array(CoursePlaceInputSchema).min(1).max(15),
    date: z.iso.date(),
    startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/u),
    durationHours: z.number().int().min(1).max(24),
  })
  .strict();
export type LegacyCreateCourseRequest = z.infer<typeof LegacyCreateCourseRequestSchema>;

/**
 * Compatibility boundary for the rolling v1 -> v2 migration. New callers should
 * parse with `CreateCourseV2RequestSchema` when they require v2-only fields.
 */
export const CreateCourseRequestSchema = z.union([
  CreateCourseV2RequestSchema,
  LegacyCreateCourseRequestSchema,
]);
export type CreateCourseRequest = z.infer<typeof CreateCourseRequestSchema>;

export const CourseRoutePointSchema = z
  .object({ lat: z.number().finite(), lng: z.number().finite() })
  .strict();
export type CourseRoutePoint = z.infer<typeof CourseRoutePointSchema>;

export const CourseOptionTypeSchema = z.enum([
  "이동 최소",
  "느긋한 흐름",
  "장소 다양성",
  "식사 우선",
]);
export type CourseOptionType = z.infer<typeof CourseOptionTypeSchema>;

export const CourseStopSchema = z
  .object({
    id: z.uuid(),
    sequence: z.number().int().positive(),
    visitTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/u),
    stayMinutes: z.number().int().positive(),
    activityLabel: z.string().trim().min(1).max(60).nullable(),
    source: CoursePlaceSourceSchema,
    kakaoPlaceId: z.string().trim().min(1),
    favoritePlaceId: z.uuid().nullable(),
    name: z.string().trim().min(1),
    address: z.string().nullable(),
    category: z.string().nullable(),
    lat: z.number().finite(),
    lng: z.number().finite(),
  })
  .strict();
export type CourseStop = z.infer<typeof CourseStopSchema>;

export const CourseOptionSummarySchema = z
  .object({
    id: z.uuid(),
    courseId: z.uuid(),
    type: CourseOptionTypeSchema,
    totalDurationMinutes: z.number().int().nonnegative(),
    totalTravelMinutes: z.number().int().nonnegative(),
    pricePerPersonWon: z.number().int().nonnegative(),
    isFavorite: z.boolean(),
    routePath: z.array(CourseRoutePointSchema),
    stops: z.array(CourseStopSchema),
  })
  .strict();
export type CourseOptionSummary = z.infer<typeof CourseOptionSummarySchema>;

export const CourseOptionDetailSchema = CourseOptionSummarySchema.extend({
  reason: z.string().trim().min(1).nullable(),
}).strict();
export type CourseOptionDetail = z.infer<typeof CourseOptionDetailSchema>;

export const CourseCandidateDecisionCodeSchema = z.enum([
  "INCLUDED",
  "DUPLICATE",
  "UNAVAILABLE_AT_TIME",
  "OUTSIDE_TRAVEL_BUDGET",
  "DURATION_LIMIT",
  "LOOKUP_UNAVAILABLE",
  "NOT_IN_TOP_COMBINATION",
]);
export type CourseCandidateDecisionCode = z.infer<typeof CourseCandidateDecisionCodeSchema>;

export const CourseCandidateDecisionSchema = z
  .object({
    candidateIndex: z.number().int().nonnegative(),
    candidateKey: z.string().trim().min(1),
    source: CourseCandidateSourceSchema,
    savedPlaceId: z.uuid().nullable(),
    kakaoPlaceId: z.string().trim().min(1).nullable(),
    name: z.string().trim().min(1).nullable(),
    decision: CourseCandidateDecisionCodeSchema,
    message: z.string().trim().min(1),
  })
  .strict();
export type CourseCandidateDecision = z.infer<typeof CourseCandidateDecisionSchema>;

export const CourseCostQualitySchema = z.enum(["UNKNOWN", "ESTIMATED", "VERIFIED"]);
export type CourseCostQuality = z.infer<typeof CourseCostQualitySchema>;

export const CourseEstimatedCostPerPersonSchema = z
  .object({
    min: z.number().int().nonnegative().nullable(),
    max: z.number().int().nonnegative().nullable(),
    quality: CourseCostQualitySchema,
  })
  .strict()
  .superRefine((cost, context) => {
    if (cost.quality === "UNKNOWN" && (cost.min !== null || cost.max !== null)) {
      context.addIssue({ code: "custom", message: "UNKNOWN cost must not contain an amount" });
    }
    if (cost.quality !== "UNKNOWN" && (cost.min === null || cost.max === null)) {
      context.addIssue({ code: "custom", message: "Known cost requires min and max amounts" });
    }
    if (cost.min !== null && cost.max !== null && cost.min > cost.max) {
      context.addIssue({ code: "custom", message: "Cost min must not exceed max" });
    }
  });
export type CourseEstimatedCostPerPerson = z.infer<typeof CourseEstimatedCostPerPersonSchema>;

export const CourseTypeV2Schema = z
  .object({
    key: z.string().trim().min(1).max(40),
    label: z.string().trim().min(1).max(40),
    description: z.string().trim().min(1).max(160),
  })
  .strict();
export type CourseTypeV2 = z.infer<typeof CourseTypeV2Schema>;

export const CourseSelectionV2Schema = z
  .object({
    reasonCodes: z.array(z.string().trim().min(1)).min(1).max(5),
    reasonTexts: z.array(z.string().trim().min(1)).min(1).max(3),
    tradeoffs: z.array(z.string().trim().min(1)).max(3),
  })
  .strict();
export type CourseSelectionV2 = z.infer<typeof CourseSelectionV2Schema>;

export const CourseMealPlanV2Schema = z
  .object({
    status: z.enum(["SATISFIED", "NOT_REQUIRED", "NOT_SATISFIED", "MISSING_FEASIBLE_PLACE"]),
    reason: z.string().trim().min(1),
  })
  .strict();
export type CourseMealPlanV2 = z.infer<typeof CourseMealPlanV2Schema>;

export const CourseScoreBreakdownV2Schema = z
  .object({
    placeScore: z.number(),
    mealFit: z.number(),
    travelEfficiency: z.number(),
    waitEfficiency: z.number(),
    durationFit: z.number(),
    categoryDiversity: z.number(),
    costFit: z.number(),
    unknownHours: z.number(),
    flow: z.number(),
    total: z.number().min(0).max(100),
  })
  .strict();
export type CourseScoreBreakdownV2 = z.infer<typeof CourseScoreBreakdownV2Schema>;

export const CourseStopV2Schema = z
  .object({
    id: z.uuid(),
    sequence: z.number().int().positive(),
    enginePlaceId: z.string().trim().min(1),
    source: CourseCandidateSourceSchema,
    savedPlaceId: z.uuid().nullable(),
    kakaoPlaceId: z.string().trim().min(1).nullable(),
    kakaoPlaceUrl: z.url().nullable(),
    name: z.string().trim().min(1),
    address: z.string().trim().min(1).nullable(),
    mainCategory: z.string().trim().min(1),
    subCategory: z.string().trim().min(1),
    categoryLabel: z.string().trim().min(1),
    activityLabel: z.string().trim().min(1).nullable(),
    lat: z.number().finite().min(-90).max(90),
    lng: z.number().finite().min(-180).max(180),
    visitTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/u),
    stayMinutes: z.number().int().positive(),
    travelMinutesFromPrevious: z.number().int().nonnegative(),
    waitMinutesFromPrevious: z.number().int().nonnegative(),
  })
  .strict();
export type CourseStopV2 = z.infer<typeof CourseStopV2Schema>;

export const CourseRoutePathSourceSchema = z.enum(["NONE", "ORDER_ONLY", "TMAP"]);
export type CourseRoutePathSource = z.infer<typeof CourseRoutePathSourceSchema>;

export const CourseOptionV2SummarySchema = z
  .object({
    id: z.uuid(),
    courseId: z.uuid(),
    engineCourseId: z.string().trim().min(1),
    rank: z.number().int().positive(),
    title: z.string().trim().min(1).max(80),
    courseType: CourseTypeV2Schema,
    selection: CourseSelectionV2Schema,
    estimatedCostPerPerson: CourseEstimatedCostPerPersonSchema,
    startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/u),
    endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/u),
    totalDurationMinutes: z.number().int().nonnegative(),
    totalTravelMinutes: z.number().int().nonnegative(),
    totalStayMinutes: z.number().int().nonnegative(),
    totalWaitMinutes: z.number().int().nonnegative(),
    mealPlan: CourseMealPlanV2Schema,
    score: z.number().min(0).max(100),
    scoreBreakdown: CourseScoreBreakdownV2Schema,
    isFavorite: z.boolean(),
    routePathSource: CourseRoutePathSourceSchema,
    routePath: z.array(CourseRoutePointSchema),
    stops: z.array(CourseStopV2Schema).min(2).max(6),
    candidateDecisions: z.array(CourseCandidateDecisionSchema).min(2).max(15),
    // Temporary compatibility aliases for legacy clients.
    type: z.string().trim().min(1),
    reason: z.string().trim().min(1).nullable(),
    pricePerPersonWon: z.number().int().nonnegative().nullable(),
  })
  .strict();
export type CourseOptionV2Summary = z.infer<typeof CourseOptionV2SummarySchema>;

export const CourseOptionV2DetailSchema = CourseOptionV2SummarySchema.extend({}).strict();
export type CourseOptionV2Detail = z.infer<typeof CourseOptionV2DetailSchema>;

export const CourseOptionAnySummarySchema = z.union([
  CourseOptionV2SummarySchema,
  CourseOptionSummarySchema,
]);
export type CourseOptionAnySummary = z.infer<typeof CourseOptionAnySummarySchema>;

export const CourseOptionAnyDetailSchema = z.union([
  CourseOptionV2DetailSchema,
  CourseOptionDetailSchema,
]);
export type CourseOptionAnyDetail = z.infer<typeof CourseOptionAnyDetailSchema>;

export const CourseProgressStepV2Schema = z.enum([
  "resolving_candidates",
  "enriching_places",
  "measuring_travel",
  "generating_courses",
  "curating_courses",
  "persisting_results",
]);
export type CourseProgressStepV2 = z.infer<typeof CourseProgressStepV2Schema>;

export const LegacyCourseResultSchema = z
  .object({
    version: z.literal(1).optional(),
    legacy: z.literal(true).optional(),
    id: z.uuid(),
    title: z.string().nullable(),
    status: CourseStatusSchema,
    requestedAt: z.iso.datetime({ offset: true }),
    input: LegacyCreateCourseRequestSchema,
    errorCode: CourseFailureCodeSchema.nullable(),
    errorMessage: z.string().nullable(),
    options: z.array(CourseOptionSummarySchema),
  })
  .strict();
export type LegacyCourseResult = z.infer<typeof LegacyCourseResultSchema>;

export const CourseResultV2Schema = z
  .object({
    version: z.literal(2),
    legacy: z.literal(false),
    id: z.uuid(),
    title: z.string().nullable(),
    status: CourseStatusSchema,
    requestedAt: z.iso.datetime({ offset: true }),
    startedAt: z.iso.datetime({ offset: true }).nullable(),
    finishedAt: z.iso.datetime({ offset: true }).nullable(),
    updatedAt: z.iso.datetime({ offset: true }),
    input: CreateCourseV2RequestSchema,
    progressStep: CourseProgressStepV2Schema.nullable(),
    failure: CourseFailureSchema.nullable(),
    // Temporary compatibility aliases for legacy clients.
    errorCode: CourseFailureCodeSchema.nullable(),
    errorMessage: z.string().nullable(),
    engineMeta: z.unknown().nullable(),
    candidateDecisions: z.array(CourseCandidateDecisionSchema).max(15),
    options: z.array(CourseOptionV2SummarySchema).max(3),
  })
  .strict();
export type CourseResultV2 = z.infer<typeof CourseResultV2Schema>;

export const CourseResultSchema = z.union([CourseResultV2Schema, LegacyCourseResultSchema]);
export type CourseResult = z.infer<typeof CourseResultSchema>;

export const CreateCourseResponseDataSchema = z.object({ courseId: z.uuid() }).strict();
export type CreateCourseResponseData = z.infer<typeof CreateCourseResponseDataSchema>;

export const CourseHistoryItemSchema = z
  .object({
    id: z.uuid(),
    title: z.string().nullable(),
    status: CourseStatusSchema,
    requestedAt: z.iso.datetime({ offset: true }),
    optionCount: z.number().int().nonnegative().nullable(),
    version: z.union([z.literal(1), z.literal(2)]).optional(),
    legacy: z.boolean().optional(),
    progressStep: CourseProgressStepV2Schema.nullable().optional(),
  })
  .strict();
export type CourseHistoryItem = z.infer<typeof CourseHistoryItemSchema>;

export const ListCoursesResponseDataSchema = z
  .object({ items: z.array(CourseHistoryItemSchema) })
  .strict();
export type ListCoursesResponseData = z.infer<typeof ListCoursesResponseDataSchema>;

export const RenameCourseRequestSchema = z
  .object({ title: z.string().trim().min(1).max(60) })
  .strict();
export type RenameCourseRequest = z.infer<typeof RenameCourseRequestSchema>;

export const RenameCourseResponseDataSchema = z
  .object({ id: z.uuid(), title: z.string().trim().min(1).max(60) })
  .strict();
export type RenameCourseResponseData = z.infer<typeof RenameCourseResponseDataSchema>;

export const DeleteCourseResponseDataSchema = z.object({ deletedId: z.uuid() }).strict();
export type DeleteCourseResponseData = z.infer<typeof DeleteCourseResponseDataSchema>;

export const CancelCourseResponseDataSchema = z
  .object({ id: z.uuid(), status: z.literal("CANCELLED") })
  .strict();
export type CancelCourseResponseData = z.infer<typeof CancelCourseResponseDataSchema>;

export const SetCourseOptionFavoriteRequestSchema = z.object({ favorite: z.boolean() }).strict();
export type SetCourseOptionFavoriteRequest = z.infer<typeof SetCourseOptionFavoriteRequestSchema>;

export const SetCourseOptionFavoriteResponseDataSchema = z
  .object({ id: z.uuid(), favorite: z.boolean() })
  .strict();
export type SetCourseOptionFavoriteResponseData = z.infer<
  typeof SetCourseOptionFavoriteResponseDataSchema
>;

export const LegacyListFavoriteCourseOptionsResponseDataSchema = z
  .object({ options: z.array(CourseOptionAnyDetailSchema) })
  .strict();
export type LegacyListFavoriteCourseOptionsResponseData = z.infer<
  typeof LegacyListFavoriteCourseOptionsResponseDataSchema
>;

export const SavedCourseOptionItemSchema = z
  .object({
    id: z.uuid(),
    savedAt: z.iso.datetime({ offset: true }),
    sourceCourseOptionId: z.uuid().nullable(),
    option: CourseOptionAnyDetailSchema,
  })
  .strict();
export type SavedCourseOptionItem = z.infer<typeof SavedCourseOptionItemSchema>;

export const ListFavoriteCourseOptionsV2ResponseDataSchema = z
  .object({
    version: z.literal(2),
    options: z.array(SavedCourseOptionItemSchema),
  })
  .strict();
export type ListFavoriteCourseOptionsV2ResponseData = z.infer<
  typeof ListFavoriteCourseOptionsV2ResponseDataSchema
>;

export const ListFavoriteCourseOptionsResponseDataSchema = z.union([
  ListFavoriteCourseOptionsV2ResponseDataSchema,
  LegacyListFavoriteCourseOptionsResponseDataSchema,
]);
export type ListFavoriteCourseOptionsResponseData = z.infer<
  typeof ListFavoriteCourseOptionsResponseDataSchema
>;

export const RemoveSavedCourseOptionResponseDataSchema = z.object({ removedId: z.uuid() }).strict();
export type RemoveSavedCourseOptionResponseData = z.infer<
  typeof RemoveSavedCourseOptionResponseDataSchema
>;
