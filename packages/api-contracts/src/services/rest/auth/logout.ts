import { z } from "zod";

export const LogoutResponseDataSchema = z
  .object({
    success: z.literal(true),
  });

export type LogoutResponseData = z.infer<typeof LogoutResponseDataSchema>;
