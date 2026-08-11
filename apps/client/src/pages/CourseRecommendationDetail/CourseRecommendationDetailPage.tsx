import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import FeedbackState from "../../components/FeedbackState/FeedbackState";
import { CourseMap } from "../../features/CourseRecommendation/components/CourseMap";
import { CoursePage } from "../../features/CourseRecommendation/components/CoursePage";
import { formatMinutes } from "../../features/CourseRecommendation/courseRecommendation.utils";
import { courseRepository } from "../../features/CourseRecommendation/courseRepository";
import { CourseRecommendationPending } from "./components/CourseRecommendationPending";
import { S } from "./CourseRecommendationDetailPage.styled";

export const CourseRecommendationDetailPage = () => {
  const navigate = useNavigate();
  const { courseId } = useParams();
  const queryClient = useQueryClient();
  const cancelledHandled = useRef(false);
  const result = useQuery({
    queryKey: ["course", courseId],
    queryFn: () => courseRepository.getRecommendation(courseId ?? ""),
    enabled: Boolean(courseId),
    refetchInterval: (query) => (query.state.data?.status === "PENDING" ? 5_000 : false),
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
    window.alert("취소된 기록입니다.");
    void navigate("/course/recommendation/history", { replace: true });
  }, [navigate]);

  useEffect(() => {
    if (result.data?.status === "CANCELLED") handleCancelled();
  }, [handleCancelled, result.data?.status]);

  if (result.isPending)
    return (
      <CoursePage onBack={() => navigate(-1)} title="코스 결과">
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
            onClick: () => void navigate("/course/recommendation/form"),
          }}
          kind="empty"
          title="조건에 맞는 코스를 찾지 못했어요"
        />
      </CoursePage>
    );
  if (recommendation.status === "PENDING") {
    return (
      <CourseRecommendationPending
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
            onClick: () => void navigate("/course/recommendation/form"),
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
          {selectedIndex + 1}번 코스 · {selected.type}
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
        {recommendation.options.map((option, index) => (
          <S.Option $selected={option.id === selected.id} key={option.id}>
            <S.OptionSelect
              aria-label={`${index + 1}번 ${option.type} 코스 선택`}
              aria-pressed={option.id === selected.id}
              onClick={() => setSelectedId(option.id)}
              type="button"
            >
              <b>{index + 1}</b>
              <span>
                <strong>{option.type}</strong>
                <small>{option.stops.map((stop) => stop.name).join(" → ")}</small>
                <small>
                  {option.stops.length}곳 · 총 {formatMinutes(option.totalDurationMinutes)} · 이동{" "}
                  {option.totalTravelMinutes}분
                </small>
              </span>
            </S.OptionSelect>
            <S.TextButton
              aria-label={`${index + 1}번 ${option.type} 코스 상세 보기`}
              onClick={() =>
                void navigate(
                  `/course/recommendation/${encodeURIComponent(courseId)}/option/${encodeURIComponent(option.id)}`,
                )
              }
              type="button"
            >
              상세 보기
            </S.TextButton>
          </S.Option>
        ))}
      </S.Result>
    </CoursePage>
  );
};
