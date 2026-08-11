import type { RecommendationProgressStep } from "../../components/RecommendationProgress";

export const MAX_SELECTED_PLACES = 15;

const COURSE_PROGRESS_STEP_IDS = [
  "input_validated",
  "generating_options",
  "persisting_results",
] as const;

export type CourseProgressStep = (typeof COURSE_PROGRESS_STEP_IDS)[number];

export const COURSE_PROGRESS_LABELS = {
  input_validated: "선택한 장소와 약속 시간을 확인하고 있어요.",
  generating_options: "여러 코스 옵션을 만들고 있어요.",
  persisting_results: "추천 결과를 저장하고 있어요.",
} satisfies Record<CourseProgressStep, string>;

export const toCourseProgressSteps = (
  activeStep: CourseProgressStep,
): readonly RecommendationProgressStep[] => {
  const activeIndex = COURSE_PROGRESS_STEP_IDS.indexOf(activeStep);

  return COURSE_PROGRESS_STEP_IDS.map((id, index) => ({
    id,
    label: COURSE_PROGRESS_LABELS[id],
    status: index < activeIndex ? "done" : index === activeIndex ? "active" : "pending",
  }));
};
