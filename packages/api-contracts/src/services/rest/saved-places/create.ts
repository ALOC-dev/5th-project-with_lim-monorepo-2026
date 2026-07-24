import { z } from "zod";

import { SavedPlaceSchema } from "../../../models/place-recommendation.js";

export const SavePlaceRequestSchema = z
  .object({
    placeHistoryId: z.uuid(),
    placeId: z.string().trim().min(1),
  })
  .strict();

export type SavePlaceRequest = z.infer<typeof SavePlaceRequestSchema>;

export const SavePlaceResponseDataSchema = z
  .object({
    saved: SavedPlaceSchema,
  })
  .strict();

export type SavePlaceResponseData = z.infer<typeof SavePlaceResponseDataSchema>;
