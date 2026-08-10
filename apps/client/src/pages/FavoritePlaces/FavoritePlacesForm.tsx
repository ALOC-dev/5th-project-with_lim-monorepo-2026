import { useNavigate } from "react-router-dom";

import FeedbackState from "../../components/FeedbackState/FeedbackState";
import Header from "../../components/Header/Header";
import { Icon } from "../../components/Icon/Icon";
import { useFavoritePlaces } from "./FavoritePlaces.context";
import { S } from "./FavoritePlaces.styled";

export default function FavoritePlacesContent() {
  const {
    favoriteList,
    isLoading,
    isListError,
    isDeleting,
    deleteErrorMessage,
    handleToggleFavorite,
    handleRetry,
    handleGoToRecommendations,
  } = useFavoritePlaces();
  const navigate = useNavigate();

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
        ) : isListError ? (
          <FeedbackState
            action={{ label: "다시 시도", onClick: handleRetry }}
            description="잠시 후 다시 시도해 주세요."
            kind="error"
            title="찜한 장소를 불러오지 못했습니다."
          />
        ) : favoriteList.length === 0 ? (
          <FeedbackState
            action={{ label: "추천 결과 보러가기", onClick: handleGoToRecommendations }}
            description="저장한 장소를 여기서 볼 수 있어요."
            kind="empty"
            title="아직 찜한 장소가 없어요"
          />
        ) : (
          <>
            <S.NoticeText>저장한 장소를 다시 확인합니다.</S.NoticeText>
            {deleteErrorMessage ? (
              <S.DeleteError role="alert">{deleteErrorMessage}</S.DeleteError>
            ) : null}
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
                      <S.IconButton
                        aria-busy={isDeleting}
                        aria-label={`${item.title} 찜 삭제`}
                        disabled={isDeleting}
                        type="button"
                        $isFavorited
                        onClick={() => handleToggleFavorite(item.id)}
                      >
                        <Icon name="heart-filled" size={18} />
                      </S.IconButton>
                      <S.ScoreBadge>{item.score}점</S.ScoreBadge>
                    </S.RightControls>
                  </S.CardBody>

                  <S.TagsRow>
                    {item.tags.map((tag) => (
                      <S.Tag key={tag}>{tag}</S.Tag>
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
