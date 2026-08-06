import {
  type AuthenticatedUserResponseData,
  createApiError,
  createApiResponse,
  ForgotPasswordRequestSchema,
  type ForgotPasswordResponseData,
  LoginRequestSchema,
  type LogoutResponseData,
  NicknameCheckQuerySchema,
  type NicknameCheckResponseData,
  ResetPasswordRequestSchema,
  type ResetPasswordResponseData,
  SendSignupCodeRequestSchema,
  type SendSignupCodeResponseData,
  SignupRequestSchema,
  VerifyForgotPasswordCodeRequestSchema,
  type VerifyForgotPasswordCodeResponseData,
  VerifySignupCodeRequestSchema,
  type VerifySignupCodeResponseData,
} from "@monorepo/api-contracts";
import bcrypt from "bcryptjs";
import { and, desc, eq, gt, isNotNull, isNull, or } from "drizzle-orm";
import { Router } from "express";
import jwt from "jsonwebtoken";

import { db } from "../db/client.js";
import {
  passwordResetCodes,
  signupVerificationCodes,
  users,
} from "../db/schema.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { JWT_SECRET } from "../lib/env.js";
import { sendPasswordResetCode, sendSignupVerificationCode } from "../lib/resend.js";
import { generateVerificationCode, hashToken } from "../lib/tokens.js";

const router = Router();

router.post(
  "/signup/send-code",
  asyncHandler(async (req, res) => {
    const parsed = SendSignupCodeRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(createApiError("invalid input"));
      return;
    }

    const [existingUser] = await db.select().from(users).where(eq(users.email, parsed.data.email));
    if (existingUser) {
      res.status(409).json(createApiError("email already exists"));
      return;
    }

    const code = generateVerificationCode();
    await db.insert(signupVerificationCodes).values({
      email: parsed.data.email,
      codeHash: hashToken(code),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    });

    try {
      await sendSignupVerificationCode(parsed.data.email, code);
    } catch (err) {
      console.error("failed to send signup verification code", err);
      res.status(500).json(createApiError("failed to send email"));
      return;
    }

    res.status(200).json(createApiResponse({ sent: true } satisfies SendSignupCodeResponseData));
  }),
);

router.post(
  "/signup/verify-code",
  asyncHandler(async (req, res) => {
    const parsed = VerifySignupCodeRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(createApiError("invalid input"));
      return;
    }

    const [record] = await db
      .select()
      .from(signupVerificationCodes)
      .where(
        and(
          eq(signupVerificationCodes.email, parsed.data.email),
          eq(signupVerificationCodes.codeHash, hashToken(parsed.data.code)),
          isNull(signupVerificationCodes.verifiedAt),
          gt(signupVerificationCodes.expiresAt, new Date()),
        ),
      )
      .orderBy(desc(signupVerificationCodes.createdAt));

    if (!record) {
      res.status(400).json(createApiError("invalid or expired code"));
      return;
    }

    await db
      .update(signupVerificationCodes)
      .set({ verifiedAt: new Date() })
      .where(eq(signupVerificationCodes.id, record.id));

    res
      .status(200)
      .json(createApiResponse({ verified: true } satisfies VerifySignupCodeResponseData));
  }),
);

router.get(
  "/nickname-check",
  asyncHandler(async (req, res) => {
    const parsed = NicknameCheckQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json(createApiError("invalid input"));
      return;
    }

    const [existing] = await db
      .select()
      .from(users)
      .where(eq(users.nickname, parsed.data.nickname));

    res
      .status(200)
      .json(createApiResponse({ available: !existing } satisfies NicknameCheckResponseData));
  }),
);

