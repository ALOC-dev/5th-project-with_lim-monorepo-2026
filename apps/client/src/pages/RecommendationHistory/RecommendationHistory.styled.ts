import styled from "@emotion/styled";

import { tokens } from "../../design-system/tokens.generated";
import { type HistoryStatus } from "./RecommendationHistory.context";

export const S = {
  Container: styled.main`
    display: flex;
    width: 100%;
    margin: 0 auto;
    min-height: 100vh;
    flex-direction: column;
    background-color: ${tokens.color.neutral["50"]};
  `,

  Header: styled.header`
    display: flex;
    width: 100%;
    padding: 18px 24px 6px 24px;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
    background: ${tokens.color.neutral["50"]};
  `,

  NavBar: styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
  `,

  BackButton: styled.button`
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 10px;
    width: 24px;
    height: 24px;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    color: ${tokens.color.neutral["900"]};

    svg {
      width: 24px;
      height: 24px;
    }
  `,

  Title: styled.div`
    ${tokens.typography.utility.screenTitle}
    font-size: 16px;
    font-weight: 600;
    line-height: 22px;
    color: ${tokens.color.neutral["900"]};
    margin: 0;
  `,

  MoreButton: styled.button`
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 10px;
    width: 24px;
    height: 24px;
    background: none;
    border: none;
    cursor: pointer;
  `,

  Main: styled.div`
    display: flex;
    flex-direction: column;
    padding: 16px 24px;
    width: 100%;
    flex: 1;
    gap: 20px;
  `,

  NoticeText: styled.p`
    ${tokens.typography.body.xs};
    font-size: 13px;
    font-weight: 400;
    line-height: 20px;
    color: ${tokens.color.neutral["700"]};
    margin: 0;
  `,

  LoadingWrapper: styled.div`
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 40px 0;
    color: ${tokens.color.neutral["900"]};
    font-size: 14px;
  `,

  List: styled.ul`
    display: flex;
    flex-direction: column;
    gap: 20px;
    width: 100%;
    list-style: none;
    padding: 0;
    margin: 0;
  `,

  Card: styled.li<{ $status: HistoryStatus }>`
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding: 16px 12px;
    width: 100%;
    box-sizing: border-box;
    border-radius: 12px;
    background-color: ${tokens.color.neutral["0"]};
    cursor: pointer;
    transition: all 0.2s ease-in-out;

    border: 1px solid
      ${({ $status }) =>
        $status === "failed" ? tokens.color.warning["500"] : tokens.color.neutral["200"]};

    &:active {
      background-color: ${tokens.color.neutral["50"]};
    }
  `,

  CardInfo: styled.div`
    display: flex;
    flex-direction: column;
    gap: 3px;
    flex: 1;
  `,

  DateLabel: styled.span`
    ${tokens.typography.body.xs};
    font-size: 12px;
    font-weight: 500;
    line-height: 18px;
    color: ${tokens.color.neutral["700"]};
  `,

  CardTitle: styled.h2`
    ${tokens.typography.title.xs};
    font-size: 16px;
    font-weight: 700;
    line-height: 24px;
    color: ${tokens.color.neutral["900"]};
    margin: 0;
  `,

  CardDescription: styled.p<{ $status?: HistoryStatus }>`
    ${tokens.typography.body.xs};
    font-size: 12px;
    font-weight: 400;
    line-height: 18px;
    margin: 0;

    color: ${({ $status }) =>
      $status === "failed" ? tokens.color.warning["500"] : tokens.color.neutral["700"]};
  `,

  CardActions: styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    margin-left: 12px;
  `,

  IconButton: styled.button<{ $iconType?: "edit" | "close" }>`
    display: flex;
    justify-content: center;
    align-items: center;
    background: none;
    border: none;
    padding: 0;
    color: ${tokens.color.primary["500"]};
    cursor: pointer;

    svg {
      width: 20px;
      height: 20px;
    }

    color: ${({ $iconType }) =>
      $iconType === "edit" ? tokens.color.primary["500"] : tokens.color.neutral["900"]};

    &:hover {
      opacity: 0.7;
    }
  `,

  SpinnerIcon: styled.div`
    width: 20px;
    height: 20px;
    border: 2px solid ${tokens.color.neutral["200"]};
    border-top: 2px solid ${tokens.color.primary["500"]};
    border-radius: 50%;
    animation: spin 1s linear infinite;

    @keyframes spin {
      0% {
        transform: rotate(0deg);
      }
      100% {
        transform: rotate(360deg);
      }
    }
  `,
  EmptyStateWrapper: styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    flex: 1;
    gap: 14px;
    width: 100%;
  `,

  EmptyIconWrapper: styled.div`
    display: flex;
    justify-content: center;
    color: ${tokens.color.primary["500"]};
    align-items: center;
    svg {
      width: 34px;
      height: 34px;
    }
  `,

  EmptyTitle: styled.h3`
    ${tokens.typography.title.sm};
    font-size: 20px;
    font-weight: 700;
    line-height: 28px;
    color: ${tokens.color.neutral["900"]};
  `,

  EmptyDescription: styled.p`
    ${tokens.typography.body.xs};
    font-size: 13px;
    font-weight: 400;
    line-height: 28px;
    color: ${tokens.color.neutral["700"]};
  `,

  EmptyButton: styled.button`
    display: flex;
    justify-content: center;
    align-items: center;
    width: 100%;
    height: 52px;
    border-radius: 10px;
    background-color: ${tokens.color.primary["500"]};
    color: ${tokens.color.neutral["0"]};
    ${tokens.typography.utility.cta};
    font-size: 16px;
    font-weight: 700;
    line-height: 24px;
    border: none;
    cursor: pointer;
    transition: background-color 0.2s;

    &:hover {
      background-color: ${tokens.color.primary["300"]};
    }
  `,

  SkeletonCard: styled.li`
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 12px;
    padding: 20px 16px;
    width: 100%;
    box-sizing: border-box;
    border-radius: 12px;
    background-color: ${tokens.color.neutral["0"]};
    border: 1px solid ${tokens.color.neutral["200"]};
  `,

  SkeletonBar: styled.div<{ $width: string; $height: string }>`
    height: ${({ $height }) => $height};
    width: ${({ $width }) => $width};
    border-radius: 6px;
    background-color: ${tokens.color.neutral["200"]};

    animation: skeleton-pulse 1.5s ease-in-out infinite;

    @keyframes skeleton-pulse {
      0% {
        opacity: 0.5;
      }
      50% {
        opacity: 1;
      }
      100% {
        opacity: 0.5;
      }
    }
  `,
  ModalInput: styled.input<{ $isError: boolean }>`
    width: 100%;
    height: 48px;
    padding: 0 16px;
    border-radius: 8px;
    box-sizing: border-box;
    background-color: ${tokens.color.neutral["0"]};
    color: ${tokens.color.neutral["900"]};
    ${tokens.typography.body.md};
    font-size: 15px;
    outline: none;

    border: 1px solid
      ${({ $isError }) => ($isError ? tokens.color.primary["500"] : tokens.color.neutral["200"])};

    &:focus {
      border-color: ${({ $isError }) =>
        $isError ? tokens.color.warning["500"] : tokens.color.primary["700"]};
    }
  `,

  ModalHelperText: styled.p<{ $isError: boolean }>`
    ${tokens.typography.body.xs};
    font-size: 12px;
    margin: 8px 0 24px 0;
    color: ${({ $isError }) =>
      $isError ? tokens.color.warning["500"] : tokens.color.neutral["700"]};
  `,
};
