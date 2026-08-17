import { describe, expect, it } from "vitest";

import type { CourseOption, CourseRecommendation } from "./course.types";
import {
  removeCourseBookmark,
  updateCourseBookmarksBookmark,
  updateCourseOptionBookmark,
  updateCourseRecommendationBookmark,
  upsertCourseBookmark,
} from "./courseBookmarks.data";

const createOption = (id: string, isBookmarked = true): CourseOption =>
  ({ id, courseId: "course-1", isBookmarked }) as CourseOption;

describe("course bookmark cache helpers", () => {
  it("updates only the bookmark flag in a course recommendation", () => {
    const option = createOption("option-1");
    const recommendation = { options: [option] } as unknown as CourseRecommendation;

    expect(updateCourseRecommendationBookmark(recommendation, option.id, false)).toEqual({
      ...recommendation,
      options: [{ ...option, isBookmarked: false }],
    });
  });

  it("updates only the bookmark flag in a bookmark list item", () => {
    const option = createOption("option-1");
    const bookmark = {
      optionId: option.id,
      recommendationId: option.courseId,
      savedAt: null,
      option,
    };

    expect(updateCourseBookmarksBookmark([bookmark], option.id, false)).toEqual([
      { ...bookmark, option: { ...option, isBookmarked: false } },
    ]);
  });

  it("preserves list membership when changing the bookmark flag", () => {
    const first = {
      optionId: "option-1",
      recommendationId: "course-1",
      savedAt: "2026-08-17T00:00:00.000Z",
      option: createOption("option-1"),
    };
    const second = {
      optionId: "option-2",
      recommendationId: "course-1",
      savedAt: "2026-08-16T00:00:00.000Z",
      option: createOption("option-2"),
    };

    const updated = updateCourseBookmarksBookmark([first, second], "option-1", false);

    expect(updated).toHaveLength(2);
    expect(updated?.[1]).toBe(second);
  });

  it("upserts a bookmark for result and detail caches", () => {
    const option = createOption("option-1", false);

    expect(upsertCourseBookmark([], option)).toEqual([
      {
        optionId: option.id,
        recommendationId: option.courseId,
        savedAt: null,
        option: { ...option, isBookmarked: true },
      },
    ]);
  });

  it("removes a bookmark from result and detail caches", () => {
    const option = createOption("option-1");
    const bookmark = {
      optionId: option.id,
      recommendationId: option.courseId,
      savedAt: null,
      option,
    };

    expect(removeCourseBookmark([bookmark], option.id)).toEqual([]);
  });

  it("updates an option cache without changing its other fields", () => {
    const option = { ...createOption("option-1"), title: "기존 제목" };

    expect(updateCourseOptionBookmark(option, false)).toEqual({
      ...option,
      isBookmarked: false,
    });
  });
});
