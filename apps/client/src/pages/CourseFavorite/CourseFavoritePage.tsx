import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import FeedbackState from "../../components/FeedbackState/FeedbackState";
import { Icon } from "../../components/Icon";
import { Skeleton } from "../../components/Skeleton";
import { CourseIconButton } from "../../features/CourseRecommendation/components/CourseIconButton";
import { CoursePage } from "../../features/CourseRecommendation/components/CoursePage";
import type {
  CourseBookmark,
  CourseOption,
  CourseRecommendation,
} from "../../features/CourseRecommendation/course.types";
import {
  courseBookmarksQueryKey,
  courseOptionQueryKey,
  courseQueryKey,
  updateCourseBookmarksBookmark,
  updateCourseOptionBookmark,
  updateCourseRecommendationBookmark,
} from "../../features/CourseRecommendation/courseBookmarks.data";
import {
  formatDate,
  formatMinutes,
} from "../../features/CourseRecommendation/courseRecommendation.utils";
import { courseRepository } from "../../features/CourseRecommendation/courseRepository";
import { useAppBackNavigate, useAppNavigate } from "../../routes/useAppNavigate";
import { S } from "./CourseFavoritePage.styled";

const skeletonCardKeys = ["first", "second", "third"] as const;

const CourseBookmarksSkeleton = () => (
  <S.SkeletonList aria-busy="true" aria-label="찜한 코스를 불러오는 중이에요" role="status">
    {skeletonCardKeys.map((key) => (
      <S.SkeletonCard key={key}>
        <S.SkeletonDate>
          <Skeleton height={12} width={68} />
        </S.SkeletonDate>
        <S.SkeletonInfo>
          <Skeleton height={20} width="66%" />
          <Skeleton height={12} width="84%" />
        </S.SkeletonInfo>
        <Skeleton borderRadius="50%" height={44} width={44} />
      </S.SkeletonCard>
    ))}
  </S.SkeletonList>
);

