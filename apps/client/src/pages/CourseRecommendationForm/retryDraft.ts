import { CreateCourseRequestSchema } from "@monorepo/api-contracts";

import type { CourseDraft } from "../../features/CourseRecommendation/course.types";
import { toCourseDraft } from "../../features/CourseRecommendation/courseRepository";

const COURSE_RECOMMENDATION_RETRY_STATE_TYPE = "course-recommendation-retry";

export type CourseRecommendationRetryRouteState = {
  readonly type: typeof COURSE_RECOMMENDATION_RETRY_STATE_TYPE;
  readonly input: unknown;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const createCourseRecommendationRetryRouteState = (
  input: unknown,
): CourseRecommendationRetryRouteState => ({
  type: COURSE_RECOMMENDATION_RETRY_STATE_TYPE,
  input,
});

export const getCourseRecommendationRetryDraft = (state: unknown): CourseDraft | null => {
  if (!isRecord(state) || state.type !== COURSE_RECOMMENDATION_RETRY_STATE_TYPE) {
    return null;
  }

  const parsed = CreateCourseRequestSchema.safeParse(state.input);
  return parsed.success ? toCourseDraft(parsed.data) : null;
};
