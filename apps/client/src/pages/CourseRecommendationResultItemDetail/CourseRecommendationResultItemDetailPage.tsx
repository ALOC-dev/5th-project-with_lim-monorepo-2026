import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";

import FeedbackState from "../../components/FeedbackState/FeedbackState";
import { Icon } from "../../components/Icon";
import { CourseIconButton } from "../../features/CourseRecommendation/components/CourseIconButton";
import { CourseMap } from "../../features/CourseRecommendation/components/CourseMap";
import { CoursePage } from "../../features/CourseRecommendation/components/CoursePage";
import {
  formatCurrency,
  formatMinutes,
} from "../../features/CourseRecommendation/courseRecommendation.utils";
import { courseRepository } from "../../features/CourseRecommendation/courseRepository";
import { S } from "./CourseRecommendationResultItemDetailPage.styled";

export const CourseRecommendationResultItemDetailPage = () => {
  const navigate = useNavigate();
  const { courseId, optionId } = useParams();
  const queryClient = useQueryClient();
  const optionQuery = useQuery({
    queryKey: ["course-option", courseId, optionId],
    queryFn: () => courseRepository.getOption(courseId ?? "", optionId ?? ""),
    enabled: Boolean(courseId && optionId),
    retry: false,
  });
  const favorite = useMutation({
    mutationFn: (value: boolean) =>
      courseRepository.toggleFavorite(courseId ?? "", optionId ?? "", value),
    onSuccess: () =>
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ["course-option", courseId, optionId] }),
        queryClient.invalidateQueries({ queryKey: ["course", courseId] }),
        queryClient.invalidateQueries({ queryKey: ["course-favorites"] }),
      ]),
  });

  if (optionQuery.isPending)
    return (
      <CoursePage onBack={() => navigate(-1)} title="코스 상세">
        <FeedbackState kind="loading" title="코스 상세를 불러오는 중이에요" />
      </CoursePage>
    );
  const option = optionQuery.data;
  if (!option)
    return (
      <CoursePage onBack={() => navigate("/course/recommendation/history")} title="코스 상세">
        <FeedbackState kind="error" title="코스 상세를 찾을 수 없어요" />
      </CoursePage>
    );

  return (
    <CoursePage
      onBack={() => navigate(`/course/recommendation/${encodeURIComponent(courseId ?? "")}`)}
      right={
        <CourseIconButton
          aria-label={option.isFavorite ? "코스 찜 해제" : "코스 찜하기"}
          disabled={favorite.isPending}
          onClick={() => favorite.mutate(!option.isFavorite)}
          type="button"
        >
          <Icon name={option.isFavorite ? "heart-filled" : "heart-outline"} />
        </CourseIconButton>
      }
      title="코스 상세"
    >
      <S.Detail>
        <CourseMap height="232px" option={option} />
        {favorite.isError ? (
          <S.InlineError role="alert">코스 찜 상태를 변경하지 못했어요.</S.InlineError>
        ) : null}
        <S.Card>
          <S.Heading>{option.title}</S.Heading>
          <span>
            {option.stops.length}곳 · 총 {formatMinutes(option.totalDurationMinutes)} · 이동{" "}
            {option.totalTravelMinutes}분 · 1인 {formatCurrency(option.pricePerPersonWon)}
          </span>
          <S.Route>{option.stops.map((stop) => stop.name).join(" → ")}</S.Route>
        </S.Card>
        <S.Card>
          <h3>코스 구성 이유</h3>
          <p>{option.reason}</p>
        </S.Card>
        <S.Card>
          <h3>시간순 코스</h3>
          {option.stops.map((stop, index) => (
            <S.Stop key={stop.id}>
              <time>{stop.visitTime}</time>
              <b>{index + 1}</b>
              <span>
                <strong>{stop.name}</strong>
                <small>
                  {stop.activityLabel} · {stop.stayMinutes}분 체류
                </small>
              </span>
            </S.Stop>
          ))}
        </S.Card>
      </S.Detail>
    </CoursePage>
  );
};
