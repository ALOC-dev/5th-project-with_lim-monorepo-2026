import { z } from "zod";

export const CourseStatusSchema = z.enum(["PENDING", "SUCCESS", "EMPTY", "FAILED", "CANCELLED"]);
export type CourseStatus = z.infer<typeof CourseStatusSchema>;

export const CoursePlaceSourceSchema = z.enum(["FAVORITE", "KAKAO"]);
export type CoursePlaceSource = z.infer<typeof CoursePlaceSourceSchema>;

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

export const CreateCourseRequestSchema = z
  .object({
    places: z.array(CoursePlaceInputSchema).min(1).max(15),
    date: z.iso.date(),
    startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/u),
    durationHours: z.number().int().min(1).max(24),
  })
  .strict();
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

export const CourseResultSchema = z
  .object({
    id: z.uuid(),
    title: z.string().nullable(),
    status: CourseStatusSchema,
    requestedAt: z.iso.datetime({ offset: true }),
    errorMessage: z.string().nullable(),
    options: z.array(CourseOptionSummarySchema),
  })
  .strict();
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

export const ListFavoriteCourseOptionsResponseDataSchema = z
  .object({ options: z.array(CourseOptionDetailSchema) })
  .strict();
export type ListFavoriteCourseOptionsResponseData = z.infer<
  typeof ListFavoriteCourseOptionsResponseDataSchema
>;
