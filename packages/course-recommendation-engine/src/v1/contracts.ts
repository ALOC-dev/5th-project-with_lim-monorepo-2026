import { PlaceRecommendationItemSchema } from "@monorepo/recommendation-engine/v1/contracts";
import { z } from "zod";

import { WalkCalibrationSchema } from "./travel/contracts.js";

export const PacePreferenceSchema = z.enum(["RELAXED", "NORMAL", "PACKED"]);
export type PacePreference = z.infer<typeof PacePreferenceSchema>;

export const CourseEngineProgressStepSchema = z.enum([
  "measuring_travel",
  "generating_courses",
  "curating_courses",
]);
export type CourseEngineProgressStep = z.infer<typeof CourseEngineProgressStepSchema>;

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
    placeId: z.string().trim().min(1),
    placeName: z.string().trim().min(1),
    decision: CourseCandidateDecisionCodeSchema,
    message: z.string().trim().min(1),
  })
  .strict();
export type CourseCandidateDecision = z.infer<typeof CourseCandidateDecisionSchema>;

const dateIsoRegex = /^\d{4}-\d{2}-\d{2}$/;
const time24hRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

export const CourseBudgetRangeSchema = z
  .tuple([z.number().int().positive(), z.number().int().positive()])
  .refine(([min, max]) => min <= max, {
    message: "budget min must be less than or equal to max",
  });
export type CourseBudgetRange = z.infer<typeof CourseBudgetRangeSchema>;

/** Keep engine inputs from older callers readable while using a budget range internally. */
const CourseBudgetPerPersonWonSchema = z.preprocess(
  (value) => (typeof value === "number" ? [value, value] : value),
  CourseBudgetRangeSchema,
);

export const CourseScheduleInputSchema = z
  .object({
    dateISO: z.string().regex(dateIsoRegex),
    startTime24h: z.string().regex(time24hRegex),
    totalDurationMinutes: z.number().int().positive(),
  })
  .strict();
export type CourseScheduleInput = z.infer<typeof CourseScheduleInputSchema>;

export const CourseInputSchema = z
  .object({
    dateISO: z.string().regex(dateIsoRegex),
    startTime24h: z.string().regex(time24hRegex),
    totalDurationMinutes: z.number().int().positive(),
    places: z.array(PlaceRecommendationItemSchema).min(2).max(15),
    numberOfPeople: z.number().int().positive(),
    // 1인당 예산(원). 주면 예산에 맞는 코스를 우대한다. 없으면 비용은 랭킹에 반영하지 않는다.
    budgetPerPersonWon: CourseBudgetPerPersonWonSchema.optional(),
    // 코스 페이스. 체류 시간 범위 전체를 늘리거나 줄인다. 기본은 NORMAL.
    pacePreference: PacePreferenceSchema.optional(),
  })
  .strict();
export type CourseInput = z.infer<typeof CourseInputSchema>;

export const CourseTimelineItemSchema = z
  .object({
    placeId: z.string().trim().min(1),
    placeName: z.string().trim().min(1),
    categoryLabel: z.string().trim().min(1),
    time24h: z.string().regex(time24hRegex),
    stayDurationMinutes: z.number().int().positive(),
    travelMinutesFromPrevious: z.number().int().gte(0),
    // 영업 시작이나 식사 시간대를 맞추기 위해 이동 후 기다린 시간.
    waitMinutesFromPrevious: z.number().int().gte(0),
    label: z.string().trim().min(1),
  })
  .strict();
export type CourseTimelineItem = z.infer<typeof CourseTimelineItemSchema>;

export const MealPlanSchema = z
  .object({
    status: z.enum(["SATISFIED", "NOT_REQUIRED", "NOT_SATISFIED", "MISSING_FEASIBLE_PLACE"]),
    reason: z.string().trim().min(1),
  })
  .strict();
export type MealPlan = z.infer<typeof MealPlanSchema>;

