import { z } from "zod";

export const UpdateMeRequestSchema = z.object({
  nickname: z.string().min(1),
});

export type UpdateMeRequest = z.infer<typeof UpdateMeRequestSchema>;

export const DeleteCurrentUserResponseDataSchema = z.object({
  success: z.literal(true),
});

export type DeleteCurrentUserResponseData = z.infer<typeof DeleteCurrentUserResponseDataSchema>;
