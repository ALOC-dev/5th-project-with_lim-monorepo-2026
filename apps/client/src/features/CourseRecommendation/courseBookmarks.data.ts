import type { CourseBookmark, CourseOption, CourseRecommendation } from "./course.types";

export const courseBookmarksQueryKey = ["course-bookmarks"] as const;

export const courseQueryKey = (courseId: string) => ["course", courseId] as const;

export const courseOptionQueryKey = (courseId: string, optionId: string) =>
  ["course-option", courseId, optionId] as const;

const isMatchingBookmark = (bookmark: CourseBookmark, optionId: string): boolean =>
  bookmark.option.id === optionId ||
  bookmark.optionId === optionId ||
  bookmark.sourceCourseOptionId === optionId;

export const updateCourseRecommendationBookmark = (
  recommendation: CourseRecommendation | null | undefined,
  optionId: string,
  isBookmarked: boolean,
): CourseRecommendation | null | undefined => {
  if (recommendation === null || recommendation === undefined) return recommendation;

  return {
    ...recommendation,
    options: recommendation.options.map((option) =>
      option.id === optionId ? { ...option, isBookmarked } : option,
    ),
  };
};

export const updateCourseOptionBookmark = (
  option: CourseOption | null | undefined,
  isBookmarked: boolean,
): CourseOption | null | undefined => {
  if (option === null || option === undefined) return option;
  return { ...option, isBookmarked };
};

export const updateCourseBookmarksBookmark = (
  bookmarks: readonly CourseBookmark[] | undefined,
  optionId: string,
  isBookmarked: boolean,
): readonly CourseBookmark[] | undefined =>
  bookmarks?.map((bookmark) =>
    isMatchingBookmark(bookmark, optionId)
      ? { ...bookmark, option: { ...bookmark.option, isBookmarked } }
      : bookmark,
  );

export const upsertCourseBookmark = (
  bookmarks: readonly CourseBookmark[] | undefined,
  option: CourseOption,
): CourseBookmark[] => {
  const current = bookmarks ?? [];
  const existingIndex = current.findIndex((bookmark) => isMatchingBookmark(bookmark, option.id));
  if (existingIndex !== -1) {
    return current.map((bookmark, index) =>
      index === existingIndex
        ? { ...bookmark, option: { ...bookmark.option, ...option, isBookmarked: true } }
        : bookmark,
    );
  }

  return [
    ...current,
    {
      optionId: option.id,
      recommendationId: option.courseId,
      savedAt: null,
      option: { ...option, isBookmarked: true },
    },
  ];
};

export const removeCourseBookmark = (
  bookmarks: readonly CourseBookmark[] | undefined,
  optionId: string,
): CourseBookmark[] | undefined =>
  bookmarks?.filter((bookmark) => !isMatchingBookmark(bookmark, optionId));
