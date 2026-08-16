import { useState } from "react";

import FeedbackState from "../../components/FeedbackState/FeedbackState";
import Header from "../../components/Header/Header";
import { Icon } from "../../components/Icon/Icon";
import Modal from "../../components/Modal/Modal";
import { Skeleton } from "../../components/Skeleton";
import { useAppBackNavigate, useAppNavigate } from "../../routes/useAppNavigate";
import {
  type PlaceRecommendationHistoryItem,
  usePlaceRecommendationHistory,
} from "./PlaceRecommendationHistory.context";
import { S } from "./PlaceRecommendationHistory.styled";

const skeletonCardKeys = ["first", "second", "third"] as const;

const PlaceRecommendationHistorySkeleton = () => (
  <S.LoadingState aria-busy="true" aria-label="추천 기록을 불러오는 중이에요" role="status">
    <S.LoadingNotice>
      <Skeleton height={13} width="74%" />
    </S.LoadingNotice>
    <S.LoadingList>
      {skeletonCardKeys.map((key) => (
        <S.LoadingCard key={key}>
          <S.LoadingCardInfo>
            <Skeleton height={18} width={112} />
            <Skeleton height={24} width="72%" />
            <Skeleton height={18} width={92} />
          </S.LoadingCardInfo>
          <S.LoadingCardActions>
            <Skeleton borderRadius="50%" height={44} width={44} />
            <Skeleton borderRadius="50%" height={44} width={44} />
          </S.LoadingCardActions>
        </S.LoadingCard>
      ))}
    </S.LoadingList>
  </S.LoadingState>
);

