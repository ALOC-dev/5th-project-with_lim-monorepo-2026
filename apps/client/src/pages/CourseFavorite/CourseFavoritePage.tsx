import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import FeedbackState from "../../components/FeedbackState/FeedbackState";
import { Icon } from "../../components/Icon";
import { CourseIconButton } from "../../features/CourseRecommendation/components/CourseIconButton";
import { CoursePage } from "../../features/CourseRecommendation/components/CoursePage";
import {
  formatDate,
  formatMinutes,
} from "../../features/CourseRecommendation/courseRecommendation.utils";
import { courseRepository } from "../../features/CourseRecommendation/courseRepository";
import { S } from "./CourseFavoritePage.styled";

export const CourseFavoritePage = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const favorites = useQuery({
    queryKey: ["course-favorites"],
    queryFn: () => courseRepository.listFavorites(),
    retry: false,
  });
  const remove = useMutation({
    mutationFn: (favorite: { courseId: string; optionId: string }) =>
      courseRepository.toggleFavorite(favorite.courseId, favorite.optionId, false),
    onSuccess: (_result, favorite) =>
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ["course-favorites"] }),
        queryClient.invalidateQueries({
          queryKey: ["course-option", favorite.courseId, favorite.optionId],
        }),
        queryClient.invalidateQueries({ queryKey: ["course", favorite.courseId] }),
      ]),
  });

  return (
    <CoursePage onBack={() => navigate(-1)} title="찜한 코스 보기">
      {favorites.isPending ? (
        <FeedbackState kind="loading" title="찜한 코스를 불러오는 중이에요" />
      ) : favorites.isError ? (
        <FeedbackState
          action={{ label: "다시 시도", onClick: () => void favorites.refetch() }}
          kind="error"
          title="찜한 코스를 불러오지 못했어요"
        />
      ) : !favorites.data?.length ? (
        <FeedbackState
          action={{
            label: "추천 기록 보기",
            onClick: () => void navigate("/course/recommendation/history"),
          }}
          kind="empty"
          title="아직 찜한 코스가 없어요"
        />
      ) : (
        <S.FavoriteContent>
          {remove.isError ? (
            <S.InlineError role="alert">찜을 해제하지 못했어요.</S.InlineError>
          ) : null}
          <S.FavoriteList>
            {favorites.data.map((favorite) => (
              <S.Favorite key={`${favorite.recommendationId}:${favorite.optionId}`}>
                <time>{formatDate(favorite.savedAt)}</time>
                <S.FavoriteOpen
                  onClick={() =>
                    void navigate(
                      `/course/recommendation/${encodeURIComponent(favorite.recommendationId)}/option/${encodeURIComponent(favorite.optionId)}`,
                    )
                  }
                  type="button"
                >
                  <strong>{favorite.option.title}</strong>
                  <small>
                    {favorite.option.stops.length}곳 · 이동 {favorite.option.totalTravelMinutes}분 ·{" "}
                    {formatMinutes(favorite.option.totalDurationMinutes)}
                  </small>
                </S.FavoriteOpen>
                <CourseIconButton
                  aria-label={`${favorite.option.title} 찜 삭제`}
                  disabled={remove.isPending}
                  onClick={() =>
                    remove.mutate({
                      courseId: favorite.recommendationId,
                      optionId: favorite.optionId,
                    })
                  }
                  type="button"
                >
                  <Icon name="heart-filled" />
                </CourseIconButton>
              </S.Favorite>
            ))}
          </S.FavoriteList>
        </S.FavoriteContent>
      )}
    </CoursePage>
  );
};