router.post(
  "/signup",
  asyncHandler(async (req, res) => {
    const parsed = SignupRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(createApiError("invalid input"));
      return;
    }

    const [verification] = await db
      .select()
      .from(signupVerificationCodes)
      .where(
        and(
          eq(signupVerificationCodes.email, parsed.data.email),
          isNotNull(signupVerificationCodes.verifiedAt),
          isNull(signupVerificationCodes.usedAt),
        ),
      )
      .orderBy(desc(signupVerificationCodes.verifiedAt));

    if (!verification) {
      res.status(400).json(createApiError("email not verified"));
      return;
    }

    const existing = await db
      .select()
      .from(users)
      .where(or(eq(users.email, parsed.data.email), eq(users.nickname, parsed.data.nickname)));

    if (existing.some((u) => u.email === parsed.data.email)) {
      res.status(409).json(createApiError("email already exists"));
      return;
    }

    if (existing.some((u) => u.nickname === parsed.data.nickname)) {
      res.status(409).json(createApiError("nickname already exists"));
      return;
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, 10);

    const [newUser] = await db
      .insert(users)
      .values({
        email: parsed.data.email,
        passwordHash,
        nickname: parsed.data.nickname,
        emailVerified: true,
      })
      .returning();

    if (!newUser) {
      res.status(500).json(createApiError("failed to create user"));
      return;
    }

    await db
      .update(signupVerificationCodes)
      .set({ usedAt: new Date() })
      .where(eq(signupVerificationCodes.id, verification.id));

    const token = jwt.sign({ userId: newUser.id }, JWT_SECRET, { expiresIn: "7d" });

    res.cookie("token", token, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7일
    });

    res.status(201).json(
      createApiResponse({
        user: {
          id: newUser.id,
          email: newUser.email,
          nickname: newUser.nickname,
        },
      } satisfies AuthenticatedUserResponseData),
    );
  }),
);

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const parsed = LoginRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(createApiError("invalid input"));
      return;
    }

    const [user] = await db.select().from(users).where(eq(users.email, parsed.data.email));

    if (!user) {
      res.status(401).json(createApiError("invalid credentials"));
      return;
    }

    const passwordMatches = await bcrypt.compare(parsed.data.password, user.passwordHash);

    if (!passwordMatches) {
      res.status(401).json(createApiError("invalid credentials"));
      return;
    }

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "7d" });

    res.cookie("token", token, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

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

router.post("/logout", (req, res) => {
  res.clearCookie("token", {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
  });

  res.status(200).json(createApiResponse({ success: true } satisfies LogoutResponseData));
});

router.post(
  "/forgot-password",
  asyncHandler(async (req, res) => {
    const parsed = ForgotPasswordRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(createApiError("invalid input"));
      return;
    }

    const [user] = await db.select().from(users).where(eq(users.email, parsed.data.email));

    // 이메일 존재 여부와 무관하게 항상 같은 응답 (계정 존재 여부 스캔 방지)
    if (user) {
      const code = generateVerificationCode();
      await db.insert(passwordResetCodes).values({
        email: user.email,
        codeHash: hashToken(code),
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      });

      try {
        await sendPasswordResetCode(user.email, code);
      } catch (err) {
        console.error("failed to send password reset email", err);
      }
    }

    res.status(200).json(createApiResponse({ sent: true } satisfies ForgotPasswordResponseData));
  }),
);

router.post(
  "/forgot-password/verify-code",
  asyncHandler(async (req, res) => {
    const parsed = VerifyForgotPasswordCodeRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(createApiError("invalid input"));
      return;
    }

    const [record] = await db
      .select()
      .from(passwordResetCodes)
      .where(
        and(
          eq(passwordResetCodes.email, parsed.data.email),
          eq(passwordResetCodes.codeHash, hashToken(parsed.data.code)),
          isNull(passwordResetCodes.verifiedAt),
          gt(passwordResetCodes.expiresAt, new Date()),
        ),
      )
      .orderBy(desc(passwordResetCodes.createdAt));

    if (!record) {
      res.status(400).json(createApiError("invalid or expired code"));
      return;
    }

    await db
      .update(passwordResetCodes)
      .set({ verifiedAt: new Date() })
      .where(eq(passwordResetCodes.id, record.id));

    res.status(200).json(
      createApiResponse({ verified: true } satisfies VerifyForgotPasswordCodeResponseData),
    );
  }),
);

router.post(
  "/reset-password",
  asyncHandler(async (req, res) => {
    const parsed = ResetPasswordRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(createApiError("invalid input"));
      return;
    }

    const [verification] = await db
      .select()
      .from(passwordResetCodes)
      .where(
        and(
          eq(passwordResetCodes.email, parsed.data.email),
          isNotNull(passwordResetCodes.verifiedAt),
          isNull(passwordResetCodes.usedAt),
        ),
      )
      .orderBy(desc(passwordResetCodes.verifiedAt));

    if (!verification) {
      res.status(400).json(createApiError("email not verified"));
      return;
    }

    const [user] = await db.select().from(users).where(eq(users.email, parsed.data.email));

    if (!user) {
      res.status(400).json(createApiError("invalid request"));
      return;
    }

    const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);

    await db.update(users).set({ passwordHash }).where(eq(users.id, user.id));

    await db
      .update(passwordResetCodes)
      .set({ usedAt: new Date() })
      .where(eq(passwordResetCodes.id, verification.id));

    res.status(200).json(createApiResponse({ reset: true } satisfies ResetPasswordResponseData));
  }),
);

export default router;
