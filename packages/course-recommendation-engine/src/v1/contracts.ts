import { z } from "zod";

import { PlaceRecommendationItemSchema } from "@monorepo/recommendation-engine/v1/contracts";

const dateIsoRegex = /^\d{4}-\d{2}-\d{2}$/;
const time24hRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

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
    places: z.array(PlaceRecommendationItemSchema).min(1).max(15),
    travelTimeMatrix: z
      .object({
        mode: z.literal("WALK_TRANSIT"),
        placeToPlace: z.record(z.string(), z.record(z.string(), z.number().int().gte(0))),
      })
      .strict()
      .optional(),
    numberOfPeople: z.number().int().positive(),
    userNaturalLanguageRequest: z.string().trim().min(1),
  })
  .strict();
export type CourseInput = z.infer<typeof CourseInputSchema>;

export const CourseTimelineItemSchema = z
  .object({
    place: PlaceRecommendationItemSchema,
    time24h: z.string().regex(time24hRegex),
    stayDurationMinutes: z.number().int().positive(),
    travelMinutesFromPrevious: z.number().int().gte(0),
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
    flow: z.number(),
    total: z.number().min(0).max(100),
  })
  .strict();
export type CourseScoreBreakdown = z.infer<typeof CourseScoreBreakdownSchema>;

export const CourseRecommendationItemSchema = z
  .object({
    id: z.string().trim().min(1),
    title: z.string().trim().min(1),
    places: z.array(PlaceRecommendationItemSchema).min(1),
    llmSelectionReason: z.array(z.string().trim().min(1)).min(1).max(3),
    estimatedCostPerPerson: z.tuple([z.number().int().gte(0), z.number().int().gte(0)]),
    estimatedTotalMinutes: z.number().int().gte(0),
    estimatedTravelMinutes: z.number().int().gte(0),
    timeline: z.array(CourseTimelineItemSchema).min(1),
    startTime24h: z.string().regex(time24hRegex),
    endTime24h: z.string().regex(time24hRegex),
    totalStayMinutes: z.number().int().gte(0),
    totalTravelMinutes: z.number().int().gte(0),
    mealPlan: MealPlanSchema,
    score: z.number().int().min(0).max(100),
    scoreBreakdown: CourseScoreBreakdownSchema,
    reasons: z.array(z.string().trim().min(1)).min(1).max(3),
  })
  .strict();
export type CourseRecommendationItem = z.infer<typeof CourseRecommendationItemSchema>;

export const CourseUserOutputSchema = z
  .object({
    courses: z.array(CourseRecommendationItemSchema),
  })
  .strict();
export type CourseUserOutput = z.infer<typeof CourseUserOutputSchema>;

const CourseOutputCommonSchema = z
  .object({
    userInput: z.unknown(),
    meta: z.unknown().optional(),
  })
  .strict();

const CourseOutputSuccessSchema = CourseOutputCommonSchema.extend({
  status: z.literal("SUCCESS"),
  userInput: CourseInputSchema,
  userOutput: CourseUserOutputSchema,
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
