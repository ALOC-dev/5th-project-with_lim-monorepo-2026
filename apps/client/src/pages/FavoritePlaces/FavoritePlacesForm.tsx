import { useState } from "react";
import { useNavigate } from "react-router-dom";

import FeedbackState from "../../components/FeedbackState/FeedbackState";
import Header from "../../components/Header/Header";
import { Icon } from "../../components/Icon/Icon";
import { useFavoritePlaces } from "./FavoritePlaces.context";
import { S } from "./FavoritePlaces.styled";

export default function FavoritePlacesContent() {
  const { favoriteList, isLoading, handleToggleFavorite, handleGoToRecommendations } =
    useFavoritePlaces();
  const navigate = useNavigate();

  const [displayList, setDisplayList] = useState(favoriteList);
  const [isSnapshotTaken, setIsSnapshotTaken] = useState(false);

  if (!isLoading && !isSnapshotTaken) {
    setDisplayList(favoriteList);
    setIsSnapshotTaken(true);
  }

  return (
    <S.Container>
      <Header title="찜한 장소 보기" onBack={() => navigate(-1)} />

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
        ) : displayList.length === 0 ? (
          <FeedbackState
            action={{ label: "추천 결과 보러가기", onClick: handleGoToRecommendations }}
            description="저장한 장소를 여기서 볼 수 있어요."
            kind="empty"
            title="아직 찜한 장소가 없어요"
          />
        ) : (
          <>
            <S.NoticeText>저장한 장소를 다시 확인합니다.</S.NoticeText>
            <S.List>
              {displayList.map((item) => {
                const isFavorited = favoriteList.some((fav) => fav.id === item.id);

                return (
                  <S.Card key={item.id}>
                    <S.DateLabel>{item.date}</S.DateLabel>

                    <S.CardBody>
                      <S.PlaceInfo>
                        <S.PlaceTitle>{item.title}</S.PlaceTitle>
                        <S.PlaceCategory>{item.category}</S.PlaceCategory>
                      </S.PlaceInfo>

                      <S.RightControls>
                        <S.IconButton
                          type="button"
                          $isFavorited={isFavorited}
                          onClick={() => handleToggleFavorite(item.id)}
                        >
                          <Icon name={isFavorited ? "heart-filled" : "heart-outline"} size={18} />
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
                );
              })}
            </S.List>
          </>
        )}
      </S.Main>
    </S.Container>
  );
}
