import {
  type BookmarkPlaceRecommendationHistoryItemResponseData,
  createApiError,
  createApiResponse,
  type DeletePlaceRecommendationHistoryResponseData,
  type PlaceRecommendationHistoryDetailResponseData,
  type PlaceRecommendationHistoryListResponseData,
  RenamePlaceRecommendationHistoryRequestSchema,
  type RenamePlaceRecommendationHistoryResponseData,
} from "@monorepo/api-contracts";
import { and, desc, eq, sql } from "drizzle-orm";
import { Router } from "express";

import { db } from "../db/client.js";
import { placeRecommendationHistories, savedPlaces } from "../db/schema.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const rows = await db
      .select()
      .from(placeRecommendationHistories)
      .where(sql`${req.userId} = ANY(${placeRecommendationHistories.userIds})`)
      .orderBy(desc(placeRecommendationHistories.createdAt))
      .limit(20);

    const items = rows.map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      requestedAt: row.createdAt.toISOString(),
      recommendationCount:
        row.status === "COMPLETED" ? (row.output?.recommendations.length ?? 0) : null,
    }));

    res.status(200).json(
      createApiResponse({
        items,
        nextCursor: null,
      } satisfies PlaceRecommendationHistoryListResponseData),
    );
  }),
);

router.get(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!id) {
      res.status(400).json(createApiError("invalid recommendation history id"));
      return;
    }

    const [history] = await db
      .select()
      .from(placeRecommendationHistories)
      .where(
        and(
          eq(placeRecommendationHistories.id, id),
          sql`${req.userId} = ANY(${placeRecommendationHistories.userIds})`,
        ),
      );

    if (!history) {
      res.status(404).json(createApiError("place recommendation history not found"));
      return;
    }

    if (history.status !== "COMPLETED" || !history.output) {
      res.status(409).json(createApiError("place recommendation history is not completed"));
      return;
    }

    res.status(200).json(
      createApiResponse({
        id: history.id,
        title: history.title,
        requestedAt: history.createdAt.toISOString(),
        input: history.input,
        output: history.output,
      } satisfies PlaceRecommendationHistoryDetailResponseData),
    );
  }),
);

router.patch(
  "/:id/rename",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!id) {
      res.status(400).json(createApiError("invalid recommendation history id"));
      return;
    }

    const parsed = RenamePlaceRecommendationHistoryRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(createApiError("invalid recommendation history title"));
      return;
    }

    const [history] = await db
      .select()
      .from(placeRecommendationHistories)
      .where(
        and(
          eq(placeRecommendationHistories.id, id),
          sql`${req.userId} = ANY(${placeRecommendationHistories.userIds})`,
        ),
      );

    if (!history) {
      res.status(404).json(createApiError("place recommendation history not found"));
      return;
    }

    if (history.status !== "COMPLETED") {
      res.status(409).json(createApiError("place recommendation history is not editable"));
      return;
    }

    const [updated] = await db
      .update(placeRecommendationHistories)
      .set({ title: parsed.data.title })
      .where(eq(placeRecommendationHistories.id, history.id))
      .returning();

    if (!updated) {
      res.status(404).json(createApiError("place recommendation history not found"));
      return;
    }

    res.status(200).json(
      createApiResponse({
        id: updated.id,
        title: updated.title,
      } satisfies RenamePlaceRecommendationHistoryResponseData),
    );
  }),
);

router.delete(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!id) {
      res.status(400).json(createApiError("invalid recommendation history id"));
      return;
    }

    const [history] = await db
      .select()
      .from(placeRecommendationHistories)
      .where(
        and(
          eq(placeRecommendationHistories.id, id),
          sql`${req.userId} = ANY(${placeRecommendationHistories.userIds})`,
        ),
      );

    if (!history) {
      res.status(404).json(createApiError("place recommendation history not found"));
      return;
    }

    await db
      .update(savedPlaces)
      .set({ historyId: null })
      .where(eq(savedPlaces.historyId, history.id));

    await db
      .delete(placeRecommendationHistories)
      .where(eq(placeRecommendationHistories.id, history.id));

    res.status(200).json(
      createApiResponse({
        deletedId: history.id,
      } satisfies DeletePlaceRecommendationHistoryResponseData),
    );
  }),
);

router.patch(
  "/:historyId/items/:itemId/bookmark",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { historyId, itemId } = req.params;
    if (!historyId || !itemId) {
      res.status(400).json(createApiError("invalid bookmark request"));
      return;
    }

    const [history] = await db
      .select()
      .from(placeRecommendationHistories)
      .where(
        and(
          eq(placeRecommendationHistories.id, historyId),
          sql`${req.userId} = ANY(${placeRecommendationHistories.userIds})`,
        ),
      );

    if (!history || history.status !== "COMPLETED" || !history.output) {
      res.status(404).json(createApiError("place recommendation history not found"));
      return;
    }

    const place = history.output.recommendations.find((item) => item.id === itemId);
    if (!place) {
      res.status(404).json(createApiError("place not found in place recommendation history"));
      return;
    }

    const [savedPlace] = await db
      .select()
      .from(savedPlaces)
      .where(
        and(eq(savedPlaces.userId, req.userId), sql`${savedPlaces.placeData}->>'id' = ${place.id}`),
      );

    if (savedPlace) {
      await db.delete(savedPlaces).where(eq(savedPlaces.id, savedPlace.id));

      res.status(200).json(
        createApiResponse({
          bookmarked: false,
        } satisfies BookmarkPlaceRecommendationHistoryItemResponseData),
      );
      return;
    }

    await db.insert(savedPlaces).values({
      userId: req.userId,
      historyId: history.id,
      placeData: place,
    });

    res.status(200).json(
      createApiResponse({
        bookmarked: true,
      } satisfies BookmarkPlaceRecommendationHistoryItemResponseData),
    );
  }),
);

export default router;
