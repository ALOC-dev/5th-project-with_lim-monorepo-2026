import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Icon } from "../../components/Icon/Icon";
import Modal from "../../components/Modal/Modal";
import { type HistoryItem, useRecommendationHistory } from "./RecommendationHistory.context";
import { S } from "./RecommendationHistory.styled";

export default function RecommendationHistoryContent() {
  const { historyList, isLoading, handleCardClick, handleDeleteItem, handleUpdateTitle } =
    useRecommendationHistory();
  const navigate = useNavigate();

  const [editingItem, setEditingItem] = useState<HistoryItem | null>(null);
  const [editTitle, setEditTitle] = useState("");

  const [deletingItem, setDeletingItem] = useState<HistoryItem | null>(null);

  const textLengthWithoutSpaces = editTitle.replace(/\s/g, "").length;
  const isError = textLengthWithoutSpaces === 0 || textLengthWithoutSpaces > 60;

  const openEditModal = (e: React.MouseEvent, item: HistoryItem) => {
    e.stopPropagation();
    setEditingItem(item);
    setEditTitle(item.title);
  };

  const closeEditModal = () => {
    setEditingItem(null);
    setEditTitle("");
  };

  const handleSaveTitle = () => {
    if (isError || !editingItem) return;

    handleUpdateTitle(editingItem.id, editTitle);
    closeEditModal();
  };

  const openDeleteModal = (e: React.MouseEvent, item: HistoryItem) => {
    e.stopPropagation();
    setDeletingItem(item);
  };

  const closeDeleteModal = () => {
    setDeletingItem(null);
  };

  const confirmDelete = () => {
    if (!deletingItem) return;

    handleDeleteItem(deletingItem.id);
    closeDeleteModal();
  };

  return (
    <>
      <S.Container>
        <S.Header>
          <S.StatusBarMock>
            <span>9:41</span>
            <span>•••</span>
          </S.StatusBarMock>

          <S.NavBar>
            <S.BackButton type="button" onClick={() => navigate(-1)}>
              <Icon name="back-arrow" />
            </S.BackButton>
            <S.Title>장소 추천 기록</S.Title>
          </S.NavBar>
        </S.Header>

        <S.Main>
          {isLoading ? (
            <>
              <S.NoticeText>저장된 추천 기록을 불러오고 있습니다.</S.NoticeText>
              <S.List>
                {Array.from({ length: 4 }).map((_, index) => (
                  <S.SkeletonCard key={index}>
                    <S.SkeletonBar $width="35%" $height="14px" />
                    <S.SkeletonBar $width="75%" $height="18px" />
                  </S.SkeletonCard>
                ))}
              </S.List>
            </>
          ) : historyList.length === 0 ? (
            <S.EmptyStateWrapper>
              <S.EmptyIconWrapper>
                <Icon name="search" />
              </S.EmptyIconWrapper>
              <S.EmptyTitle>아직 저장된 기록이 없어요</S.EmptyTitle>
              <S.EmptyDescription>추천 요청 후 이곳에서 결과를 확인해요.</S.EmptyDescription>
              <S.EmptyButton type="button" onClick={() => navigate("/place/recommendation/form")}>
                추천 요청하러 가기
              </S.EmptyButton>
            </S.EmptyStateWrapper>
          ) : (
            <>
              <S.NoticeText>추천 요청을 시작하면 기록이 자동으로 저장됩니다.</S.NoticeText>
              <S.List>
                {historyList.map((item) => (
                  <S.Card
                    key={item.id}
                    $status={item.status}
                    onClick={() => handleCardClick(item.id, item.status)}
                  >
                    <S.CardInfo>
                      <S.DateLabel>{item.dateLabel}</S.DateLabel>
                      <S.CardTitle>{item.title}</S.CardTitle>
                      <S.CardDescription $status={item.status}>
                        {item.description}
                      </S.CardDescription>
                    </S.CardInfo>

                    <S.CardActions>
                      {item.status === "pending" && <S.SpinnerIcon />}
                      {item.status === "success" && (
                        <S.IconButton
                          type="button"
                          $iconType="edit"
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
                        onClick={(e: React.MouseEvent<HTMLButtonElement>) =>
                          openDeleteModal(e, item)
                        }
                      >
                        <Icon name="close" />
                      </S.IconButton>
                    </S.CardActions>
                  </S.Card>
                ))}
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
          label: "변경",
          onClick: handleSaveTitle,
          disabled: isError,
        }}
        secondaryAction={{
          label: "취소",
          onClick: closeEditModal,
        }}
      >
        <S.ModalInput
          value={editTitle}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditTitle(e.target.value)}
          $isError={isError}
        />
        <S.ModalHelperText $isError={isError}>
          {isError
            ? "공백을 제외하고 1~60자로 입력해 주세요."
            : "공백을 제외하고 1~60자로 입력할 수 있어요."}
        </S.ModalHelperText>
      </Modal>

      <Modal
        id="delete-history-modal"
        isOpen={Boolean(deletingItem)}
        close={closeDeleteModal}
        title={
          deletingItem?.status === "failed"
            ? "실패한 추천 기록을 삭제할까요?"
            : "이 추천 기록을 삭제할까요?"
        }
        description={
          deletingItem?.status === "failed"
            ? "삭제한 기록은 다시 복구할 수 없어요."
            : "결과 스냅샷만 삭제되며 찜한 장소는 유지됩니다."
        }
        primaryAction={{
          label: "삭제하기",
          onClick: confirmDelete,
        }}
        secondaryAction={{
          label: "돌아가기",
          onClick: closeDeleteModal,
        }}
      />
    </>
  );
}
