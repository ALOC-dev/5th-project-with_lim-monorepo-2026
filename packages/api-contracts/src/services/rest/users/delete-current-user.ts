import { z } from "zod";

export const DeleteCurrentUserResponseDataSchema = z
  .object({
    success: z.literal(true),
  });

export type DeleteCurrentUserResponseData = z.infer<typeof DeleteCurrentUserResponseDataSchema>;
