import { z } from "zod";

export const ForgotPasswordRequestSchema = z
  .object({
    email: z.email(),
  });

export type ForgotPasswordRequest = z.infer<typeof ForgotPasswordRequestSchema>;

export const ForgotPasswordResponseDataSchema = z
  .object({
    sent: z.literal(true),
  });

export type ForgotPasswordResponseData = z.infer<typeof ForgotPasswordResponseDataSchema>;
