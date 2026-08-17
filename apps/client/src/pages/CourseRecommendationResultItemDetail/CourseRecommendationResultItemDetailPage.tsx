import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useParams } from "react-router-dom";

import FeedbackState from "../../components/FeedbackState/FeedbackState";
import { Icon } from "../../components/Icon";
import { CoursePage } from "../../features/CourseRecommendation/components/CoursePage";
import { CourseSummaryCard } from "../../features/CourseRecommendation/components/CourseSummaryCard";
import { CourseTimeline } from "../../features/CourseRecommendation/components/CourseTimeline";
import type {
  CourseBookmark,
  CourseOption,
  CourseRecommendation,
} from "../../features/CourseRecommendation/course.types";
import {
  courseBookmarksQueryKey,
  courseOptionQueryKey,
  courseQueryKey,
  removeCourseBookmark,
  updateCourseOptionBookmark,
  updateCourseRecommendationBookmark,
  upsertCourseBookmark,
} from "../../features/CourseRecommendation/courseBookmarks.data";
import { formatCourseReason } from "../../features/CourseRecommendation/courseRecommendation.utils";
import { courseRepository } from "../../features/CourseRecommendation/courseRepository";
import { useAppBackNavigate, useAppNavigate } from "../../routes/useAppNavigate";
import { S } from "./CourseRecommendationResultItemDetailPage.styled";

