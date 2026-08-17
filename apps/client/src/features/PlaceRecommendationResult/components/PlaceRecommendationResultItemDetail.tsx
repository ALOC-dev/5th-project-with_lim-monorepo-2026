import { useQueries } from "@tanstack/react-query";
import { useEffect } from "react";
import { useParams } from "react-router-dom";

import { getLinkMetadata } from "../../../apis/server/linkMetadata";
import Header from "../../../components/Header/Header";
import { Icon } from "../../../components/Icon/Icon";
import { useAppBackNavigate } from "../../../routes/useAppNavigate";
import {
  getPlaceRecommendationReferenceDisplayTitle,
  toPlaceRecommendationReferenceLinks,
} from "../referenceLinks";
import { usePlaceRecommendationResultBookmarksContext } from "../state/PlaceRecommendationResult.bookmarks.context";
import { usePlaceRecommendationResultUiContext } from "../state/PlaceRecommendationResult.ui.context";
import { S } from "./PlaceRecommendationResultItemDetail.styled";

const PlaceRecommendationResultItemDetail = () => {
  const { placeId, recommendationId } = useParams();
  const { errorMessage, isBookmarkActionDisabled, isSaved, retry, toggleBookmark } =
    usePlaceRecommendationResultBookmarksContext();
  const { places, selectedPlaceId, selectPlace } = usePlaceRecommendationResultUiContext();
  const place = places.find((candidate) => candidate.id === placeId) ?? null;
  const referenceLinks = toPlaceRecommendationReferenceLinks(
    place?.referenceUrls ?? {},
    place?.name,
  );
  const metadataQueries = useQueries({
    queries: referenceLinks.map(({ url }) => ({
      queryFn: async () => {
        const response = await getLinkMetadata(url);
        return response.success ? response.data.title : null;
      },
      queryKey: ["link-metadata", url],
      retry: false,
      staleTime: 86_400_000,
    })),
  });
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
        </S.InfoCard>
        <S.InfoCard>
          <S.InfoLabel>소개</S.InfoLabel>
          <S.InfoText>{place.description}</S.InfoText>
        </S.InfoCard>
        <S.InfoCard>
          <S.InfoLabel>주소</S.InfoLabel>
          <S.InfoText>{place.roadAddressKo}</S.InfoText>
        </S.InfoCard>
        {place.phoneNumber !== null && (
          <S.InfoCard>
            <S.InfoLabel>전화번호</S.InfoLabel>
            <S.InfoText>{place.phoneNumber}</S.InfoText>
          </S.InfoCard>
        )}
        <S.InfoCard>
          <S.InfoLabel>참고 링크</S.InfoLabel>
          <S.ReferenceLinks>
            {referenceLinks.map((referenceLink, index) => {
              const title = getPlaceRecommendationReferenceDisplayTitle(
                metadataQueries[index]?.data,
                referenceLink,
              );

              return (
                <S.ReferenceLink
                  aria-label={`${title} 열기`}
                  href={referenceLink.url}
                  key={referenceLink.url}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  <S.ReferenceFavicon
                    alt=""
                    height={16}
                    src={referenceLink.faviconUrl}
                    width={16}
                  />
                  <S.ReferenceContent>
                    <S.ReferenceTitle>{title}</S.ReferenceTitle>
                    <S.ReferenceDomain>{referenceLink.domain}</S.ReferenceDomain>
                  </S.ReferenceContent>
                </S.ReferenceLink>
              );
            })}
          </S.ReferenceLinks>
        </S.InfoCard>
      </S.Body>
    </S.Root>
  );
};

export default PlaceRecommendationResultItemDetail;
