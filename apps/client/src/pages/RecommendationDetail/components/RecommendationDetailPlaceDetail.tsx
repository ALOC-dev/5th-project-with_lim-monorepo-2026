import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";

import Header from "../../../components/Header/Header";
import { useRecommendationDetailUiContext } from "../state/RecommendationDetail.ui.context";
import { S } from "./RecommendationDetailPlaceDetail.styled";

const RecommendationDetailPlaceDetail = () => {
  const { placeId, recommendationId } = useParams();
  const navigate = useNavigate();
  const { places, selectedPlaceId, selectPlace } = useRecommendationDetailUiContext();
  const place = places.find((candidate) => candidate.id === placeId) ?? null;
  const backPath = `/place/recommendation/${recommendationId ?? ""}`;

  useEffect(() => {
    if (place !== null && selectedPlaceId !== place.id) {
      selectPlace(place.id);
    }
  }, [place, selectPlace, selectedPlaceId]);

  if (place === null) {
    return (
      <S.Root>
        <Header title="장소 상세" onBack={() => navigate(backPath)} />
        <S.Body>
          <S.InfoCard>추천 결과에서 해당 장소를 찾을 수 없습니다.</S.InfoCard>
        </S.Body>
      </S.Root>
    );
  }

  return (
    <S.Root>
      <Header title="상세 정보" onBack={() => navigate(backPath)} />
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
            {place.referenceUrls.naverMap !== undefined && (
              <S.ReferenceLink href={place.referenceUrls.naverMap} target="_blank" rel="noreferrer">
                네이버지도
              </S.ReferenceLink>
            )}
            {place.referenceUrls.kakaoMap !== undefined && (
              <S.ReferenceLink href={place.referenceUrls.kakaoMap} target="_blank" rel="noreferrer">
                카카오맵
              </S.ReferenceLink>
            )}
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

export default RecommendationDetailPlaceDetail;
