import { createHash, randomBytes, randomInt } from "node:crypto";

export const generateToken = () => randomBytes(32).toString("hex");

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export const generateVerificationCode = () => randomInt(0, 1_000_000).toString().padStart(6, "0");
