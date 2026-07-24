import { z } from "zod";

export const DeleteCourseRecommendationHistoryResponseDataSchema = z
  .object({
    deletedCourseHistoryId: z.uuid(),
  })
  .strict();

export type DeleteCourseRecommendationHistoryResponseData = z.infer<
  typeof DeleteCourseRecommendationHistoryResponseDataSchema
>;