export const CourseScoreBreakdownSchema = z
  .object({
    placeScore: z.number().gte(0),
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
export type CourseScoreBreakdown = z.infer<typeof CourseScoreBreakdownSchema>;

export const CourseRecommendationItemSchema = z
  .object({
    id: z.string().trim().min(1),
    title: z.string().trim().min(1),
    courseType: z
      .object({
        key: z.string().trim().min(1),
        label: z.string().trim().min(1),
        description: z.string().trim().min(1),
      })
      .strict(),
    places: z.array(PlaceRecommendationItemSchema).min(1),
    summary: z
      .object({
        estimatedCostPerPerson: z.tuple([z.number().int().gte(0), z.number().int().gte(0)]),
        estimatedTotalMinutes: z.number().int().gte(0),
        estimatedTravelMinutes: z.number().int().gte(0),
        totalStayMinutes: z.number().int().gte(0),
        stopCount: z.number().int().positive(),
        categoryCount: z.number().int().positive(),
        mealIncluded: z.boolean(),
      })
      .strict(),
    selection: z
      .object({
        reasonCodes: z.array(z.string().trim().min(1)).min(1).max(5),
        reasonTexts: z.array(z.string().trim().min(1)).min(1).max(3),
        tradeoffs: z.array(z.string().trim().min(1)).max(3),
      })
      .strict(),
    timeline: z.array(CourseTimelineItemSchema).min(1),
    startTime24h: z.string().regex(time24hRegex),
    endTime24h: z.string().regex(time24hRegex),
    totalStayMinutes: z.number().int().gte(0),
    totalTravelMinutes: z.number().int().gte(0),
    mealPlan: MealPlanSchema,
    score: z.number().int().min(0).max(100),
    scoreBreakdown: CourseScoreBreakdownSchema,
    reasons: z.array(z.string().trim().min(1)).min(1).max(3),
    // 후보 풀 전체를 기준으로 이 옵션이 각 후보를 포함했는지 설명한다.
    candidateDecisions: z.array(CourseCandidateDecisionSchema).min(2).max(15),
  })
  .strict();
export type CourseRecommendationItem = z.infer<typeof CourseRecommendationItemSchema>;

export const CourseUserOutputSchema = z
  .object({
    courses: z.array(CourseRecommendationItemSchema),
  })
  .strict();
export type CourseUserOutput = z.infer<typeof CourseUserOutputSchema>;

export const CourseEngineMetaSchema = z
  .object({
    // 중복을 제거한 뒤 남은 고유 코스 후보 수.
    candidateCount: z.number().int().gte(0),
    // LLM 큐레이션에 실제로 넘긴 후보 수.
    curationPoolSize: z.number().int().gte(0),
    // LLM이 최종 선별을 수행했는지. false면 결정론 상위 N개를 그대로 쓴 것이다.
    curatedByLlm: z.boolean(),
    // 폴백한 경우의 사유. 정상 큐레이션이면 null.
    curationFallbackReason: z.string().nullable(),
    // 도보 경로 API로 실제 계측한 장소 쌍 수.
    measuredTravelPairCount: z.number().int().gte(0),
    // 계측하지 못해 직선거리로 추정한 장소 쌍 수.
    estimatedTravelPairCount: z.number().int().gte(0),
    // 표본 보정을 쓴 경우의 계수. 보정하지 않았으면 null.
    travelCalibration: WalkCalibrationSchema.nullable(),
    // 체류 시간을 LLM으로 보정한 장소 수. 0이면 결정론 추정만 쓴 것이다.
    llmRefinedStayPlaceCount: z.number().int().gte(0),
    // 체류 시간 LLM 보정이 실패한 경우의 사유.
    stayEstimateFallbackReason: z.string().nullable(),
    // 계측을 아예 못 한 경우의 사유. 전부 계측했거나 부분 실패면 null.
    travelMatrixFallbackReason: z.string().nullable(),
    generationMillis: z.number().gte(0),
  })
  .strict();
export type CourseEngineMeta = z.infer<typeof CourseEngineMetaSchema>;

const CourseOutputCommonSchema = z
  .object({
    userInput: z.unknown(),
    meta: CourseEngineMetaSchema.optional(),
  })
  .strict();

const CourseOutputSuccessSchema = CourseOutputCommonSchema.extend({
  status: z.literal("SUCCESS"),
  userInput: CourseInputSchema,
  userOutput: CourseUserOutputSchema,
  meta: CourseEngineMetaSchema,
}).strict();

const CourseOutputErrorSchema = CourseOutputCommonSchema.extend({
  status: z.literal("ERROR"),
  error: z
    .object({
      code: z.string().trim().min(1),
      message: z.string().trim().min(1),
    })
    .strict(),
}).strict();

export const CourseEngineOutputSchema = z.discriminatedUnion("status", [
  CourseOutputSuccessSchema,
  CourseOutputErrorSchema,
]);
export type CourseEngineOutput = z.infer<typeof CourseEngineOutputSchema>;
