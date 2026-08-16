import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useParams } from "react-router-dom";

import FeedbackState from "../../components/FeedbackState/FeedbackState";
import { Icon } from "../../components/Icon";
import { CoursePage } from "../../features/CourseRecommendation/components/CoursePage";
import { CourseSummaryCard } from "../../features/CourseRecommendation/components/CourseSummaryCard";
import { CourseTimeline } from "../../features/CourseRecommendation/components/CourseTimeline";
import type {
  CourseFavorite,
  CourseOption,
} from "../../features/CourseRecommendation/course.types";
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
  const favoriteRoute = (location.state as { readonly favorite?: CourseFavorite } | null)?.favorite;
  const favoriteSnapshot: CourseOption | undefined = favoriteRoute?.option;
  const queryClient = useQueryClient();
  const optionQuery = useQuery({
    queryKey: ["course-option", courseId, optionId],
    queryFn: () => courseRepository.getOption(courseId ?? "", optionId ?? ""),
    enabled: Boolean(courseId && optionId),
    retry: false,
  });
  const favorite = useMutation({
    mutationFn: (value: boolean) =>
      favoriteRoute && !value
        ? courseRepository.removeFavorite(favoriteRoute)
        : courseRepository.toggleFavorite(courseId ?? "", optionId ?? "", value),
    onSuccess: (_result, value) => {
      if (favoriteRoute && !value) {
        void navigate("/course/favorite", { replace: true });
        return;
      }
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ["course-option", courseId, optionId] }),
        queryClient.invalidateQueries({ queryKey: ["course", courseId] }),
        queryClient.invalidateQueries({ queryKey: ["course-favorites"] }),
      ]);
    },
  });

  if (optionQuery.isPending && !favoriteSnapshot)
    return (
      <CoursePage onBack={navigateBack} title="코스 상세">
        <FeedbackState kind="loading" title="코스 상세를 불러오는 중이에요" />
      </CoursePage>
    );
  const option = optionQuery.data ?? favoriteSnapshot;
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
          favoritePending={favorite.isPending}
          onFavoriteToggle={() => favorite.mutate(!option.isFavorite)}
          option={option}
        />
        {favorite.isError ? (
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
