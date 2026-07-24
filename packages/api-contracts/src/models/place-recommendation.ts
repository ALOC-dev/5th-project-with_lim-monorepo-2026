import { PlaceRecommendationItemSchema } from "@monorepo/recommendation-engine/v1/contracts";
import { z } from "zod";

import { RecommendationHistoryTitleSchema,RequestedAtSchema } from "./recommendation.js";

export const PlaceRecommendationHistoryPathParamsSchema = z
  .object({
    placeHistoryId: z.uuid(),
  })
  .strict();

export type PlaceRecommendationHistoryPathParams = z.infer<
  typeof PlaceRecommendationHistoryPathParamsSchema
>;

export const PlaceRecommendationHistoryStatusSchema = z.enum(["PENDING", "COMPLETED", "FAILED"]);

export type PlaceRecommendationHistoryStatus = z.infer<
  typeof PlaceRecommendationHistoryStatusSchema
>;

const PlaceRecommendationHistoryListItemBaseSchema = z
  .object({
    placeHistoryId: z.uuid(),
    title: RecommendationHistoryTitleSchema,
    requestedAt: RequestedAtSchema,
  })
  .strict();

export const PendingPlaceRecommendationHistoryListItemSchema =
  PlaceRecommendationHistoryListItemBaseSchema.extend({
    status: z.literal("PENDING"),
    recommendationCount: z.null(),
  }).strict();

export const CompletedPlaceRecommendationHistoryListItemSchema =
  PlaceRecommendationHistoryListItemBaseSchema.extend({
    status: z.literal("COMPLETED"),
    recommendationCount: z.number().int().nonnegative(),
  }).strict();

export const FailedPlaceRecommendationHistoryListItemSchema =
  PlaceRecommendationHistoryListItemBaseSchema.extend({
    status: z.literal("FAILED"),
    recommendationCount: z.null(),
  }).strict();

export const PlaceRecommendationHistoryListItemSchema = z.discriminatedUnion("status", [
  PendingPlaceRecommendationHistoryListItemSchema,
  CompletedPlaceRecommendationHistoryListItemSchema,
  FailedPlaceRecommendationHistoryListItemSchema,
]);

export type PlaceRecommendationHistoryListItem = z.infer<
  typeof PlaceRecommendationHistoryListItemSchema
>;

export const SavedPlaceSchema = z
  .object({
    id: z.uuid(),
    placeHistoryId: z.uuid().nullable(),
    savedAt: RequestedAtSchema,
    place: PlaceRecommendationItemSchema,
  })
  .strict();

export type SavedPlace = z.infer<typeof SavedPlaceSchema>;
