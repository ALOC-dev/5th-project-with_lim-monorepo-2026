import { createApiError } from "@monorepo/api-contracts";
import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";

import { JWT_SECRET } from "../lib/env.js";

const JwtPayloadSchema = z.object({
  userId: z.string(), //userID로 JWT 토큰 생성
});

export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  const tokenParse = z.string().safeParse((req.cookies as Record<string, unknown>).token);

  if (!tokenParse.success) {
    res.status(401).json(createApiError("unauthorized"));
    return;
  }

  try {
    const decoded = jwt.verify(tokenParse.data, JWT_SECRET);
    const payload = JwtPayloadSchema.parse(decoded);
    req.userId = payload.userId;
    next();
  } catch {
    res.status(401).json(createApiError("unauthorized"));
    return;
  }
};
