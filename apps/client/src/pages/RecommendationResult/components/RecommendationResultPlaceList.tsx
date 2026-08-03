import type { KeyboardEvent } from "react";
import { useParams } from "react-router-dom";

import { useRecommendationResultUiContext } from "../wrappers/RecommendationResult.ui.context";
import { S } from "./RecommendationResultPlaceList.styled";

const RecommendationResultPlaceList = () => {
  const { recommendationId } = useParams();
  const { places, selectPlace, selectedPlaceId } = useRecommendationResultUiContext();

  return (
    <S.List aria-label="추천 장소 목록">
      {places.map((place) => {
        const isSelected = selectedPlaceId === place.id;
        const detailPath = `/place/recommendation/result/${recommendationId ?? ""}/place/${place.id}`;

        return (
          <S.Card
            key={place.id}
            $isSelected={isSelected}
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
              <S.ScoreBadge>{place.score}점</S.ScoreBadge>
            </S.CardHeader>
            <S.Description>{place.description}</S.Description>
            <S.SubInfo>{place.subInfo}</S.SubInfo>
            <S.TagRow>
              {place.tags.slice(0, 3).map((tag) => (
                <S.Tag key={tag}>{tag}</S.Tag>
              ))}
            </S.TagRow>
            <S.DetailRow>
              <S.DetailLink to={detailPath} onClick={(event) => event.stopPropagation()}>
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

export default RecommendationResultPlaceList;
