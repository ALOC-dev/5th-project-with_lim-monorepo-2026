import { z } from "zod";

import { NextCursorSchema, PaginationQuerySchema } from "../../../models/pagination.js";
import { SavedPlaceSchema } from "../../../models/place-recommendation.js";

export const GetSavedPlacesQuerySchema = PaginationQuerySchema;

export type GetSavedPlacesQuery = z.infer<typeof GetSavedPlacesQuerySchema>;

export const GetSavedPlacesResponseDataSchema = z
  .object({
    items: z.array(SavedPlaceSchema),
    nextCursor: NextCursorSchema,
  })
  .strict();

export type GetSavedPlacesResponseData = z.infer<typeof GetSavedPlacesResponseDataSchema>;
