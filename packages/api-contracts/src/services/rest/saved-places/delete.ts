import { z } from "zod";

export const SavedPlacePathParamsSchema = z
  .object({
    savedPlaceId: z.uuid(),
  })
  .strict();

export type SavedPlacePathParams = z.infer<typeof SavedPlacePathParamsSchema>;

export const DeleteSavedPlaceResponseDataSchema = z
  .object({
    deletedSavedPlaceId: z.uuid(),
  })
  .strict();

export type DeleteSavedPlaceResponseData = z.infer<typeof DeleteSavedPlaceResponseDataSchema>;
