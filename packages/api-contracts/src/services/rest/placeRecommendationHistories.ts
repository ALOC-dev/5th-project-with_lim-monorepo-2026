import { z } from "zod";

export const PlaceRecommendationHistoryStatusSchema = z.enum(["PENDING", "COMPLETED", "FAILED"]);

export type PlaceRecommendationHistoryStatus = z.infer<
  typeof PlaceRecommendationHistoryStatusSchema
>;

export const PlaceRecommendationHistoryListItemSchema = z.object({
  id: z.uuid(),
  title: z.string().trim().min(1).max(60),
  status: PlaceRecommendationHistoryStatusSchema,
  requestedAt: z.iso.datetime({ offset: true }),
  recommendationCount: z.number().int().nonnegative().nullable(),
});

export type PlaceRecommendationHistoryListItem = z.infer<
  typeof PlaceRecommendationHistoryListItemSchema
>;

export const PlaceRecommendationHistoryListResponseDataSchema = z.object({
  items: z.array(PlaceRecommendationHistoryListItemSchema),
  nextCursor: z.string().nullable(),
});

export type PlaceRecommendationHistoryListResponseData = z.infer<
  typeof PlaceRecommendationHistoryListResponseDataSchema
>;

const PlaceRecommendationHistoryDetailBaseSchema = z.object({
  id: z.uuid(),
  title: z.string().trim().min(1).max(60),
  requestedAt: z.iso.datetime({ offset: true }),
});

export const PlaceRecommendationHistoryDetailResponseDataSchema = z.discriminatedUnion("status", [
  PlaceRecommendationHistoryDetailBaseSchema.extend({
    status: z.literal("PENDING"),
  }),
  PlaceRecommendationHistoryDetailBaseSchema.extend({
    status: z.literal("COMPLETED"),
    input: z.unknown(),
    output: z.unknown(),
  }),
  PlaceRecommendationHistoryDetailBaseSchema.extend({
    status: z.literal("FAILED"),
    errorMessage: z.string().trim().min(1),
  }),
]);

export type PlaceRecommendationHistoryDetailResponseData = z.infer<
  typeof PlaceRecommendationHistoryDetailResponseDataSchema
>;

export const RenamePlaceRecommendationHistoryRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(60),
  })
  .strict();

export type RenamePlaceRecommendationHistoryRequest = z.infer<
  typeof RenamePlaceRecommendationHistoryRequestSchema
>;

export const RenamePlaceRecommendationHistoryResponseDataSchema = z.object({
  id: z.uuid(),
  title: z.string().trim().min(1).max(60),
});

export type RenamePlaceRecommendationHistoryResponseData = z.infer<
  typeof RenamePlaceRecommendationHistoryResponseDataSchema
>;

export const DeletePlaceRecommendationHistoryResponseDataSchema = z.object({
  deletedId: z.uuid(),
});

export type DeletePlaceRecommendationHistoryResponseData = z.infer<
  typeof DeletePlaceRecommendationHistoryResponseDataSchema
>;
