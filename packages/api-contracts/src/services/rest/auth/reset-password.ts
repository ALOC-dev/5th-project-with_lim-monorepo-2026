import { z } from "zod";

export const ResetPasswordRequestSchema = z
  .object({
    token: z.string().min(1),
    newPassword: z.string().min(8),
  });

export type ResetPasswordRequest = z.infer<typeof ResetPasswordRequestSchema>;

export const ResetPasswordResponseDataSchema = z
  .object({
    reset: z.literal(true),
  });

export type ResetPasswordResponseData = z.infer<typeof ResetPasswordResponseDataSchema>;
