import { useEffect } from "react";
import { useParams } from "react-router-dom";

import Header from "../../../components/Header/Header";
import { Icon } from "../../../components/Icon/Icon";
import { useAppBackNavigate } from "../../../routes/useAppNavigate";
import { usePlaceRecommendationResultBookmarksContext } from "../state/PlaceRecommendationResult.bookmarks.context";
import { usePlaceRecommendationResultUiContext } from "../state/PlaceRecommendationResult.ui.context";
import { S } from "./PlaceRecommendationResultItemDetail.styled";

const PlaceRecommendationResultItemDetail = () => {
  const { placeId, recommendationId } = useParams();
  const { errorMessage, isBookmarkActionDisabled, isSaved, retry, toggleBookmark } =
    usePlaceRecommendationResultBookmarksContext();
  const { places, selectedPlaceId, selectPlace } = usePlaceRecommendationResultUiContext();
  const place = places.find((candidate) => candidate.id === placeId) ?? null;
  const backPath = `/place/recommendation/${recommendationId ?? ""}`;
  const navigateBack = useAppBackNavigate(backPath);

  useEffect(() => {
    if (place !== null && selectedPlaceId !== place.id) {
      selectPlace(place.id);
    }
  }, [place, selectPlace, selectedPlaceId]);

  if (place === null) {
    return (
      <S.Root>
        <Header title="장소 상세" onBack={navigateBack} />
        <S.Body>
          <S.InfoCard>추천 결과에서 해당 장소를 찾을 수 없습니다.</S.InfoCard>
        </S.Body>
      </S.Root>
    );
  }

  const isPlaceSaved = isSaved(place.id);

  return (
    <S.Root>
      <Header title="상세 정보" onBack={navigateBack} />
      <S.Body>
        <S.TopCard>
          <S.TopCardHeader>
            <S.PlaceName>{place.name}</S.PlaceName>
            <S.BookmarkButton
              aria-busy={isBookmarkActionDisabled}
              aria-label={`${place.name} ${isPlaceSaved ? "찜 해제" : "찜하기"}`}
              aria-pressed={isPlaceSaved}
              disabled={isBookmarkActionDisabled}
              type="button"
              $isSaved={isPlaceSaved}
              onClick={() => toggleBookmark(place.recommendation)}
            >
              <Icon name={isPlaceSaved ? "heart-filled" : "heart-outline"} size={24} />
            </S.BookmarkButton>
          </S.TopCardHeader>
          <S.Meta>
            {place.categoryLabel} · {place.score}점
          </S.Meta>
          <S.TagRow>
            {place.tags.slice(0, 3).map((tag) => (
              <S.Tag key={tag}>{tag}</S.Tag>
            ))}
          </S.TagRow>
        </S.TopCard>
        {errorMessage ? (
          <S.BookmarkFeedback role="alert">
            <span>{errorMessage}</span>
            <S.BookmarkRetry type="button" onClick={retry}>
              다시 시도
            </S.BookmarkRetry>
          </S.BookmarkFeedback>
        ) : null}
        <S.InfoCard>
          <S.InfoLabel>방문 조건</S.InfoLabel>
          <S.InfoText>{place.subInfo}</S.InfoText>
          <S.InfoText>{place.priceRangeLabel}</S.InfoText>
        </S.InfoCard>
        <S.InfoCard>
          <S.InfoLabel>소개</S.InfoLabel>
          <S.InfoText>{place.description}</S.InfoText>
        </S.InfoCard>
        <S.InfoCard>
          <S.InfoLabel>주소</S.InfoLabel>
          <S.InfoText>{place.roadAddressKo}</S.InfoText>
          {place.phoneNumber !== null && <S.InfoText>{place.phoneNumber}</S.InfoText>}
        </S.InfoCard>
        <S.InfoCard>
          <S.InfoLabel>참고 링크</S.InfoLabel>
          <S.ReferenceLinks>
            {place.referenceUrls.naverMap !== undefined && (
              <S.ReferenceLink
                href={place.referenceUrls.naverMap}
                rel="noopener noreferrer"
                target="_blank"
              >
                네이버지도
              </S.ReferenceLink>
            )}
            {place.referenceUrls.kakaoMap !== undefined && (
              <S.ReferenceLink
                href={place.referenceUrls.kakaoMap}
                rel="noopener noreferrer"
                target="_blank"
              >
                카카오맵
              </S.ReferenceLink>
            )}
            {place.referenceUrls.instagram !== undefined && (
              <S.ReferenceLink
                href={place.referenceUrls.instagram}
                target="_blank"
                rel="noopener noreferrer"
              >
                인스타그램
              </S.ReferenceLink>
            )}
          </S.ReferenceLinks>
        </S.InfoCard>
      </S.Body>
    </S.Root>
  );
};

export default PlaceRecommendationResultItemDetail;
