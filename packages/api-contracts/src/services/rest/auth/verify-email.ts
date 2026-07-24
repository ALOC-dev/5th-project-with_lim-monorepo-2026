import { z } from "zod";

export const VerifyEmailQuerySchema = z
  .object({
    token: z.string().min(1),
  });

export type VerifyEmailQuery = z.infer<typeof VerifyEmailQuerySchema>;

export const VerifyEmailResponseDataSchema = z
  .object({
    verified: z.literal(true),
  });

export type VerifyEmailResponseData = z.infer<typeof VerifyEmailResponseDataSchema>;
