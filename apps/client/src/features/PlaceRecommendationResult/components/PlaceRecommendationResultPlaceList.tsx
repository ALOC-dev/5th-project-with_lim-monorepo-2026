import type { KeyboardEvent } from "react";
import { useParams } from "react-router-dom";

import { Icon } from "../../../components/Icon/Icon";
import { usePlaceRecommendationResultBookmarksContext } from "../state/PlaceRecommendationResult.bookmarks.context";
import { usePlaceRecommendationResultUiContext } from "../state/PlaceRecommendationResult.ui.context";
import { S } from "./PlaceRecommendationResultPlaceList.styled";

const PlaceRecommendationResultPlaceList = () => {
  const { recommendationId } = useParams();
  const {
    errorMessage,
    isBookmarkActionDisabled,
    isSaved,
    retry,
    toggleBookmark,
  } = usePlaceRecommendationResultBookmarksContext();
  const { places, selectPlace, selectedPlace, selectedPlaceId } =
    usePlaceRecommendationResultUiContext();

  return (
    <S.List aria-label="추천 장소 목록">
      <S.ResultSummary aria-live="polite">
        <S.ResultCount>추천 장소 {places.length}개</S.ResultCount>
        <S.SelectionStatus>
          {selectedPlace
            ? `${selectedPlace.rank}번 ${selectedPlace.name} 선택됨`
            : "장소를 선택하면 지도에서 확인할 수 있어요"}
        </S.SelectionStatus>
      </S.ResultSummary>
      {errorMessage ? (
        <S.BookmarkFeedback role="alert">
          <span>{errorMessage}</span>
          <S.BookmarkRetry type="button" onClick={retry}>
            다시 시도
          </S.BookmarkRetry>
        </S.BookmarkFeedback>
      ) : null}
      {places.map((place) => {
        const isSelected = selectedPlaceId === place.id;
        const isPlaceSaved = isSaved(place.id);
        const detailPath = `/place/recommendation/${recommendationId ?? ""}/place/${place.id}`;

        return (
          <S.Card
            key={place.id}
            $isSelected={isSelected}
            aria-label={`${place.rank}번 ${place.name} ${isSelected ? "선택됨" : "선택"}`}
            aria-pressed={isSelected}
            role="button"
            tabIndex={0}
            onClick={() => selectPlace(place.id)}
            onKeyDown={(event) => {
              if (isSelectionKey(event)) {
                event.preventDefault();
                selectPlace(place.id);
              }
            }}
          >
            <S.CardHeader>
              <S.RankBadge $isSelected={isSelected}>{place.rank}</S.RankBadge>
              <S.TitleBlock>
                <S.PlaceName>{place.name}</S.PlaceName>
                <S.Category>{place.categoryLabel}</S.Category>
              </S.TitleBlock>
              <S.Actions>
                <S.ScoreBadge>{place.score}점</S.ScoreBadge>
                <S.BookmarkButton
                  aria-busy={isBookmarkActionDisabled}
                  aria-label={`${place.name} ${isPlaceSaved ? "찜 해제" : "찜하기"}`}
                  aria-pressed={isPlaceSaved}
                  disabled={isBookmarkActionDisabled}
                  type="button"
                  $isSaved={isPlaceSaved}
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleBookmark(place.recommendation);
                  }}
                  onKeyDown={(event) => event.stopPropagation()}
                >
                  <Icon name={isPlaceSaved ? "heart-filled" : "heart-outline"} size={24} />
                </S.BookmarkButton>
              </S.Actions>
            </S.CardHeader>
            <S.Description>{place.description}</S.Description>
            <S.SubInfo>{place.subInfo}</S.SubInfo>
            <S.TagRow>
              {place.tags.slice(0, 3).map((tag) => (
                <S.Tag key={tag}>{tag}</S.Tag>
              ))}
            </S.TagRow>
            <S.DetailRow>
              <S.DetailLink
                aria-label={`${place.name} 상세 보기`}
                to={detailPath}
                onClick={(event) => event.stopPropagation()}
              >
                상세 보기
              </S.DetailLink>
            </S.DetailRow>
          </S.Card>
        );
      })}
    </S.List>
  );
};

const isSelectionKey = (event: KeyboardEvent<HTMLElement>): boolean => {
  return event.key === "Enter" || event.key === " ";
};

export default PlaceRecommendationResultPlaceList;
