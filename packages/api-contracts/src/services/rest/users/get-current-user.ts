import { z } from "zod";

import { AuthenticatedUserSchema } from "../../../models/authenticated-user.js";

export const AuthenticatedUserResponseDataSchema = z
  .object({
    user: AuthenticatedUserSchema,
  });

export type AuthenticatedUserResponseData = z.infer<typeof AuthenticatedUserResponseDataSchema>;
