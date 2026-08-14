import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useParams } from "react-router-dom";

import FeedbackState from "../../components/FeedbackState/FeedbackState";
import { Icon } from "../../components/Icon";
import { CourseIconButton } from "../../features/CourseRecommendation/components/CourseIconButton";
import { CourseMap } from "../../features/CourseRecommendation/components/CourseMap";
import { CoursePage } from "../../features/CourseRecommendation/components/CoursePage";
import type {
  CourseFavorite,
  CourseOption,
} from "../../features/CourseRecommendation/course.types";
import {
  formatCourseCost,
  formatMinutes,
  getCourseCandidateCounts,
} from "../../features/CourseRecommendation/courseRecommendation.utils";
import { courseRepository } from "../../features/CourseRecommendation/courseRepository";
import { useAppBackNavigate, useAppNavigate } from "../../routes/useAppNavigate";
import { S } from "./CourseRecommendationResultItemDetailPage.styled";

export const CourseRecommendationResultItemDetailPage = () => {
  const navigate = useAppNavigate();
  const navigateBack = useAppBackNavigate("/course/recommendation/history");
  const { courseId, optionId } = useParams();
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
      <CoursePage onBack={() => navigate("/course/recommendation/history")} title="코스 상세">
        <FeedbackState kind="error" title="코스 상세를 찾을 수 없어요" />
      </CoursePage>
    );

  const candidateCounts = getCourseCandidateCounts(option);
  const omittedCandidates = option.candidateDecisions.filter(({ code }) => code !== "INCLUDED");

  return (
    <CoursePage
      onBack={() =>
        favoriteSnapshot
          ? navigate("/course/favorite")
          : navigate(`/course/recommendation/${encodeURIComponent(courseId ?? "")}`)
      }
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
        {option.routePathSource !== "TMAP" ? (
          <S.MapNotice>
            지도에는 방문 순서만 표시하며 실제 도보 경로선은 제공하지 않아요.
          </S.MapNotice>
        ) : null}
        {favorite.isError ? (
          <S.InlineError role="alert">코스 찜 상태를 변경하지 못했어요.</S.InlineError>
        ) : null}
        <S.Card>
          <S.Heading>{option.title}</S.Heading>
          <S.TypeDescription>{option.courseType.description}</S.TypeDescription>
          <span>
            {option.stops.length}곳 · 총 {formatMinutes(option.totalDurationMinutes)} · 이동{" "}
            {option.totalTravelMinutes}분 · {formatCourseCost(option.estimatedCostPerPerson)}
          </span>
          {!option.legacy ? (
            <span>
              {option.startTime}~{option.endTime} · 체류 {option.totalStayMinutes}분 · 후보{" "}
              {candidateCounts.total}곳 중 {candidateCounts.included}곳 사용
            </span>
          ) : (
            <S.LegacyBadge>이전 추천 결과</S.LegacyBadge>
          )}
          <S.Route>{option.stops.map((stop) => stop.name).join(" → ")}</S.Route>
        </S.Card>
        <S.Card>
          <h3>코스 구성 이유</h3>
          <S.ReasonList>
            {option.reasonTexts.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </S.ReasonList>
          {option.tradeoffs.length ? (
            <>
              <h4>알아둘 점</h4>
              <S.ReasonList>
                {option.tradeoffs.map((tradeoff) => (
                  <li key={tradeoff}>{tradeoff}</li>
                ))}
              </S.ReasonList>
            </>
          ) : null}
          {option.mealPlan ? (
            <S.MealPlan>
              <strong>식사 계획</strong>
              <span>{option.mealPlan.reason}</span>
            </S.MealPlan>
          ) : null}
        </S.Card>
        <S.Card>
          <h3>시간순 코스</h3>
          {option.stops.map((stop, index) => (
            <div key={stop.id}>
              {index > 0 ? (
                <S.Leg>
                  도보 {stop.travelMinutesFromPrevious}분
                  {stop.waitMinutesFromPrevious > 0
                    ? ` · 도착 후 ${stop.waitMinutesFromPrevious}분 대기`
                    : ""}
                </S.Leg>
              ) : null}
              <S.Stop>
                <time>{stop.visitTime}</time>
                <b>{index + 1}</b>
                <span>
                  <strong>{stop.name}</strong>
                  <small>
                    {stop.category} · {stop.activityLabel} · {stop.stayMinutes}분 체류
                  </small>
                  {stop.placeUrl ? (
                    <a href={stop.placeUrl} rel="noreferrer" target="_blank">
                      카카오맵에서 정확한 장소 보기
                    </a>
                  ) : (
                    <small>지도 상세 링크 미확인</small>
                  )}
                </span>
              </S.Stop>
            </div>
          ))}
        </S.Card>
        {omittedCandidates.length ? (
          <S.Card>
            <h3>포함하지 않은 후보</h3>
            <S.DecisionList>
              {omittedCandidates.map((decision) => (
                <li key={`${decision.candidateId}:${decision.code}`}>
                  <strong>{decision.candidateName}</strong>
                  <span>{decision.message}</span>
                </li>
              ))}
            </S.DecisionList>
          </S.Card>
        ) : null}
      </S.Detail>
    </CoursePage>
  );
};
