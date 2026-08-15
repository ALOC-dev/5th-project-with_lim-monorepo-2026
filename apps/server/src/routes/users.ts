import {
  type AuthenticatedUserResponseData,
  ChangePasswordRequestSchema,
  type ChangePasswordResponseData,
  createApiError,
  createApiResponse,
  type DeleteCurrentUserResponseData,
  UpdateMeRequestSchema,
} from "@monorepo/api-contracts";
import bcrypt from "bcryptjs";
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

router.patch(
  "/me/password",
  requireAuth,
  asyncHandler(async (req, res) => {
    // 1. 프론트엔드에서 넘어온 새 비밀번호 검증
    const parsed = ChangePasswordRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(createApiError("invalid input"));
      return;
    }

    // 2. 현재 로그인한 유저 확인
    const [user] = await db.select().from(users).where(eq(users.id, req.userId));
    if (!user) {
      res.status(404).json(createApiError("not found"));
      return;
    }

    // 3. 새 비밀번호를 안전하게 암호화 (해싱)
    const hashedNewPassword = await bcrypt.hash(parsed.data.newPassword, 10);

    // 4. DB에 암호화된 새 비밀번호 업데이트
    await db.update(users).set({ passwordHash: hashedNewPassword }).where(eq(users.id, req.userId));

    // 5. 성공 응답
    res.status(200).json(createApiResponse({ success: true } satisfies ChangePasswordResponseData));
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

    res
      .status(200)
      .json(createApiResponse({ success: true } satisfies DeleteCurrentUserResponseData));
  }),
);

export default router;
