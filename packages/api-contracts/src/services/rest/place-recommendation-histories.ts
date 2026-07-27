import { z } from "zod";

export const PlaceRecommendationHistoryStatusSchema = z.enum(["PENDING", "COMPLETED", "FAILED"]);

export type PlaceRecommendationHistoryStatus = z.infer<
  typeof PlaceRecommendationHistoryStatusSchema
>;

export const PlaceRecommendationHistoryListItemSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  status: PlaceRecommendationHistoryStatusSchema,
  requestedAt: z.iso.datetime(),
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

export const PlaceRecommendationHistoryDetailResponseDataSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  requestedAt: z.iso.datetime(),
  input: z.unknown(),
  output: z.unknown(),
});

export type PlaceRecommendationHistoryDetailResponseData = z.infer<
  typeof PlaceRecommendationHistoryDetailResponseDataSchema
>;

export const RenamePlaceRecommendationHistoryRequestSchema = z.object({
  title: z.string().trim().min(1).max(60),
});

export type RenamePlaceRecommendationHistoryRequest = z.infer<
  typeof RenamePlaceRecommendationHistoryRequestSchema
>;

export const RenamePlaceRecommendationHistoryResponseDataSchema = z.object({
  id: z.uuid(),
  title: z.string(),
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

export const BookmarkPlaceRecommendationHistoryItemResponseDataSchema = z.object({
  bookmarked: z.boolean(),
});

export type BookmarkPlaceRecommendationHistoryItemResponseData = z.infer<
  typeof BookmarkPlaceRecommendationHistoryItemResponseDataSchema
>;
