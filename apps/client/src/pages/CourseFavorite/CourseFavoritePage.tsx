import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import FeedbackState from "../../components/FeedbackState/FeedbackState";
import { Icon } from "../../components/Icon";
import { Skeleton } from "../../components/Skeleton";
import { CourseIconButton } from "../../features/CourseRecommendation/components/CourseIconButton";
import { CoursePage } from "../../features/CourseRecommendation/components/CoursePage";
import type { CourseFavorite } from "../../features/CourseRecommendation/course.types";
import {
  formatDate,
  formatMinutes,
} from "../../features/CourseRecommendation/courseRecommendation.utils";
import { courseRepository } from "../../features/CourseRecommendation/courseRepository";
import { useAppBackNavigate, useAppNavigate } from "../../routes/useAppNavigate";
import { S } from "./CourseFavoritePage.styled";

const skeletonCardKeys = ["first", "second", "third"] as const;

const CourseFavoriteSkeleton = () => (
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

export const CourseFavoritePage = () => {
  const navigate = useAppNavigate();
  const navigateBack = useAppBackNavigate("/my");
  const queryClient = useQueryClient();
  const favorites = useQuery({
    queryKey: ["course-favorites"],
    queryFn: () => courseRepository.listFavorites(),
    retry: false,
  });
  const remove = useMutation({
    mutationFn: (favorite: CourseFavorite) => courseRepository.removeFavorite(favorite),
    onSuccess: (_result, favorite) =>
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ["course-favorites"] }),
        queryClient.invalidateQueries({
          queryKey: ["course-option", favorite.recommendationId, favorite.optionId],
        }),
        queryClient.invalidateQueries({ queryKey: ["course", favorite.recommendationId] }),
      ]),
  });

  return (
    <CoursePage onBack={navigateBack} title="찜한 코스 보기">
      {favorites.isPending ? (
        <CourseFavoriteSkeleton />
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
                <time>{favorite.savedAt ? formatDate(favorite.savedAt) : "저장일 정보 없음"}</time>
                <S.FavoriteOpen
                  onClick={() =>
                    void navigate(
                      `/course/recommendation/${encodeURIComponent(favorite.recommendationId)}/option/${encodeURIComponent(favorite.optionId)}`,
                      { state: { favorite } },
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
                  onClick={() => remove.mutate(favorite)}
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
