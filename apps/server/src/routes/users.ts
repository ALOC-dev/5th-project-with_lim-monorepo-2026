import {
  type AuthenticatedUserResponseData,
  createApiError,
  createApiResponse,
  type DeleteCurrentUserResponseData,
  UpdateMeRequestSchema,
} from "@monorepo/api-contracts";
import { eq } from "drizzle-orm";
import { Router } from "express";

import { db } from "../db/client.js";
import { users } from "../db/schema.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const [user] = await db.select().from(users).where(eq(users.id, req.userId));

    if (!user) {
      res.status(404).json(createApiError("not found"));
      return;
    }

    res.status(200).json(
      createApiResponse({
        user: {
          id: user.id,
          email: user.email,
          nickname: user.nickname,
        },
      } satisfies AuthenticatedUserResponseData),
    );
  }),
);

router.patch(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const parsed = UpdateMeRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(createApiError("invalid input"));
      return;
    }

    const [existing] = await db
      .select()
      .from(users)
      .where(eq(users.nickname, parsed.data.nickname));
    if (existing && existing.id !== req.userId) {
      res.status(409).json(createApiError("nickname already exists"));
      return;
    }

    const [updated] = await db
      .update(users)
      .set({ nickname: parsed.data.nickname })
      .where(eq(users.id, req.userId))
      .returning();

    if (!updated) {
      res.status(404).json(createApiError("not found"));
      return;
    }

    res.status(200).json(
      createApiResponse({
        user: {
          id: updated.id,
          email: updated.email,
          nickname: updated.nickname,
        },
      } satisfies AuthenticatedUserResponseData),
    );
  }),
);

router.delete(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    await db.delete(users).where(eq(users.id, req.userId));

    res.clearCookie("token", {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
    });

    res.status(200).json(
      createApiResponse({ success: true } satisfies DeleteCurrentUserResponseData),
    );
  }),
);

export default router;
