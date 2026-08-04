import {
  AddFavoritePlaceRequestSchema,
  type AddFavoritePlaceResponseData,
  createApiError,
  createApiResponse,
  type FavoritePlace,
  type ListFavoritePlacesResponseData,
  type RemoveFavoritePlaceResponseData,
} from "@monorepo/api-contracts";
import { and, desc, eq, isNull } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";

import { db } from "../db/client.js";
import { favoritePlaces } from "../db/schema.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

const toFavoritePlace = (row: typeof favoritePlaces.$inferSelect): FavoritePlace => ({
  id: row.id,
  kakaoPlaceId: row.kakaoPlaceId,
  name: row.name,
  address: row.address,
  lat: Number(row.lat),
  lng: Number(row.lng),
  category: row.category,
  memo: row.memo,
  createdAt: row.createdAt.toISOString(),
});

router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const rows = await db
      .select()
      .from(favoritePlaces)
      .where(and(eq(favoritePlaces.userId, req.userId), isNull(favoritePlaces.deletedAt)))
      .orderBy(desc(favoritePlaces.createdAt));

    res.status(200).json(
      createApiResponse({
        favorites: rows.map(toFavoritePlace),
      } satisfies ListFavoritePlacesResponseData),
    );
  }),
);

router.post(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const parsed = AddFavoritePlaceRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(createApiError("invalid input"));
      return;
    }

    const [existing] = await db
      .select()
      .from(favoritePlaces)
      .where(
        and(
          eq(favoritePlaces.userId, req.userId),
          eq(favoritePlaces.kakaoPlaceId, parsed.data.kakaoPlaceId),
        ),
      )
      .orderBy(desc(favoritePlaces.createdAt));

    if (existing && !existing.deletedAt) {
      res.status(409).json(createApiError("already favorited"));
      return;
    }

    const [favorite] = existing
      ? await db
          .update(favoritePlaces)
          .set({
            deletedAt: null,
            name: parsed.data.name,
            address: parsed.data.address ?? null,
            lat: parsed.data.lat.toString(),
            lng: parsed.data.lng.toString(),
            category: parsed.data.category ?? null,
            memo: parsed.data.memo ?? null,
          })
          .where(eq(favoritePlaces.id, existing.id))
          .returning()
      : await db
          .insert(favoritePlaces)
          .values({
            userId: req.userId,
            kakaoPlaceId: parsed.data.kakaoPlaceId,
            name: parsed.data.name,
            address: parsed.data.address ?? null,
            lat: parsed.data.lat.toString(),
            lng: parsed.data.lng.toString(),
            category: parsed.data.category ?? null,
            memo: parsed.data.memo ?? null,
          })
          .returning();

    if (!favorite) {
      res.status(500).json(createApiError("failed to add favorite"));
      return;
    }

    res.status(201).json(
      createApiResponse({
        favorite: toFavoritePlace(favorite),
      } satisfies AddFavoritePlaceResponseData),
    );
  }),
);

router.delete(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const idParse = z.uuid().safeParse(req.params.id);
    if (!idParse.success) {
      res.status(400).json(createApiError("invalid input"));
      return;
    }

    const [removed] = await db
      .update(favoritePlaces)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(favoritePlaces.id, idParse.data),
          eq(favoritePlaces.userId, req.userId),
          isNull(favoritePlaces.deletedAt),
        ),
      )
      .returning();

    if (!removed) {
      res.status(404).json(createApiError("not found"));
      return;
    }

    res
      .status(200)
      .json(createApiResponse({ removed: true } satisfies RemoveFavoritePlaceResponseData));
  }),
);

export default router;
