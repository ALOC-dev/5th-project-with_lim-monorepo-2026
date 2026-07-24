import { LocationItemSchema } from "@monorepo/recommendation-engine/v1/contracts";
import { z } from "zod";

import { RecommendationHistoryTitleSchema,RequestedAtSchema } from "./recommendation.js";

const dateIsoRegex = /^\d{4}-\d{2}-\d{2}$/;
const time24hRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

export const CourseIdSchema = z.string().trim().min(1);
export const CourseCandidatePlaceIdSchema = z.string().trim().min(1);

export const CourseRecommendationHistoryPathParamsSchema = z
  .object({
    courseHistoryId: z.uuid(),
  })
  .strict();

export type CourseRecommendationHistoryPathParams = z.infer<
  typeof CourseRecommendationHistoryPathParamsSchema
>;

export const CourseCandidatePlaceSchema = z
  .object({
    placeId: CourseCandidatePlaceIdSchema,
    bookmarkedPlaceId: z.uuid().nullable(),
    name: z.string().trim().min(1).max(100),
    mainCategory: z.string().trim().min(1).max(40),
    subCategory: z.string().trim().min(1).max(40),
    roadAddressKo: z.string().trim().min(1).max(200).nullable(),
    location: LocationItemSchema,
  })
  .strict();

export type CourseCandidatePlace = z.infer<typeof CourseCandidatePlaceSchema>;

export const CourseScheduleSchema = z
  .object({
    dateISO: z.string().regex(dateIsoRegex),
    startTime24h: z.string().regex(time24hRegex),
    totalDurationMinutes: z.number().int().positive(),
  })
  .strict();

export type CourseSchedule = z.infer<typeof CourseScheduleSchema>;

export const CourseStartLocationSchema = z
  .object({
    label: z.string().trim().min(1).max(100),
    location: LocationItemSchema,
  })
  .strict();

export type CourseStartLocation = z.infer<typeof CourseStartLocationSchema>;

export const CourseStopSchema = z
  .object({
    order: z.number().int().positive(),
    place: CourseCandidatePlaceSchema,
    stayDurationMinutes: z.number().int().positive(),
  })
  .strict();

export type CourseStop = z.infer<typeof CourseStopSchema>;

export const CourseTravelLegSchema = z
  .object({
    fromPlaceId: CourseCandidatePlaceIdSchema.nullable(),
    toPlaceId: CourseCandidatePlaceIdSchema,
    durationMinutes: z.number().int().nonnegative(),
    distanceMeters: z.number().nonnegative(),
  })
  .strict();

export type CourseTravelLeg = z.infer<typeof CourseTravelLegSchema>;

const CourseStopsSchema = z
  .array(CourseStopSchema)
  .min(3)
  .max(5)
  .refine(
    (stops) => new Set(stops.map((stop) => stop.place.placeId)).size === stops.length,
    "course stops must not repeat a place",
  );

export const CourseRecommendationItemSchema = z
  .object({
    courseId: CourseIdSchema,
    title: z.string().trim().min(1).max(60),
    stops: CourseStopsSchema,
    travelLegs: z.array(CourseTravelLegSchema),
    totalDurationMinutes: z.number().int().positive(),
    totalTravelDurationMinutes: z.number().int().nonnegative(),
    estimatedCostPerPerson: z.number().int().nonnegative(),
  })
  .strict();

export type CourseRecommendationItem = z.infer<typeof CourseRecommendationItemSchema>;

export const CourseRecommendationOutputSchema = z
  .object({
    courses: z
      .array(CourseRecommendationItemSchema)
      .max(10)
      .refine(
        (courses) => new Set(courses.map((course) => course.courseId)).size === courses.length,
        "courseIds must be unique",
      ),
  })
  .strict();

export type CourseRecommendationOutput = z.infer<typeof CourseRecommendationOutputSchema>;

export const CourseRecommendationHistoryStatusSchema = z.enum(["PENDING", "COMPLETED", "FAILED"]);

export type CourseRecommendationHistoryStatus = z.infer<
  typeof CourseRecommendationHistoryStatusSchema
>;

const CourseRecommendationHistoryListItemBaseSchema = z
  .object({
    courseHistoryId: z.uuid(),
    title: RecommendationHistoryTitleSchema,
    requestedAt: RequestedAtSchema,
  })
  .strict();

export const PendingCourseRecommendationHistoryListItemSchema =
  CourseRecommendationHistoryListItemBaseSchema.extend({
    status: z.literal("PENDING"),
    courseCount: z.null(),
  }).strict();

export const CompletedCourseRecommendationHistoryListItemSchema =
  CourseRecommendationHistoryListItemBaseSchema.extend({
    status: z.literal("COMPLETED"),
    courseCount: z.number().int().nonnegative(),
  }).strict();

export const FailedCourseRecommendationHistoryListItemSchema =
  CourseRecommendationHistoryListItemBaseSchema.extend({
    status: z.literal("FAILED"),
    courseCount: z.null(),
  }).strict();

export const CourseRecommendationHistoryListItemSchema = z.discriminatedUnion("status", [
  PendingCourseRecommendationHistoryListItemSchema,
  CompletedCourseRecommendationHistoryListItemSchema,
  FailedCourseRecommendationHistoryListItemSchema,
]);

export type CourseRecommendationHistoryListItem = z.infer<
  typeof CourseRecommendationHistoryListItemSchema
>;

export const SavedCourseSchema = z
  .object({
    savedCourseId: z.uuid(),
    courseHistoryId: z.uuid().nullable(),
    savedAt: RequestedAtSchema,
    course: CourseRecommendationItemSchema,
  })
  .strict();

export type SavedCourse = z.infer<typeof SavedCourseSchema>;
