import { z } from "zod";

// placeData는 추천 엔진의 PlaceRecommendationItem 스냅샷.
// api-contracts는 엔진(playwright 등 무거운 런타임 의존)에 의존하지 않으므로,
// 기존 SSE 계약(data: unknown)과 동일하게 여기선 불투명하게 두고,
// 실제 스키마 검증은 엔진을 의존하는 서버 라우트에서 수행한다.
export const SavedPlaceSchema = z.object({
  id: z.uuid(),
  historyId: z.uuid().nullable(),
  placeData: z.unknown(),
  createdAt: z.iso.datetime({ offset: true }),
});

export type SavedPlace = z.infer<typeof SavedPlaceSchema>;

export const SavePlaceRequestSchema = z.object({
  historyId: z.uuid().optional(),
  placeData: z.unknown(),
});

export type SavePlaceRequest = z.infer<typeof SavePlaceRequestSchema>;

export const ListSavedPlacesResponseDataSchema = z.object({
  savedPlaces: z.array(SavedPlaceSchema),
});

export type ListSavedPlacesResponseData = z.infer<typeof ListSavedPlacesResponseDataSchema>;

export const SavePlaceResponseDataSchema = z.object({
  savedPlace: SavedPlaceSchema,
});

export type SavePlaceResponseData = z.infer<typeof SavePlaceResponseDataSchema>;

export const RemoveSavedPlaceResponseDataSchema = z.object({
  removed: z.literal(true),
});

export type RemoveSavedPlaceResponseData = z.infer<typeof RemoveSavedPlaceResponseDataSchema>;
