import { z } from "zod";

export const ResendVerificationEmailResponseDataSchema = z.union([
  z.object({ alreadyVerified: z.literal(true) }),
  z.object({ sent: z.literal(true) }),
]);

export type ResendVerificationEmailResponseData = z.infer<
  typeof ResendVerificationEmailResponseDataSchema
>;
