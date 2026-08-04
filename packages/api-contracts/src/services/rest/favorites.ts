import { z } from "zod";

export const FavoritePlaceSchema = z.object({
  id: z.uuid(),
  kakaoPlaceId: z.string().trim().min(1),
  name: z.string().trim().min(1),
  address: z.string().trim().min(1).nullable(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  category: z.string().trim().min(1).nullable(),
  memo: z.string().trim().min(1).nullable(),
  createdAt: z.iso.datetime({ offset: true }),
});

export type FavoritePlace = z.infer<typeof FavoritePlaceSchema>;

export const AddFavoritePlaceRequestSchema = z.object({
  kakaoPlaceId: z.string().trim().min(1),
  name: z.string().trim().min(1),
  address: z.string().trim().min(1).optional(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  category: z.string().trim().min(1).optional(),
  memo: z.string().trim().min(1).optional(),
});

export type AddFavoritePlaceRequest = z.infer<typeof AddFavoritePlaceRequestSchema>;

export const AddFavoritePlaceResponseDataSchema = z.object({
  favorite: FavoritePlaceSchema,
});

export type AddFavoritePlaceResponseData = z.infer<typeof AddFavoritePlaceResponseDataSchema>;

export const ListFavoritePlacesResponseDataSchema = z.object({
  favorites: z.array(FavoritePlaceSchema),
});

export type ListFavoritePlacesResponseData = z.infer<typeof ListFavoritePlacesResponseDataSchema>;

export const RemoveFavoritePlaceResponseDataSchema = z.object({
  removed: z.literal(true),
});

export type RemoveFavoritePlaceResponseData = z.infer<typeof RemoveFavoritePlaceResponseDataSchema>;
