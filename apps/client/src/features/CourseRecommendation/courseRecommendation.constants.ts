import type { RecommendationProgressStep } from "../../components/RecommendationProgress";

export const COURSE_PROGRESS_STEP_IDS = [
  "resolving_candidates",
  "enriching_places",
  "measuring_travel",
  "generating_courses",
  "curating_courses",
  "persisting_results",
] as const;

export type CourseProgressStep = (typeof COURSE_PROGRESS_STEP_IDS)[number];

export const isCourseProgressStep = (value: string): value is CourseProgressStep =>
  COURSE_PROGRESS_STEP_IDS.some((step) => step === value);

export const advanceCourseProgressStep = (
  current: CourseProgressStep,
  next: CourseProgressStep,
): CourseProgressStep =>
  COURSE_PROGRESS_STEP_IDS.indexOf(next) > COURSE_PROGRESS_STEP_IDS.indexOf(current)
    ? next
    : current;

export const COURSE_PROGRESS_LABELS = {
  resolving_candidates: "선택한 후보 장소를 확인하고 있어요.",
  enriching_places: "장소의 영업시간과 정보를 확인하고 있어요.",
  measuring_travel: "장소 사이의 도보 이동시간을 확인하고 있어요.",
  generating_courses: "방문할 수 있는 코스 조합을 만들고 있어요.",
  curating_courses: "조건에 잘 맞는 코스를 고르고 있어요.",
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
