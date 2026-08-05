import { useNavigate } from "react-router-dom";

import { Icon } from "../../components/Icon/Icon";
import { useFavoritePlaces } from "./FavoritePlaces.context";
import { S } from "./FavoritePlaces.styled";

export default function FavoritePlacesContent() {
  const { favoriteList, isLoading, handleToggleFavorite, handleGoToRecommendations } =
    useFavoritePlaces();
  const navigate = useNavigate();

  return (
    <S.Container>
      <S.Header>
        <S.StatusBarMock></S.StatusBarMock>
        <S.NavBar>
          <S.BackButton type="button" onClick={() => navigate(-1)}>
            <Icon name="back-arrow" />
          </S.BackButton>
          <S.Title>찜한 장소 보기</S.Title>
        </S.NavBar>
      </S.Header>

      <S.Main>
        {isLoading ? (
          <>
            <S.NoticeText>저장한 장소를 불러오고 있습니다.</S.NoticeText>
            <S.List>
              {Array.from({ length: 3 }).map((_, i) => (
                <S.SkeletonCard key={i}>
                  <S.SkeletonBar $width="30%" $height="14px" />
                  <S.SkeletonBar $width="60%" $height="20px" />
                  <S.SkeletonBar $width="40%" $height="24px" />
                </S.SkeletonCard>
              ))}
            </S.List>
          </>
        ) : favoriteList.length === 0 ? (
          <S.EmptyStateWrapper>
            <S.EmptyIconWrapper>
              <Icon name="heart-outline" />
            </S.EmptyIconWrapper>
            <S.EmptyTitle>아직 찜한 장소가 없어요</S.EmptyTitle>
            <S.EmptyDescription>저장한 장소를 여기서 볼 수 있어요.</S.EmptyDescription>
            <S.EmptyButton type="button" onClick={handleGoToRecommendations}>
              추천 결과 보러가기
            </S.EmptyButton>
          </S.EmptyStateWrapper>
        ) : (
          <>
            <S.NoticeText>저장한 장소를 다시 확인합니다.</S.NoticeText>
            <S.List>
              {favoriteList.map((item) => (
                <S.Card key={item.id}>
                  <S.DateLabel>{item.date}</S.DateLabel>

                  <S.CardBody>
                    <S.PlaceInfo>
                      <S.PlaceTitle>{item.title}</S.PlaceTitle>
                      <S.PlaceCategory>{item.category}</S.PlaceCategory>
                    </S.PlaceInfo>

                    <S.RightControls>
                      <S.IconButton type="button" onClick={() => handleToggleFavorite(item.id)}>
                        <Icon name="heart-filled" size={18} />
                      </S.IconButton>
                      <S.ScoreBadge>{item.score}점</S.ScoreBadge>
                    </S.RightControls>
                  </S.CardBody>

                  <S.TagsRow>
                    {item.tags.map((tag, idx) => (
                      <S.Tag key={idx}>{tag}</S.Tag>
                    ))}
                  </S.TagsRow>
                </S.Card>
              ))}
            </S.List>
          </>
        )}
      </S.Main>
    </S.Container>
  );
}
