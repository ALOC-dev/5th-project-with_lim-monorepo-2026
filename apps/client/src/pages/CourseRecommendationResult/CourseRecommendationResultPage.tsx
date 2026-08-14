import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";

import FeedbackState from "../../components/FeedbackState/FeedbackState";
import { CourseMap } from "../../features/CourseRecommendation/components/CourseMap";
import { CoursePage } from "../../features/CourseRecommendation/components/CoursePage";
import {
  formatCourseCost,
  formatMinutes,
  getCourseCandidateCounts,
} from "../../features/CourseRecommendation/courseRecommendation.utils";
import { courseRepository } from "../../features/CourseRecommendation/courseRepository";
import { CourseRecommendationResultPending } from "../../features/CourseRecommendationResult/CourseRecommendationResultPending";
import { useAppBackNavigate, useAppNavigate } from "../../routes/useAppNavigate";
import { createCourseRecommendationRetryRouteState } from "../CourseRecommendationForm/retryDraft";
import { S } from "./CourseRecommendationResultPage.styled";

export const CourseRecommendationResultPage = () => {
  const navigate = useAppNavigate();
  const navigateBack = useAppBackNavigate("/my");
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
  const [selectedId, setSelectedId] = useState<string | null>(null);

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
      <CoursePage onBack={() => navigate("/course/recommendation/form")} title="코스 결과">
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
      <CoursePage onBack={() => navigate("/course/recommendation/history")} title="코스 결과">
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
      <CoursePage onBack={() => navigate("/course/recommendation/history")} title="코스 결과">
        <FeedbackState kind="loading" title="추천 기록을 정리하는 중이에요" />
      </CoursePage>
    );
  }
  if (recommendation.status !== "SUCCESS")
    return (
      <CoursePage onBack={() => navigate("/course/recommendation/history")} title="코스 결과">
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
  const selected =
    recommendation.options.find(({ id }) => id === selectedId) ?? recommendation.options[0];
  if (!selected) return null;
  const selectedIndex = Math.max(
    0,
    recommendation.options.findIndex(({ id }) => id === selected.id),
  );

  return (
    <CoursePage onBack={() => navigate("/course/recommendation/history")} title="코스 결과">
      <S.ResultMap>
        <S.MapLabel aria-live="polite">
          {selectedIndex + 1}번 코스 · {selected.courseType.label}
        </S.MapLabel>
        <CourseMap option={selected} />
      </S.ResultMap>
      <S.Result>
        <S.ResultHeader>
          <S.ResultTitle>
            추천 코스 <S.ResultCount>{recommendation.options.length}개</S.ResultCount>
          </S.ResultTitle>
          <S.SelectionStatus aria-live="polite">
            {selectedIndex + 1}번 코스 선택됨
          </S.SelectionStatus>
        </S.ResultHeader>
        {recommendation.legacy ? <S.LegacyBadge>이전 추천 결과</S.LegacyBadge> : null}
        {recommendation.options.map((option, index) => {
          const counts = getCourseCandidateCounts(option);
          const omitted = option.candidateDecisions.filter(({ code }) => code !== "INCLUDED");
          return (
            <S.Option $selected={option.id === selected.id} key={option.id}>
              <S.OptionRow>
                <S.OptionSelect
                  aria-label={`${index + 1}번 ${option.courseType.label} 코스 선택`}
                  aria-pressed={option.id === selected.id}
                  onClick={() => setSelectedId(option.id)}
                  type="button"
                >
                  <b>{option.rank}</b>
                  <span>
                    <strong>{option.title}</strong>
                    <small>{option.stops.map((stop) => stop.name).join(" → ")}</small>
                    <small>
                      후보 {counts.total}곳 중 {counts.included}곳 사용 · 총{" "}
                      {formatMinutes(option.totalDurationMinutes)} · 도보{" "}
                      {option.totalTravelMinutes}분
                    </small>
                    <small>{formatCourseCost(option.estimatedCostPerPerson)}</small>
                  </span>
                </S.OptionSelect>
                <S.TextButton
                  aria-label={`${index + 1}번 ${option.courseType.label} 코스 상세 보기`}
                  onClick={() =>
                    void navigate(
                      `/course/recommendation/${encodeURIComponent(courseId)}/option/${encodeURIComponent(option.id)}`,
                    )
                  }
                  type="button"
                >
                  상세 보기
                </S.TextButton>
              </S.OptionRow>
              <S.OptionReason>{option.reasonTexts[0]}</S.OptionReason>
              {omitted.length ? (
                <S.Decisions>
                  <summary>포함하지 않은 후보 {omitted.length}곳</summary>
                  <ul>
                    {omitted.map((decision) => (
                      <li key={`${decision.candidateId}:${decision.code}`}>
                        <strong>{decision.candidateName}</strong> · {decision.message}
                      </li>
                    ))}
                  </ul>
                </S.Decisions>
              ) : null}
            </S.Option>
          );
        })}
      </S.Result>
    </CoursePage>
  );
};
