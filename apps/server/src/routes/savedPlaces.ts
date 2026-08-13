import {
  createApiError,
  createApiResponse,
  type ListSavedPlacesResponseData,
  type RemoveSavedPlaceResponseData,
  type SavedPlace,
  SavePlaceRequestSchema,
  type SavePlaceResponseData,
} from "@monorepo/api-contracts";
import { PlaceRecommendationItemSchema } from "@monorepo/recommendation-engine/v1/contracts";
import { and, desc, eq, sql } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";

import { db } from "../db/client.js";
import { savedPlaces } from "../db/schema.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

const toSavedPlace = (row: typeof savedPlaces.$inferSelect): SavedPlace => ({
  id: row.id,
  historyId: row.historyId,
  placeData: row.placeData,
  createdAt: row.createdAt.toISOString(),
});

// 저장한 장소 조회
router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const rows = await db
      .select()
      .from(savedPlaces)
      .where(eq(savedPlaces.userId, req.userId))
      .orderBy(desc(savedPlaces.createdAt));

    res.status(200).json(
      createApiResponse({
        savedPlaces: rows.map(toSavedPlace),
      } satisfies ListSavedPlacesResponseData),
    );
  }),
);

// 추천 결과 장소 저장
router.post(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const parsed = SavePlaceRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(createApiError("invalid input"));
      return;
    }

    // placeData는 계약에서 불투명(unknown)하므로 엔진 스키마로 엄격 검증한다.
    const placeData = PlaceRecommendationItemSchema.safeParse(parsed.data.placeData);
    if (!placeData.success) {
      res.status(400).json(createApiError("invalid place data"));
      return;
    }

    await db.execute(sql`
      INSERT INTO saved_places (user_id, history_id, place_data)
      VALUES (
        ${req.userId},
        ${parsed.data.historyId ?? null},
        ${sql.param(placeData.data, savedPlaces.placeData)}::jsonb
      )
      ON CONFLICT (user_id, (place_data->>'id'))
      DO UPDATE SET
        history_id = EXCLUDED.history_id,
        place_data = EXCLUDED.place_data
    `);

    const [saved] = await db
      .select()
      .from(savedPlaces)
      .where(
        and(
          eq(savedPlaces.userId, req.userId),
          sql`${savedPlaces.placeData}->>'id' = ${placeData.data.id}`,
        ),
      );

    if (!saved) {
      res.status(500).json(createApiError("failed to save place"));
      return;
    }

    res.status(201).json(
      createApiResponse({
        savedPlace: toSavedPlace(saved),
      } satisfies SavePlaceResponseData),
    );
  }),
);

// 저장한 장소 삭제 (하드 삭제)
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
      .delete(savedPlaces)
      .where(and(eq(savedPlaces.id, idParse.data), eq(savedPlaces.userId, req.userId)))
      .returning();

    if (!removed) {
      res.status(404).json(createApiError("saved place not found"));
      return;
    }

    res
      .status(200)
      .json(createApiResponse({ removed: true } satisfies RemoveSavedPlaceResponseData));
  }),
);

export default router;
