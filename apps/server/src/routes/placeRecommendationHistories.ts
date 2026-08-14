import {
  createApiError,
  createApiResponse,
  type DeletePlaceRecommendationHistoryResponseData,
  type PlaceRecommendationHistoryDetailResponseData,
  type PlaceRecommendationHistoryListItem,
  type PlaceRecommendationHistoryListResponseData,
  RenamePlaceRecommendationHistoryRequestSchema,
  type RenamePlaceRecommendationHistoryResponseData,
} from "@monorepo/api-contracts";
import { and, arrayContains, desc, eq } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";

import { db } from "../db/client.js";
import { placeRecommendationHistories } from "../db/schema.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { requireAuth } from "../middleware/auth.js";
import { presentStoredRecommendationFailure } from "../recommendation/error-presentation.js";
import { deriveRecommendationHistoryStatus } from "../recommendation/history.js";

const router = Router();

const ownedBy = (userId: string) => arrayContains(placeRecommendationHistories.userIds, [userId]);

const toListItem = (
  row: typeof placeRecommendationHistories.$inferSelect,
): PlaceRecommendationHistoryListItem => ({
  id: row.id,
  title: row.title,
  status: deriveRecommendationHistoryStatus(row),
  requestedAt: row.createdAt.toISOString(),
  recommendationCount: row.output?.recommendations.length ?? null,
});

router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const rows = await db
      .select()
      .from(placeRecommendationHistories)
      .where(ownedBy(req.userId))
      .orderBy(desc(placeRecommendationHistories.createdAt));

    res.status(200).json(
      createApiResponse({
        items: rows.map(toListItem),
        nextCursor: null,
      } satisfies PlaceRecommendationHistoryListResponseData),
    );
  }),
);

router.get(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const id = z.uuid().safeParse(req.params.id);
    if (!id.success) {
      res.status(400).json(createApiError("invalid input"));
      return;
    }

    const [history] = await db
      .select()
      .from(placeRecommendationHistories)
      .where(and(eq(placeRecommendationHistories.id, id.data), ownedBy(req.userId)));

    if (!history) {
      res.status(404).json(createApiError("history not found"));
      return;
    }

    const base = {
      id: history.id,
      title: history.title,
      requestedAt: history.createdAt.toISOString(),
    };
    const status = deriveRecommendationHistoryStatus(history);

    const data: PlaceRecommendationHistoryDetailResponseData =
      status === "COMPLETED" && history.output
        ? {
            ...base,
            status,
            input: history.input,
            output: history.output,
          }
        : status === "FAILED"
          ? {
              ...base,
              status,
              input: history.input,
              formLocations: [...history.formLocations],
              errorMessage: presentStoredRecommendationFailure(history.errorCode).message,
            }
          : {
              ...base,
              status: "PENDING",
            };

    res.status(200).json(createApiResponse(data));
  }),
);

router.patch(
  "/:id/rename",
  requireAuth,
  asyncHandler(async (req, res) => {
    const id = z.uuid().safeParse(req.params.id);
    const body = RenamePlaceRecommendationHistoryRequestSchema.safeParse(req.body);
    if (!id.success || !body.success) {
      res.status(400).json(createApiError("invalid input"));
      return;
    }

    const [history] = await db
      .select()
      .from(placeRecommendationHistories)
      .where(and(eq(placeRecommendationHistories.id, id.data), ownedBy(req.userId)));

    if (!history) {
      res.status(404).json(createApiError("history not found"));
      return;
    }

    if (deriveRecommendationHistoryStatus(history) !== "COMPLETED") {
      res.status(409).json(createApiError("history is incomplete"));
      return;
    }

    const [renamed] = await db
      .update(placeRecommendationHistories)
      .set({ title: body.data.title })
      .where(and(eq(placeRecommendationHistories.id, id.data), ownedBy(req.userId)))
      .returning();

    if (!renamed) {
      res.status(404).json(createApiError("history not found"));
      return;
    }

    res.status(200).json(
      createApiResponse({
        id: renamed.id,
        title: renamed.title,
      } satisfies RenamePlaceRecommendationHistoryResponseData),
    );
  }),
);

router.delete(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const id = z.uuid().safeParse(req.params.id);
    if (!id.success) {
      res.status(400).json(createApiError("invalid input"));
      return;
    }

    const [deleted] = await db
      .delete(placeRecommendationHistories)
      .where(and(eq(placeRecommendationHistories.id, id.data), ownedBy(req.userId)))
      .returning({ id: placeRecommendationHistories.id });

    if (!deleted) {
      res.status(404).json(createApiError("history not found"));
      return;
    }

    res.status(200).json(
      createApiResponse({
        deletedId: id.data,
      } satisfies DeletePlaceRecommendationHistoryResponseData),
    );
  }),
);

export default router;
