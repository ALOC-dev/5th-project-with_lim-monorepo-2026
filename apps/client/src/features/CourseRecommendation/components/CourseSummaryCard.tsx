import { Icon } from "../../../components/Icon";
import type { CourseOption } from "../course.types";
import { formatCourseReason, formatCourseSummary } from "../courseRecommendation.utils";
import { S } from "./CourseSummaryCard.styled";

type CourseSummaryCardProps = {
  readonly option: CourseOption;
  readonly favoritePending?: boolean;
  readonly onFavoriteToggle: () => void;
  readonly onOpen?: () => void;
  readonly showRank?: boolean;
  readonly showReason?: boolean;
};

export const CourseSummaryCard = ({
  option,
  favoritePending = false,
  onFavoriteToggle,
  onOpen,
  showRank = false,
  showReason = false,
}: CourseSummaryCardProps) => {
  const reason = formatCourseReason(option.reasonTexts);

  return (
    <S.Card>
      <S.Header>
        <S.TitleGroup>
          {showRank ? (
            <S.Eyebrow>
              {option.rank}번 추천 · {option.courseType.label}
            </S.Eyebrow>
          ) : null}
          <S.Title>{option.title}</S.Title>
        </S.TitleGroup>
        <S.FavoriteButton
          $isSaved={option.isFavorite}
          aria-busy={favoritePending}
          aria-label={option.isFavorite ? "코스 찜 해제" : "코스 찜하기"}
          aria-pressed={option.isFavorite}
          disabled={favoritePending}
          onClick={onFavoriteToggle}
          type="button"
        >
          <Icon name={option.isFavorite ? "heart-filled" : "heart-outline"} size={24} />
        </S.FavoriteButton>
      </S.Header>
      <S.Meta>{formatCourseSummary(option)}</S.Meta>
      <S.Route>{option.stops.map((stop) => stop.name).join(" → ")}</S.Route>
      {showReason && reason ? <S.Reason>{reason}</S.Reason> : null}
      {option.legacy ? <S.LegacyBadge>이전 추천 결과</S.LegacyBadge> : null}
      {onOpen ? (
        <S.OpenButton onClick={onOpen} type="button">
          <span>상세 보기</span>
          <Icon name="chevron-right" size={20} />
        </S.OpenButton>
      ) : null}
    </S.Card>
  );
};
