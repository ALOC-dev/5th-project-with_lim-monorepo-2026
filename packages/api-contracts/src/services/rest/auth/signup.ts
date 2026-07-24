import { z } from "zod";

export const SignupRequestSchema = z
  .object({
    email: z.email(),
    password: z.string().min(8),
    nickname: z.string().min(1),
  });

export type SignupRequest = z.infer<typeof SignupRequestSchema>;
