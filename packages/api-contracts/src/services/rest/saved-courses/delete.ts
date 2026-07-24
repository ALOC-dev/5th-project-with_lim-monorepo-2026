import { z } from "zod";

export const SavedCoursePathParamsSchema = z
  .object({
    savedCourseId: z.uuid(),
  })
  .strict();

export type SavedCoursePathParams = z.infer<typeof SavedCoursePathParamsSchema>;

export const DeleteSavedCourseResponseDataSchema = z
  .object({
    deletedSavedCourseId: z.uuid(),
  })
  .strict();

export type DeleteSavedCourseResponseData = z.infer<typeof DeleteSavedCourseResponseDataSchema>;
