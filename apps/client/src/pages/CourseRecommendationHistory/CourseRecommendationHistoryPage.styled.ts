import styled from "@emotion/styled";

import { tokens } from "../../design-system/tokens.generated";
import type { CourseHistoryDisplayStatus } from "../../features/CourseRecommendation/courseRecommendation.utils";

export const S = {
  HistoryContent: styled.div`
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 20px;
    padding: 16px 24px;
  `,
  HistoryNotice: styled.p`
    margin: 0;
    color: ${tokens.color.neutral[700]};
    ${tokens.typography.body.xs};
  `,
  HistoryLoading: styled.section`
    display: flex;
    flex-direction: column;
    gap: 20px;
  `,
  HistoryLoadingNotice: styled.div`
    display: flex;
    min-height: 20px;
    align-items: center;
  `,
  HistoryLoadingList: styled.ul`
    display: flex;
    flex-direction: column;
    gap: 20px;
    margin: 0;
    padding: 0;
    list-style: none;
  `,
  HistoryLoadingCard: styled.li`
    display: flex;
    min-height: 100px;
    align-items: flex-start;
    justify-content: space-between;
    padding: 16px 12px;
    border: 1px solid ${tokens.color.neutral[200]};
    border-radius: 12px;
    background-color: ${tokens.color.neutral[0]};
  `,
  HistoryLoadingInfo: styled.div`
    display: flex;
    min-width: 0;
    flex: 1;
    flex-direction: column;
    gap: 6px;
    padding-top: 3px;
  `,
  HistoryLoadingActions: styled.div`
    display: flex;
    gap: 8px;
    margin-left: 12px;
  `,
  HistoryList: styled.ul`
    display: flex;
    flex-direction: column;
    gap: 20px;
    margin: 0;
    padding: 0;
    list-style: none;
  `,
  History: styled.li<{ $status: CourseHistoryDisplayStatus }>`
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    padding: 16px 12px;
    border: 1px solid
      ${({ $status }) =>
        $status === "failed"
          ? tokens.color.warning[500]
          : $status === "empty" || $status === "cancelled"
            ? tokens.color.secondary[300]
            : tokens.color.neutral[200]};
    border-radius: 12px;
    background: ${({ $status }) =>
      $status === "empty" ? tokens.color.secondary[50] : tokens.color.neutral[0]};
    opacity: ${({ $status }) => ($status === "cancelled" ? 0.72 : 1)};
  `,
  HistoryOpen: styled.button`
    display: flex;
    flex: 1;
    align-self: stretch;
    min-width: 0;
    flex-direction: column;
    align-items: flex-start;
    padding: 0;
    border: 0;
    background: transparent;
    color: inherit;
    cursor: pointer;
    text-align: left;

    &:active {
      background: ${tokens.color.neutral[50]};
    }

    &:focus-visible {
      outline: 2px solid ${tokens.color.primary[500]};
      outline-offset: -2px;
      border-radius: 8px;
    }
  `,
  HistoryInfo: styled.div`
    display: flex;
    min-width: 0;
    flex: 1;
    flex-direction: column;
    gap: 3px;
  `,
  HistoryDate: styled.time`
    color: ${tokens.color.neutral[700]};
    ${tokens.typography.body.xs};
    font-size: 12px;
    font-weight: 500;
    line-height: 18px;
  `,
  HistoryTitle: styled.h2`
    margin: 0;
    color: ${tokens.color.neutral[900]};
    ${tokens.typography.title.xs};
    font-size: 16px;
    line-height: 24px;
  `,
  HistoryDescription: styled.p<{ $status: CourseHistoryDisplayStatus }>`
    margin: 0;
    color: ${({ $status }) =>
      $status === "failed"
        ? tokens.color.warning[500]
        : $status === "empty" || $status === "cancelled"
          ? tokens.color.secondary[700]
          : tokens.color.neutral[700]};
    ${tokens.typography.body.xs};
    font-size: 12px;
    line-height: 18px;
  `,
  HistoryStatusBadge: styled.span<{ $status: CourseHistoryDisplayStatus }>`
    width: fit-content;
    margin-top: 2px;
    padding: 3px 8px;
    border-radius: 999px;
    background: ${({ $status }) =>
      $status === "empty" ? tokens.color.secondary[100] : tokens.color.neutral[200]};
    color: ${tokens.color.secondary[700]};
    ${tokens.typography.label.xs};
  `,
  HistoryActions: styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    margin-left: 12px;
  `,
  HistorySpinner: styled.div`
    width: 20px;
    height: 20px;
    border: 2px solid ${tokens.color.neutral[200]};
    border-top-color: ${tokens.color.primary[500]};
    border-radius: 50%;
    animation: course-history-spin 1s linear infinite;

    @keyframes course-history-spin {
      to {
        transform: rotate(360deg);
      }
    }
  `,
  ModalInput: styled.input<{ $invalid: boolean }>`
    height: 44px;
    padding: 0 12px;
    border: 1px solid
      ${({ $invalid }) => ($invalid ? tokens.color.warning[500] : tokens.color.neutral[200])};
    border-radius: 8px;
  `,
  ModalError: styled.p`
    margin: 0;
    color: ${tokens.color.warning[500]};
    ${tokens.typography.body.xs};
  `,
};