export const CourseBookmarksPage = () => {
  const navigate = useAppNavigate();
  const navigateBack = useAppBackNavigate("/my");
  const queryClient = useQueryClient();
  const bookmarks = useQuery({
    queryKey: courseBookmarksQueryKey,
    queryFn: () => courseRepository.listBookmarks(),
    retry: false,
  });
  const bookmark = useMutation({
    mutationFn: async ({
      bookmark: currentBookmark,
      isBookmarked,
    }: {
      readonly bookmark: CourseBookmark;
      readonly isBookmarked: boolean;
    }) => {
      if (!isBookmarked) {
        await courseRepository.removeBookmark(currentBookmark);
        return false;
      }
      return courseRepository.toggleBookmark(
        currentBookmark.recommendationId,
        currentBookmark.optionId,
        true,
      );
    },
    onMutate: async ({ bookmark: currentBookmark, isBookmarked }) => {
      const recommendationKey = courseQueryKey(currentBookmark.recommendationId);
      const optionKey = courseOptionQueryKey(
        currentBookmark.recommendationId,
        currentBookmark.option.id,
      );
      await Promise.all([
        queryClient.cancelQueries({ queryKey: courseBookmarksQueryKey }),
        queryClient.cancelQueries({ queryKey: recommendationKey }),
        queryClient.cancelQueries({ queryKey: optionKey }),
      ]);

      const context = {
        bookmarks: queryClient.getQueryData<readonly CourseBookmark[]>(courseBookmarksQueryKey),
        course: queryClient.getQueryData<CourseRecommendation | null>(recommendationKey),
        option: queryClient.getQueryData<CourseOption | null>(optionKey),
      };

      queryClient.setQueryData<readonly CourseBookmark[] | undefined>(
        courseBookmarksQueryKey,
        (current) =>
          updateCourseBookmarksBookmark(current, currentBookmark.option.id, isBookmarked),
      );
      queryClient.setQueryData<CourseRecommendation | null | undefined>(
        recommendationKey,
        (current) =>
          updateCourseRecommendationBookmark(current, currentBookmark.option.id, isBookmarked),
      );
      queryClient.setQueryData<CourseOption | null | undefined>(optionKey, (current) =>
        updateCourseOptionBookmark(current ?? currentBookmark.option, isBookmarked),
      );

      return context;
    },
    onSuccess: (isBookmarked, { bookmark: currentBookmark }) => {
      const recommendationKey = courseQueryKey(currentBookmark.recommendationId);
      const optionKey = courseOptionQueryKey(
        currentBookmark.recommendationId,
        currentBookmark.option.id,
      );
      queryClient.setQueryData<readonly CourseBookmark[] | undefined>(
        courseBookmarksQueryKey,
        (current) =>
          updateCourseBookmarksBookmark(current, currentBookmark.option.id, isBookmarked),
      );
      queryClient.setQueryData<CourseRecommendation | null | undefined>(
        recommendationKey,
        (current) =>
          updateCourseRecommendationBookmark(current, currentBookmark.option.id, isBookmarked),
      );
      queryClient.setQueryData<CourseOption | null | undefined>(optionKey, (current) =>
        updateCourseOptionBookmark(current ?? currentBookmark.option, isBookmarked),
      );
    },
    onError: (_error, variables, context) => {
      if (context === undefined) return;
      queryClient.setQueryData(courseBookmarksQueryKey, context.bookmarks);
      queryClient.setQueryData(courseQueryKey(variables.bookmark.recommendationId), context.course);
      queryClient.setQueryData(
        courseOptionQueryKey(variables.bookmark.recommendationId, variables.bookmark.option.id),
        context.option,
      );
    },
  });

  return (
    <CoursePage onBack={navigateBack} title="찜한 코스 보기">
      {bookmarks.isPending ? (
        <CourseBookmarksSkeleton />
      ) : bookmarks.isError ? (
        <FeedbackState
          action={{ label: "다시 시도", onClick: () => void bookmarks.refetch() }}
          kind="error"
          title="찜한 코스를 불러오지 못했어요"
        />
      ) : !bookmarks.data?.length ? (
        <FeedbackState
          action={{
            label: "추천 기록 보기",
            onClick: () => void navigate("/course/recommendation/history"),
          }}
          kind="empty"
          title="아직 찜한 코스가 없어요"
        />
      ) : (
        <S.BookmarkContent>
          {bookmark.isError ? (
            <S.InlineError role="alert">찜 상태를 변경하지 못했어요.</S.InlineError>
          ) : null}
          <S.BookmarkList>
            {bookmarks.data.map((bookmarkItem) => (
              <S.Bookmark key={`${bookmarkItem.recommendationId}:${bookmarkItem.optionId}`}>
                <time>
                  {bookmarkItem.savedAt ? formatDate(bookmarkItem.savedAt) : "저장일 정보 없음"}
                </time>
                <S.BookmarkOpen
                  onClick={() =>
                    void navigate(
                      `/course/recommendation/${encodeURIComponent(bookmarkItem.recommendationId)}/option/${encodeURIComponent(bookmarkItem.optionId)}`,
                      { state: { bookmark: bookmarkItem } },
                    )
                  }
                  type="button"
                >
                  <strong>{bookmarkItem.option.title}</strong>
                  <small>
                    {bookmarkItem.option.stops.length}곳 · 이동{" "}
                    {bookmarkItem.option.totalTravelMinutes}분 ·{" "}
                    {formatMinutes(bookmarkItem.option.totalDurationMinutes)}
                  </small>
                </S.BookmarkOpen>
                <CourseIconButton
                  $isBookmarked={bookmarkItem.option.isBookmarked}
                  aria-busy={bookmark.isPending}
                  aria-label={`${bookmarkItem.option.title} ${bookmarkItem.option.isBookmarked ? "찜 해제" : "찜하기"}`}
                  aria-pressed={bookmarkItem.option.isBookmarked}
                  disabled={bookmark.isPending}
                  onClick={() =>
                    bookmark.mutate({
                      bookmark: bookmarkItem,
                      isBookmarked: !bookmarkItem.option.isBookmarked,
                    })
                  }
                  type="button"
                >
                  <Icon
                    name={bookmarkItem.option.isBookmarked ? "heart-filled" : "heart-outline"}
                  />
                </CourseIconButton>
              </S.Bookmark>
            ))}
          </S.BookmarkList>
        </S.BookmarkContent>
      )}
    </CoursePage>
  );
};
