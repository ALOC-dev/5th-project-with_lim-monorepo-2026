import type { CourseStatus } from "../rest/courses.js";

export type CourseRecommendationProgressStep =
  | "input_validated"
  | "generating_options"
  | "persisting_results";

export type CourseRecommendationSseEvent =
  | { readonly type: "progress"; readonly step: CourseRecommendationProgressStep }
  | {
      readonly type: "result";
      readonly courseId: string;
      readonly status: Extract<CourseStatus, "SUCCESS" | "EMPTY">;
    }
  | { readonly type: "error"; readonly courseId: string; readonly message: string }
  | { readonly type: "cancelled"; readonly courseId: string };
