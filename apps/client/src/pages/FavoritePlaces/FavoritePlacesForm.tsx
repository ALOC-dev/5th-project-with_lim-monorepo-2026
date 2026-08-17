import FeedbackState from "../../components/FeedbackState/FeedbackState";
import Header from "../../components/Header/Header";
import { Icon } from "../../components/Icon/Icon";
import { Skeleton } from "../../components/Skeleton";
import { useAppBackNavigate, useAppNavigate } from "../../routes/useAppNavigate";
import { useBookmarkedPlaces } from "./FavoritePlaces.context";
import { S } from "./FavoritePlaces.styled";

const skeletonCardKeys = ["first", "second", "third"] as const;

const BookmarkedPlacesSkeleton = () => (
  <S.SkeletonList aria-busy="true" aria-label="찜한 장소를 불러오는 중이에요" role="status">
    {skeletonCardKeys.map((key) => (
      <S.SkeletonCard key={key}>
        <S.SkeletonDate>
          <Skeleton height={12} width={68} />
        </S.SkeletonDate>
        <S.SkeletonCardBody>
          <S.SkeletonPlaceInfo>
            <Skeleton height={20} width="68%" />
            <Skeleton height={12} width="44%" />
          </S.SkeletonPlaceInfo>
          <S.SkeletonControls>
            <Skeleton borderRadius="50%" height={44} width={44} />
            <Skeleton borderRadius={14} height={32} width={56} />
          </S.SkeletonControls>
        </S.SkeletonCardBody>
        <S.SkeletonTags>
          <Skeleton borderRadius={14} height={26} width={58} />
          <Skeleton borderRadius={14} height={26} width={66} />
          <Skeleton borderRadius={14} height={26} width={54} />
        </S.SkeletonTags>
      </S.SkeletonCard>
    ))}
  </S.SkeletonList>
);

export default function BookmarkedPlacesContent() {
  const {
    bookmarkList,
    isLoading,
    isListError,
    isBookmarking,
    bookmarkErrorMessage,
    handleToggleBookmark,
    handleRetry,
    handleGoToPlaceRecommendationHistory,
  } = useBookmarkedPlaces();
  const navigate = useAppNavigate();
  const navigateBack = useAppBackNavigate("/my");
  const handleOpenPlace = (historyId: string | null, placeId: string) => {
    if (historyId === null) return;

    const resultPath = `/place/recommendation/${encodeURIComponent(historyId)}`;
    void navigate(`${resultPath}/place/${encodeURIComponent(placeId)}`);
  };

  return (
    <S.Container>
      <Header title="찜한 장소 보기" onBack={navigateBack} />

      <S.Main>
        {isLoading ? (
          <BookmarkedPlacesSkeleton />
        ) : isListError ? (
          <FeedbackState
            action={{ label: "다시 시도", onClick: handleRetry }}
            description="잠시 후 다시 시도해 주세요."
            kind="error"
            title="찜한 장소를 불러오지 못했어요"
          />
        ) : bookmarkList.length === 0 ? (
          <FeedbackState
            action={{ label: "추천 기록 보기", onClick: handleGoToPlaceRecommendationHistory }}
            kind="empty"
            title="아직 찜한 장소가 없어요"
          />
        ) : (
          <S.Content>
            {bookmarkErrorMessage ? (
              <S.BookmarkError role="alert">{bookmarkErrorMessage}</S.BookmarkError>
            ) : null}
            <S.List>
              {bookmarkList.map((item) => {
                const canOpenPlace = item.historyId !== null;

                return (
                  <S.Card
                    aria-label={canOpenPlace ? `${item.title} 상세 보기` : undefined}
                    key={item.id}
                    role={canOpenPlace ? "button" : undefined}
                    tabIndex={canOpenPlace ? 0 : undefined}
                    onClick={
                      canOpenPlace ? () => handleOpenPlace(item.historyId, item.placeId) : undefined
                    }
                    onKeyDown={
                      canOpenPlace
                        ? (event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              handleOpenPlace(item.historyId, item.placeId);
                            }
                          }
                        : undefined
                    }
                  >
                    <S.DateLabel>{item.date}</S.DateLabel>

                    <S.CardBody>
                      <S.PlaceInfo>
                        <S.PlaceTitle>{item.title}</S.PlaceTitle>
                        <S.PlaceCategory>{item.category}</S.PlaceCategory>
                      </S.PlaceInfo>

                      <S.RightControls>
                        <S.IconButton
                          aria-busy={isBookmarking}
                          aria-label={`${item.title} ${item.isBookmarked ? "찜 해제" : "찜하기"}`}
                          aria-pressed={item.isBookmarked}
                          disabled={isBookmarking}
                          type="button"
                          $isBookmarked={item.isBookmarked}
                          onClick={(event) => {
                            event.stopPropagation();
                            handleToggleBookmark(item.id);
                          }}
                          onKeyDown={(event) => event.stopPropagation()}
                        >
                          <Icon
                            name={item.isBookmarked ? "heart-filled" : "heart-outline"}
                            size={20}
                          />
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
                );
              })}
            </S.List>
          </S.Content>
        )}
      </S.Main>
    </S.Container>
  );
}
