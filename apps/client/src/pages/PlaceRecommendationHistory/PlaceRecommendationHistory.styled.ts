import styled from "@emotion/styled";

import { tokens } from "../../design-system/tokens.generated";
import { type PlaceRecommendationHistoryDisplayStatus } from "./PlaceRecommendationHistory.context";

export const S = {
  Container: styled.div`
    display: flex;
    flex: 1;
    width: 100%;
    margin: 0 auto;
    flex-direction: column;
    background-color: ${tokens.color.neutral["50"]};
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

  LoadingState: styled.section`
    display: flex;
    flex-direction: column;
    gap: 20px;
  `,

  LoadingNotice: styled.div`
    display: flex;
    min-height: 20px;
    align-items: center;
  `,

  LoadingList: styled.ul`
    display: flex;
    flex-direction: column;
    gap: 20px;
    margin: 0;
    padding: 0;
    list-style: none;
  `,

  LoadingCard: styled.li`
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    padding: 16px 12px;
    border: 1px solid ${tokens.color.neutral[200]};
    border-radius: 12px;
    background-color: ${tokens.color.neutral[0]};
  `,

  LoadingCardInfo: styled.div`
    display: flex;
    min-width: 0;
    flex: 1;
    flex-direction: column;
    gap: 3px;
  `,

  LoadingCardActions: styled.div`
    display: flex;
    gap: 8px;
    margin-left: 12px;
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

  Card: styled.li<{ $status: PlaceRecommendationHistoryDisplayStatus }>`
    position: relative;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding: 16px 12px;
    width: 100%;
    box-sizing: border-box;
    border-radius: 12px;
    background-color: ${tokens.color.neutral["0"]};
    transition: all 0.2s ease-in-out;

    border: 1px solid
      ${({ $status }) =>
        $status === "failed" ? tokens.color.warning["500"] : tokens.color.neutral["200"]};
  `,

  CardOpenButton: styled.button`
    display: flex;
    flex: 1;
    align-self: stretch;
    min-width: 0;
    flex-direction: column;
    padding: 0;
    border: 0;
    background: transparent;
    color: inherit;
    cursor: pointer;
    text-align: left;

    &::after {
      position: absolute;
      inset: 0;
      border-radius: 12px;
      content: "";
    }

    &:focus-visible {
      outline: none;
    }

    &:focus-visible::after {
      outline: 2px solid ${tokens.color.primary["500"]};
      outline-offset: -2px;
    }
  `,

  CardInfo: styled.div`
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 3px;
    flex: 1;
  `,

  DateLabel: styled.time`
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
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,

  CardDescription: styled.p<{ $status?: PlaceRecommendationHistoryDisplayStatus }>`
    ${tokens.typography.body.xs};
    font-size: 12px;
    font-weight: 400;
    line-height: 18px;
    margin: 0;

    color: ${({ $status }) =>
      $status === "failed" ? tokens.color.warning["500"] : tokens.color.neutral["700"]};
  `,

  CardActions: styled.div`
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    gap: 8px;
    margin-left: 12px;
  `,

  IconButton: styled.button<{ $iconType?: "edit" | "close" }>`
    display: flex;
    width: 44px;
    height: 44px;
    flex: none;
    justify-content: center;
    align-items: center;
    background: none;
    border: none;
    border-radius: 50%;
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

    &:focus-visible {
      outline: 2px solid ${tokens.color.primary["500"]};
      outline-offset: 2px;
    }
  `,

  SpinnerIcon: styled.div`
    display: flex;
    width: 44px;
    height: 44px;
    flex: none;
    align-items: center;
    justify-content: center;

    &::before {
      width: 18px;
      height: 18px;
      border: 2px solid ${tokens.color.neutral["200"]};
      border-top-color: ${tokens.color.primary["500"]};
      border-radius: 50%;
      animation: spin 1s linear infinite;
      content: "";
    }

    @keyframes spin {
      0% {
        transform: rotate(0deg);
      }
      100% {
        transform: rotate(360deg);
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