export default function PlaceRecommendationHistoryContent() {
  const {
    historyList,
    isError: isHistoryListError,
    isLoading,
    handleCardClick,
    handleDeleteItem,
    handleUpdateTitle,
    retry,
  } = usePlaceRecommendationHistory();
  const navigate = useAppNavigate();
  const navigateBack = useAppBackNavigate("/my");

  const [editingItem, setEditingItem] = useState<PlaceRecommendationHistoryItem | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editRequestError, setEditRequestError] = useState<string | null>(null);
  const [isSavingTitle, setIsSavingTitle] = useState(false);

  const [deletingItem, setDeletingItem] = useState<PlaceRecommendationHistoryItem | null>(null);
  const [deleteRequestError, setDeleteRequestError] = useState<string | null>(null);
  const [isDeletingItem, setIsDeletingItem] = useState(false);

  const trimmedEditTitle = editTitle.trim();
  const isEditTitleInvalid = trimmedEditTitle.length === 0 || trimmedEditTitle.length > 60;

  const openEditModal = (e: React.MouseEvent, item: PlaceRecommendationHistoryItem) => {
    e.stopPropagation();
    setEditRequestError(null);
    setEditingItem(item);
    setEditTitle(item.title);
  };

  const closeEditModal = () => {
    if (isSavingTitle) return;

    setEditRequestError(null);
    setEditingItem(null);
    setEditTitle("");
  };

  const handleSaveTitle = async (): Promise<void> => {
    if (isEditTitleInvalid || !editingItem || isSavingTitle) return;

    setEditRequestError(null);
    setIsSavingTitle(true);
    const isUpdated = await handleUpdateTitle(editingItem.id, trimmedEditTitle);
    setIsSavingTitle(false);

    if (isUpdated) {
      closeEditModal();
      return;
    }

    setEditRequestError("추천 기록 이름을 변경하지 못했습니다. 다시 시도해 주세요.");
  };

  const openDeleteModal = (e: React.MouseEvent, item: PlaceRecommendationHistoryItem) => {
    e.stopPropagation();
    setDeleteRequestError(null);
    setDeletingItem(item);
  };

  const closeDeleteModal = () => {
    if (isDeletingItem) return;

    setDeleteRequestError(null);
    setDeletingItem(null);
  };

  const confirmDelete = async (): Promise<void> => {
    if (!deletingItem || isDeletingItem) return;

    setDeleteRequestError(null);
    setIsDeletingItem(true);
    const isDeleted = await handleDeleteItem(deletingItem.id);
    setIsDeletingItem(false);

    if (isDeleted) {
      closeDeleteModal();
      return;
    }

    setDeleteRequestError("추천 기록을 삭제하지 못했습니다. 다시 시도해 주세요.");
  };

  return (
    <>
      <S.Container>
        <Header title="장소 추천 기록" onBack={navigateBack} />

        <S.Main>
          {isLoading ? (
            <PlaceRecommendationHistorySkeleton />
          ) : isHistoryListError ? (
            <FeedbackState
              action={{ label: "다시 시도", onClick: retry }}
              description="서버 연결을 확인한 뒤 다시 시도해 주세요."
              kind="error"
              title="추천 기록을 불러오지 못했어요"
            />
          ) : historyList.length === 0 ? (
            <FeedbackState
              action={{
                label: "추천 요청하러 가기",
                onClick: () => {
                  void navigate("/place/recommendation/form");
                },
              }}
              description="추천 요청 후 이곳에서 결과를 확인해요."
              kind="empty"
              title="아직 저장된 기록이 없어요"
            />
          ) : (
            <>
              <S.NoticeText>추천 요청을 시작하면 기록이 자동으로 저장됩니다.</S.NoticeText>
              <S.List>
                {historyList.map((item) => {
                  const cardInfo = (
                    <S.CardInfo>
                      <S.DateLabel>{item.dateLabel}</S.DateLabel>
                      <S.CardTitle>{item.title}</S.CardTitle>
                      <S.CardDescription $status={item.displayStatus}>
                        {item.description}
                      </S.CardDescription>
                    </S.CardInfo>
                  );

                  return (
                    <S.Card key={item.id} $status={item.displayStatus}>
                      {
                        <S.CardOpenButton
                          aria-label={`${item.title} 추천 기록 열기`}
                          onClick={() => {
                            void handleCardClick(item.id);
                          }}
                          type="button"
                        >
                          {cardInfo}
                        </S.CardOpenButton>
                      }

                      <S.CardActions>
                        {item.status === "PENDING" && (
                          <S.SpinnerIcon aria-label="추천 생성 중" role="status" />
                        )}
                        {item.status === "COMPLETED" && (
                          <S.IconButton
                            type="button"
                            $iconType="edit"
                            aria-label={`${item.title} 추천 기록 이름 변경`}
                            onClick={(e: React.MouseEvent<HTMLButtonElement>) =>
                              openEditModal(e, item)
                            }
                          >
                            <Icon name="edit" />
                          </S.IconButton>
                        )}
                        <S.IconButton
                          type="button"
                          $iconType="close"
                          aria-label={`${item.title} 추천 기록 삭제`}
                          onClick={(e: React.MouseEvent<HTMLButtonElement>) =>
                            openDeleteModal(e, item)
                          }
                        >
                          <Icon name="close" />
                        </S.IconButton>
                      </S.CardActions>
                    </S.Card>
                  );
                })}
              </S.List>
            </>
          )}
        </S.Main>
      </S.Container>

      <Modal
        id="edit-history-modal"
        isOpen={Boolean(editingItem)}
        close={closeEditModal}
        title="기록 이름 변경"
        description="목록과 저장된 결과 화면에만 반영됩니다."
        primaryAction={{
          label: editRequestError === null ? "변경" : "다시 시도",
          onClick: () => {
            void handleSaveTitle();
          },
          disabled: isEditTitleInvalid || isSavingTitle,
        }}
        secondaryAction={{
          label: "취소",
          onClick: closeEditModal,
          disabled: isSavingTitle,
        }}
      >
        <S.ModalInput
          aria-label="추천 기록 이름"
          value={editTitle}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
            setEditRequestError(null);
            setEditTitle(e.target.value);
          }}
          $isError={isEditTitleInvalid || editRequestError !== null}
        />
        <S.ModalHelperText
          $isError={isEditTitleInvalid || editRequestError !== null}
          role={editRequestError ? "alert" : undefined}
        >
          {editRequestError ??
            (isEditTitleInvalid
              ? "앞뒤 공백을 제외한 이름을 1~60자로 입력해 주세요."
              : "앞뒤 공백을 제외한 이름은 1~60자로 입력할 수 있어요.")}
        </S.ModalHelperText>
      </Modal>

      <Modal
        id="delete-history-modal"
        isOpen={Boolean(deletingItem)}
        close={closeDeleteModal}
        title={
          deletingItem?.status === "PENDING"
            ? "생성 중인 추천 기록을 삭제할까요?"
            : "추천 기록을 삭제할까요?"
        }
        description={
          deletingItem?.status === "PENDING"
            ? "추천 생성은 계속될 수 있으며, 결과는 기록에서 확인할 수 없어요."
            : "결과 스냅샷만 삭제되며 찜한 장소는 유지됩니다."
        }
        primaryAction={{
          label: deleteRequestError === null ? "삭제하기" : "다시 시도",
          onClick: () => {
            void confirmDelete();
          },
          disabled: isDeletingItem,
        }}
        secondaryAction={{
          label: "돌아가기",
          onClick: closeDeleteModal,
          disabled: isDeletingItem,
        }}
      >
        {deleteRequestError ? (
          <S.ModalHelperText $isError role="alert">
            {deleteRequestError}
          </S.ModalHelperText>
        ) : null}
      </Modal>
    </>
  );
}
