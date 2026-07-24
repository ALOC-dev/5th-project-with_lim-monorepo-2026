import { z } from "zod";

export const UpdateMeRequestSchema = z
  .object({
    nickname: z.string().min(1),
  });

export type UpdateMeRequest = z.infer<typeof UpdateMeRequestSchema>;
