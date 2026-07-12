import { useEffect } from "react";
import { useParams } from "react-router-dom";

import { useRecommendationResultUiContext } from "../wrappers/RecommendationResult.ui.context";
import { S } from "./RecommendationResultPlaceDetail.styled";

const RecommendationResultPlaceDetail = () => {
  const { placeId, recommendationId } = useParams();
  const { places, selectedPlaceId, selectPlace } = useRecommendationResultUiContext();
  const place = places.find((candidate) => candidate.id === placeId) ?? null;
  const backPath = `/place/recommendation/result/${recommendationId ?? ""}`;

  useEffect(() => {
    if (place !== null && selectedPlaceId !== place.id) {
      selectPlace(place.id);
    }
  }, [place, selectPlace, selectedPlaceId]);

  if (place === null) {
    return (
      <S.Root>
        <S.Header>
          <S.BackLink to={backPath} aria-label="결과 목록으로 돌아가기">
            ‹
          </S.BackLink>
          <S.HeaderTitle>장소 상세</S.HeaderTitle>
        </S.Header>
        <S.Body>
          <S.InfoCard>추천 결과에서 해당 장소를 찾을 수 없습니다.</S.InfoCard>
        </S.Body>
      </S.Root>
    );
  }

  return (
    <S.Root>
      <S.Header>
        <S.BackLink to={backPath} aria-label="결과 목록으로 돌아가기">
          ‹
        </S.BackLink>
        <S.HeaderTitle>상세 정보</S.HeaderTitle>
      </S.Header>
      <S.Body>
        <S.TopCard>
          <S.PlaceName>{place.name}</S.PlaceName>
          <S.Meta>
            {place.categoryLabel} · {place.score}점
          </S.Meta>
          <S.TagRow>
            {place.tags.slice(0, 3).map((tag) => (
              <S.Tag key={tag}>{tag}</S.Tag>
            ))}
          </S.TagRow>
        </S.TopCard>
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
            <S.ReferenceLink href={place.referenceUrls.naverMap} target="_blank" rel="noreferrer">
              네이버지도
            </S.ReferenceLink>
            <S.ReferenceLink href={place.referenceUrls.kakaoMap} target="_blank" rel="noreferrer">
              카카오맵
            </S.ReferenceLink>
            {place.referenceUrls.instagram !== undefined && (
              <S.ReferenceLink
                href={place.referenceUrls.instagram}
                target="_blank"
                rel="noreferrer"
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

export default RecommendationResultPlaceDetail;
