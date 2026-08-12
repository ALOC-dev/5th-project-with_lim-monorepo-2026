import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import FeedbackState from "../../components/FeedbackState/FeedbackState";
import { Icon } from "../../components/Icon";
import Modal from "../../components/Modal/Modal";
import { CourseIconButton } from "../../features/CourseRecommendation/components/CourseIconButton";
import { CoursePage } from "../../features/CourseRecommendation/components/CoursePage";
import type { CourseHistoryItem } from "../../features/CourseRecommendation/course.types";
import {
  canOpenHistory,
  formatDate,
  historyDisplayStatus,
  historyStatusLabel,
  historySummary,
} from "../../features/CourseRecommendation/courseRecommendation.utils";
import { courseRepository } from "../../features/CourseRecommendation/courseRepository";
import { S } from "./CourseRecommendationHistoryPage.styled";

export const CourseRecommendationHistoryPage = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const histories = useQuery({
    queryKey: ["course-history"],
    queryFn: () => courseRepository.listHistory(),
    retry: false,
    refetchInterval: (query) =>
      query.state.data?.some((item) => item.status === "PENDING") ? 5_000 : false,
  });
  const [editing, setEditing] = useState<CourseHistoryItem | null>(null);
  const [title, setTitle] = useState("");
  const [deleting, setDeleting] = useState<CourseHistoryItem | null>(null);
  const renameInvalid = title.trim().length === 0 || title.trim().length > 60;
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["course-history"] });
  const rename = useMutation({
    mutationFn: () => courseRepository.renameHistory(editing?.id ?? "", title),
    onSuccess: () => {
      setEditing(null);
      refresh();
    },
  });
  const remove = useMutation({
    mutationFn: () =>
      deleting?.status === "PENDING"
        ? courseRepository.cancelPendingHistory(deleting.id)
        : courseRepository.deleteHistory(deleting?.id ?? ""),
    onSuccess: () => {
      setDeleting(null);
      refresh();
    },
  });

  return (
    <CoursePage onBack={() => navigate("/activity")} title="코스 추천 기록">
      <S.HistoryContent>
        {histories.isPending ? (
          <FeedbackState kind="loading" title="추천 기록을 불러오는 중이에요" />
        ) : histories.isError ? (
          <FeedbackState
            action={{ label: "다시 시도", onClick: () => void histories.refetch() }}
            kind="error"
            title="추천 기록을 불러오지 못했어요"
          />
        ) : !histories.data?.length ? (
          <FeedbackState
            action={{
              label: "코스 추천받기",
              onClick: () => void navigate("/course/recommendation/form"),
            }}
            description="추천 요청 후 이곳에서 결과를 확인해요."
            kind="empty"
            title="아직 저장된 기록이 없어요"
          />
        ) : (
          <>
            <S.HistoryNotice>추천 요청을 시작하면 기록이 자동으로 저장됩니다.</S.HistoryNotice>
            <S.HistoryList>
              {histories.data.map((item) => {
                const displayStatus = historyDisplayStatus(item);
                const statusLabel = historyStatusLabel(item);
                const cardInfo = (
                  <S.HistoryInfo>
                    <S.HistoryDate>{formatDate(item.requestedAt)}</S.HistoryDate>
                    <S.HistoryTitle>{item.title}</S.HistoryTitle>
                    <S.HistoryDescription $status={displayStatus}>
                      {historySummary(item)}
                    </S.HistoryDescription>
                    {statusLabel ? (
                      <S.HistoryStatusBadge $status={displayStatus}>
                        {statusLabel}
                      </S.HistoryStatusBadge>
                    ) : null}
                  </S.HistoryInfo>
                );

                return (
                  <S.History $status={displayStatus} key={item.id}>
                    {canOpenHistory(item) ? (
                      <S.HistoryOpen
                        aria-label={`${item.title} 추천 기록 열기`}
                        onClick={() =>
                          void navigate(`/course/recommendation/${encodeURIComponent(item.id)}`)
                        }
                        type="button"
                      >
                        {cardInfo}
                      </S.HistoryOpen>
                    ) : (
                      cardInfo
                    )}
                    <S.HistoryActions>
                      {item.status === "PENDING" ? (
                        <S.HistorySpinner aria-label="추천 생성 중" role="status" />
                      ) : null}
                      {item.status === "SUCCESS" ? (
                        <CourseIconButton
                          aria-label={`${item.title} 추천 기록 이름 변경`}
                          onClick={() => {
                            rename.reset();
                            setEditing(item);
                            setTitle(item.title);
                          }}
                          type="button"
                        >
                          <Icon name="edit" size={18} />
                        </CourseIconButton>
                      ) : null}
                      <CourseIconButton
                        aria-label={`${item.title} 추천 기록 삭제`}
                        onClick={() => {
                          remove.reset();
                          setDeleting(item);
                        }}
                        type="button"
                      >
                        <Icon name="close" size={18} />
                      </CourseIconButton>
                    </S.HistoryActions>
                  </S.History>
                );
              })}
            </S.HistoryList>
          </>
        )}
      </S.HistoryContent>
      <Modal
        close={() => {
          rename.reset();
          setEditing(null);
        }}
        id="course-rename"
        isOpen={Boolean(editing)}
        primaryAction={{
          label: "변경",
          onClick: () => rename.mutate(),
          disabled: renameInvalid || rename.isPending,
        }}
        secondaryAction={{
          label: "취소",
          onClick: () => {
            rename.reset();
            setEditing(null);
          },
        }}
        title="기록 이름 변경"
      >
        <S.ModalInput
          aria-label="코스 기록 이름"
          $invalid={renameInvalid}
          onChange={(event) => setTitle(event.target.value)}
          value={title}
        />
        {renameInvalid ? (
          <S.ModalError role="alert">이름은 1~60자로 입력해 주세요.</S.ModalError>
        ) : rename.isError ? (
          <S.ModalError role="alert">이름을 변경하지 못했어요.</S.ModalError>
        ) : null}
      </Modal>
      <Modal
        close={() => {
          remove.reset();
          setDeleting(null);
        }}
        description={
          deleting?.status === "PENDING"
            ? "생성 중인 코스 추천을 취소합니다."
            : "삭제한 기록은 다시 복구할 수 없어요."
        }
        id="course-delete"
        isOpen={Boolean(deleting)}
        primaryAction={{
          label: deleting?.status === "PENDING" ? "취소하기" : "삭제하기",
          onClick: () => remove.mutate(),
          disabled: remove.isPending,
        }}
        secondaryAction={{
          label: "돌아가기",
          onClick: () => {
            remove.reset();
            setDeleting(null);
          },
        }}
        title={
          deleting?.status === "PENDING" ? "추천 생성을 취소할까요?" : "추천 기록을 삭제할까요?"
        }
      >
        {remove.isError ? (
          <S.ModalError role="alert">
            {deleting?.status === "PENDING"
              ? "추천 생성을 취소하지 못했어요."
              : "추천 기록을 삭제하지 못했어요."}
          </S.ModalError>
        ) : null}
      </Modal>
    </CoursePage>
  );
};
