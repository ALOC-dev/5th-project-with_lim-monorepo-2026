import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";

import FeedbackState from "../../components/FeedbackState/FeedbackState";
import { CoursePage } from "../../features/CourseRecommendation/components/CoursePage";
import { CourseSummaryCard } from "../../features/CourseRecommendation/components/CourseSummaryCard";
import { courseRepository } from "../../features/CourseRecommendation/courseRepository";
import { CourseRecommendationResultPending } from "../../features/CourseRecommendationResult/CourseRecommendationResultPending";
import { useAppBackNavigate, useAppNavigate } from "../../routes/useAppNavigate";
import { createCourseRecommendationRetryRouteState } from "../CourseRecommendationForm/retryDraft";
import { S } from "./CourseRecommendationResultPage.styled";

export const CourseRecommendationResultPage = () => {
  const navigate = useAppNavigate();
  const navigateBack = useAppBackNavigate("/");
  const { courseId } = useParams();
  const queryClient = useQueryClient();
  const cancelledHandled = useRef(false);
  const result = useQuery({
    queryKey: ["course", courseId],
    queryFn: () => courseRepository.getRecommendation(courseId ?? ""),
    enabled: Boolean(courseId),
    refetchInterval: (query) =>
      query.state.data?.status === "PENDING" || query.state.data?.status === "RUNNING"
        ? 5_000
        : false,
    retry: false,
  });
  const favorite = useMutation({
    mutationFn: ({ optionId, value }: { readonly optionId: string; readonly value: boolean }) =>
      courseRepository.toggleFavorite(courseId ?? "", optionId, value),
    onSuccess: (_result, { optionId }) => {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ["course", courseId] }),
        queryClient.invalidateQueries({ queryKey: ["course-option", courseId, optionId] }),
        queryClient.invalidateQueries({ queryKey: ["course-favorites"] }),
      ]);
    },
    onError: () => toast.error("코스 찜 상태를 변경하지 못했어요."),
  });

  const refreshStatus = useCallback(() => {
    if (!courseId) return;
    void queryClient.invalidateQueries({ queryKey: ["course", courseId] });
  }, [courseId, queryClient]);
  const handleCancelled = useCallback(() => {
    if (cancelledHandled.current) return;
    cancelledHandled.current = true;
    toast.warning("취소된 기록입니다.");
    void navigate("/course/recommendation/history", { replace: true });
  }, [navigate]);

  useEffect(() => {
    if (result.data?.status === "CANCELLED") handleCancelled();
  }, [handleCancelled, result.data?.status]);

  if (result.isPending)
    return (
      <CoursePage onBack={navigateBack} title="코스 결과">
        <FeedbackState kind="loading" title="추천 결과를 불러오는 중이에요" />
      </CoursePage>
    );
  const recommendation = result.data;
  if (!recommendation || !courseId)
    return (
      <CoursePage onBack={navigateBack} title="코스 결과">
        <FeedbackState
          action={{
            label: "다시 추천받기",
            onClick: () => void navigate("/course/recommendation/form"),
          }}
          description="추천 기록에서 다시 열거나 새 추천을 요청해 주세요."
          kind="error"
          title="추천 결과를 찾을 수 없어요"
        />
      </CoursePage>
    );
  if (recommendation.status === "EMPTY")
    return (
      <CoursePage onBack={navigateBack} title="코스 결과">
        <FeedbackState
          action={{
            label: "다시 추천받기",
            onClick: () =>
              void navigate("/course/recommendation/form", {
                state: createCourseRecommendationRetryRouteState(recommendation.input),
              }),
          }}
          description={
            recommendation.candidateDecisions.length
              ? recommendation.candidateDecisions
                  .filter(({ code }) => code !== "INCLUDED")
                  .slice(0, 3)
                  .map(({ candidateName, message }) => `${candidateName}: ${message}`)
                  .join(" · ")
              : "후보 장소의 영업시간과 이동 조건을 바꿔 다시 시도해 주세요."
          }
          kind="empty"
          title="조건에 맞는 코스를 찾지 못했어요"
        />
      </CoursePage>
    );
  if (recommendation.status === "PENDING" || recommendation.status === "RUNNING") {
    return (
      <CourseRecommendationResultPending
        courseId={courseId}
        onCancelled={handleCancelled}
        onTerminal={refreshStatus}
      />
    );
  }
  if (recommendation.status === "CANCELLED") {
    return (
      <CoursePage onBack={navigateBack} title="코스 결과">
        <FeedbackState kind="loading" title="추천 기록을 정리하는 중이에요" />
      </CoursePage>
    );
  }
  if (recommendation.status !== "SUCCESS")
    return (
      <CoursePage onBack={navigateBack} title="코스 결과">
        <FeedbackState
          action={{
            label: "다시 추천받기",
            onClick: () =>
              void navigate("/course/recommendation/form", {
                state: createCourseRecommendationRetryRouteState(recommendation.input),
              }),
          }}
          description={recommendation.errorMessage}
          kind="error"
          title="추천 결과를 불러오지 못했어요"
        />
      </CoursePage>
    );
  return (
    <CoursePage onBack={navigateBack} title="코스 결과">
      <S.Result>
        <S.ResultHeader>
          <S.ResultTitle>
            추천 코스 <S.ResultCount>{recommendation.options.length}개</S.ResultCount>
          </S.ResultTitle>
          <S.ResultDescription>장소 흐름과 이동 시간을 확인해 보세요.</S.ResultDescription>
        </S.ResultHeader>
        {recommendation.options.map((option) => {
          return (
            <CourseSummaryCard
              favoritePending={favorite.isPending && favorite.variables?.optionId === option.id}
              key={option.id}
              onFavoriteToggle={() =>
                favorite.mutate({ optionId: option.id, value: !option.isFavorite })
              }
              onOpen={() =>
                void navigate(
                  `/course/recommendation/${encodeURIComponent(courseId)}/option/${encodeURIComponent(option.id)}`,
                )
              }
              option={option}
              showRank
              showReason
            />
          );
        })}
      </S.Result>
    </CoursePage>
  );
};
