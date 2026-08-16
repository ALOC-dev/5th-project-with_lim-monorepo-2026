import { type CourseFailureCode, CourseFailureCodeSchema } from "@monorepo/api-contracts";

import type { CourseEngineFailureCode } from "./engine.js";

export type CourseFailurePresentation = {
  readonly code: CourseFailureCode;
  readonly message: string;
};

const COURSE_ENGINE_FAILURE_MESSAGES: Record<CourseEngineFailureCode, CourseFailurePresentation> = {
  COURSE_INVALID_INPUT: {
    code: "COURSE_INVALID_INPUT",
    message: "코스 추천 입력을 확인해 주세요.",
  },
  COURSE_CANDIDATE_NOT_FOUND: {
    code: "COURSE_CANDIDATE_NOT_FOUND",
    message: "선택한 후보 장소를 찾을 수 없습니다.",
  },
  COURSE_CANDIDATE_FORBIDDEN: {
    code: "COURSE_CANDIDATE_FORBIDDEN",
    message: "선택한 저장 장소를 사용할 수 없습니다.",
  },
  COURSE_CANDIDATE_LOOKUP_UNAVAILABLE: {
    code: "COURSE_CANDIDATE_LOOKUP_UNAVAILABLE",
    message: "후보 장소 정보를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  },
  COURSE_ENGINE_UNAVAILABLE: {
    code: "COURSE_ENGINE_UNAVAILABLE",
    message: "코스 추천 서비스를 지금 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.",
  },
  COURSE_ROUTE_UNAVAILABLE: {
    code: "COURSE_ROUTE_UNAVAILABLE",
    message: "선택한 장소 사이의 이동 경로를 찾지 못했습니다. 장소를 바꿔 다시 시도해 주세요.",
  },
  COURSE_NO_FEASIBLE_COURSES: {
    code: "COURSE_NO_FEASIBLE_COURSES",
    message: "요청한 일정으로 만들 수 있는 코스가 없습니다.",
  },
  COURSE_ENGINE_FAILURE: {
    code: "COURSE_ENGINE_FAILURE",
    message: "코스 추천을 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  },
  COURSE_PERSISTENCE_FAILURE: {
    code: "COURSE_PERSISTENCE_FAILURE",
    message: "코스 추천 결과를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  },
};

export const UNEXPECTED_COURSE_FAILURE: CourseFailurePresentation = Object.freeze({
  code: "COURSE_ENGINE_FAILURE",
  message: "코스 추천을 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.",
});

const COURSE_FAILURE_PRESENTATIONS: Record<CourseFailureCode, CourseFailurePresentation> =
  COURSE_ENGINE_FAILURE_MESSAGES;

export const presentCourseEngineFailure = (
  code: CourseEngineFailureCode,
): CourseFailurePresentation => COURSE_ENGINE_FAILURE_MESSAGES[code];

export const presentStoredCourseFailure = (code: string | null): CourseFailurePresentation => {
  const parsedCode = CourseFailureCodeSchema.safeParse(code);
  return parsedCode.success
    ? COURSE_FAILURE_PRESENTATIONS[parsedCode.data]
    : UNEXPECTED_COURSE_FAILURE;
};

const toInternalErrorDetails = (failure: unknown) => {
  if (failure instanceof Error) {
    return {
      errorName: failure.name || "Error",
      errorMessage: failure.message || "Unknown course recommendation error",
    };
  }

  let errorMessage: string;
  try {
    errorMessage = String(failure);
  } catch {
    errorMessage = "Unserializable course recommendation error";
  }

  return {
    errorName: "UnknownError",
    errorMessage,
  };
};

export const logCourseRecommendationFailure = (
  event: string,
  courseId: string,
  failure: unknown,
): void => {
  console.error(
    JSON.stringify({
      event,
      courseId,
      ...toInternalErrorDetails(failure),
    }),
  );
};
