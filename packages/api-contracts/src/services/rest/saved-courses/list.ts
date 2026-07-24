import { z } from "zod";

import { SavedCourseSchema } from "../../../models/course-recommendation.js";
import { NextCursorSchema, PaginationQuerySchema } from "../../../models/pagination.js";

export const GetSavedCoursesQuerySchema = PaginationQuerySchema;

export type GetSavedCoursesQuery = z.infer<typeof GetSavedCoursesQuerySchema>;

export const GetSavedCoursesResponseDataSchema = z
  .object({
    items: z.array(SavedCourseSchema),
    nextCursor: NextCursorSchema,
  })
  .strict();

export type GetSavedCoursesResponseData = z.infer<typeof GetSavedCoursesResponseDataSchema>;
