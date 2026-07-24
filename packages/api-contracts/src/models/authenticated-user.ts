import { z } from "zod";

export const AuthenticatedUserSchema = z
  .object({
    id: z.uuid(),
    email: z.email(),
    nickname: z.string().min(1),
  });

export type AuthenticatedUser = z.infer<typeof AuthenticatedUserSchema>;