export const CourseRecommendationResultItemDetailPage = () => {
  const navigate = useAppNavigate();
  const { courseId, optionId } = useParams();
  const resultPath = `/course/recommendation/${encodeURIComponent(courseId ?? "")}`;
  const navigateBack = useAppBackNavigate(resultPath);
  const location = useLocation();
  const bookmarkRoute = (location.state as { readonly bookmark?: CourseBookmark } | null)?.bookmark;
  const bookmarkSnapshot: CourseOption | undefined = bookmarkRoute?.option;
  const queryClient = useQueryClient();
  const optionQuery = useQuery({
    queryKey: courseOptionQueryKey(courseId ?? "", optionId ?? ""),
    queryFn: () => courseRepository.getOption(courseId ?? "", optionId ?? ""),
    enabled: Boolean(courseId && optionId),
    retry: false,
  });
  const bookmark = useMutation({
    mutationFn: async ({
      option,
      isBookmarked,
    }: {
      readonly option: CourseOption;
      readonly isBookmarked: boolean;
    }) => {
      if (bookmarkRoute && !isBookmarked) {
        await courseRepository.removeBookmark(bookmarkRoute);
        return false;
      }
      return courseRepository.toggleBookmark(courseId ?? "", option.id, isBookmarked);
    },
    onMutate: async ({ option, isBookmarked }) => {
      const recommendationKey = courseQueryKey(courseId ?? "");
      const optionKey = courseOptionQueryKey(courseId ?? "", option.id);
      await Promise.all([
        queryClient.cancelQueries({ queryKey: recommendationKey }),
        queryClient.cancelQueries({ queryKey: optionKey }),
        queryClient.cancelQueries({ queryKey: courseBookmarksQueryKey }),
      ]);

      const context = {
        course: queryClient.getQueryData<CourseRecommendation | null>(recommendationKey),
        option: queryClient.getQueryData<CourseOption | null>(optionKey),
        bookmarks: queryClient.getQueryData<readonly CourseBookmark[]>(courseBookmarksQueryKey),
      };

      queryClient.setQueryData<CourseRecommendation | null | undefined>(
        recommendationKey,
        (current) => updateCourseRecommendationBookmark(current, option.id, isBookmarked),
      );
      queryClient.setQueryData<CourseOption | null | undefined>(optionKey, (current) =>
        updateCourseOptionBookmark(current ?? option, isBookmarked),
      );
      queryClient.setQueryData<readonly CourseBookmark[] | undefined>(
        courseBookmarksQueryKey,
        (current) =>
          isBookmarked
            ? upsertCourseBookmark(current, option)
            : removeCourseBookmark(current, option.id),
      );

      return context;
    },
    onSuccess: (isBookmarked, { option }) => {
      const recommendationKey = courseQueryKey(courseId ?? "");
      const optionKey = courseOptionQueryKey(courseId ?? "", option.id);
      queryClient.setQueryData<CourseRecommendation | null | undefined>(
        recommendationKey,
        (current) => updateCourseRecommendationBookmark(current, option.id, isBookmarked),
      );
      queryClient.setQueryData<CourseOption | null | undefined>(optionKey, (current) =>
        updateCourseOptionBookmark(current ?? option, isBookmarked),
      );
      queryClient.setQueryData<readonly CourseBookmark[] | undefined>(
        courseBookmarksQueryKey,
        (current) =>
          isBookmarked
            ? upsertCourseBookmark(current, option)
            : removeCourseBookmark(current, option.id),
      );
      if (bookmarkRoute && !isBookmarked) {
        void navigate("/course/favorite", { replace: true });
      }
    },
    onError: (_error, variables, context) => {
      if (context !== undefined) {
        queryClient.setQueryData(courseQueryKey(courseId ?? ""), context.course);
        queryClient.setQueryData(
          courseOptionQueryKey(courseId ?? "", variables.option.id),
          context.option,
        );
        queryClient.setQueryData(courseBookmarksQueryKey, context.bookmarks);
      }
    },
  });

  if (optionQuery.isPending && !bookmarkSnapshot)
    return (
      <CoursePage onBack={navigateBack} title="코스 상세">
        <FeedbackState kind="loading" title="코스 상세를 불러오는 중이에요" />
      </CoursePage>
    );
  const option = optionQuery.data ?? bookmarkSnapshot;
  if (!option)
    return (
      <CoursePage onBack={navigateBack} title="코스 상세">
        <FeedbackState kind="error" title="코스 상세를 찾을 수 없어요" />
      </CoursePage>
    );

  const omittedCandidates = option.candidateDecisions.filter(({ code }) => code !== "INCLUDED");
  const reason = formatCourseReason(option.reasonTexts) || option.reason;
  const hasAdditionalInfo = Boolean(
    option.mealPlan || option.tradeoffs.length || omittedCandidates.length,
  );

  return (
    <CoursePage onBack={navigateBack} title="코스 상세">
      <S.Detail>
        <CourseSummaryCard
          bookmarkPending={bookmark.isPending}
          onBookmarkToggle={() => bookmark.mutate({ option, isBookmarked: !option.isBookmarked })}
          option={option}
        />
        {bookmark.isError ? (
          <S.InlineError role="alert">코스 찜 상태를 변경하지 못했어요.</S.InlineError>
        ) : null}
        <S.Card>
          <S.SectionLabel>코스 구성 이유</S.SectionLabel>
          <S.Reason>{reason}</S.Reason>
        </S.Card>
        <CourseTimeline option={option} />
        {hasAdditionalInfo ? (
          <S.AdditionalInfo>
            <summary>
              <span>추가 정보</span>
              <Icon name="chevron-right" size={20} />
            </summary>
            <S.AdditionalContent>
              {option.mealPlan ? (
                <S.InfoSection>
                  <h4>식사 계획</h4>
                  <p>{option.mealPlan.reason}</p>
                </S.InfoSection>
              ) : null}
              {option.tradeoffs.length ? (
                <S.InfoSection>
                  <h4>알아둘 점</h4>
                  <S.InfoList>
                    {option.tradeoffs.map((tradeoff) => (
                      <li key={tradeoff}>{tradeoff}</li>
                    ))}
                  </S.InfoList>
                </S.InfoSection>
              ) : null}
              {omittedCandidates.length ? (
                <S.InfoSection>
                  <h4>포함하지 않은 후보</h4>
                  <S.DecisionList>
                    {omittedCandidates.map((decision) => (
                      <li key={`${decision.candidateId}:${decision.code}`}>
                        <strong>{decision.candidateName}</strong>
                        <span>{decision.message}</span>
                      </li>
                    ))}
                  </S.DecisionList>
                </S.InfoSection>
              ) : null}
            </S.AdditionalContent>
          </S.AdditionalInfo>
        ) : null}
      </S.Detail>
    </CoursePage>
  );
};
