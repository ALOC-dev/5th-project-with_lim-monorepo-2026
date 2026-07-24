import { z } from "zod";

import {
  CourseIdSchema,
  SavedCourseSchema,
} from "../../../models/course-recommendation.js";

export const SaveCourseRequestSchema = z
  .object({
    courseHistoryId: z.uuid(),
    courseId: CourseIdSchema,
  })
  .strict();

export type SaveCourseRequest = z.infer<typeof SaveCourseRequestSchema>;

export const SaveCourseResponseDataSchema = z
  .object({
    saved: SavedCourseSchema,
  })
  .strict();

export type SaveCourseResponseData = z.infer<typeof SaveCourseResponseDataSchema>;
