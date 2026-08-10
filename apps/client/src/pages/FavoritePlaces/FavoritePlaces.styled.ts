import { keyframes } from "@emotion/react";
import styled from "@emotion/styled";

import { tokens } from "../../design-system/tokens.generated";
import { typography } from "../../design-system/typography.generated";

const pulse = keyframes`
  0% { opacity: 1; }
  50% { opacity: 0.4; }
  100% { opacity: 1; }
`;

export const S = {
  Container: styled.div`
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;
    background-color: ${tokens.color.neutral[50]};
  `,
  Main: styled.div`
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 20px;
    display: flex;
    flex-direction: column;
  `,
  NoticeText: styled.p`
    ${typography.body.sm}
    font-size: 13px;
    font-weight: 400;
    line-height: 20px;
    color: ${tokens.color.secondary[700]};
    margin-bottom: 16px;
  `,
  List: styled.div`
    display: flex;
    flex-direction: column;
    gap: 12px;
  `,

  SkeletonCard: styled.div`
    padding: 16px;
    background-color: ${tokens.color.neutral[0]};
    border: 1px solid ${tokens.color.neutral[200]};
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  `,
  SkeletonBar: styled.div<{ $width: string; $height: string }>`
    width: ${({ $width }) => $width};
    height: ${({ $height }) => $height};
    background-color: ${tokens.color.neutral[200]};
    border-radius: 4px;
    animation: ${pulse} 1.5s ease-in-out infinite;
  `,

  Card: styled.div`
    padding: 16px;
    background-color: ${tokens.color.neutral[0]};
    border: 1px solid ${tokens.color.neutral[200]};
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  `,
  DateLabel: styled.span`
    ${typography.body.xs}
    font-size: 12px;
    font-weight: 500;
    line-height: 18px;
    color: ${tokens.color.primary[700]};
  `,
  CardBody: styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
  `,
  PlaceInfo: styled.div`
    display: flex;
    flex-direction: column;
    gap: 2px;
  `,
  PlaceTitle: styled.div`
    ${typography.title.md}
    font-size: 20px;
    font-weight: 700;
    line-height: 28px;
    color: ${tokens.color.neutral[900]};
  `,
  PlaceCategory: styled.p`
    ${typography.body.xs}
    font-size: 12px;
    font-weight: 400;
    line-height: 18px;
    color: ${tokens.color.secondary[700]};
  `,
  RightControls: styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
  `,
  IconButton: styled.button<{ $isFavorited?: boolean }>`
    background-color: ${({ $isFavorited = true }) =>
      $isFavorited ? tokens.color.primary[500] : tokens.color.neutral[0]};
    color: ${({ $isFavorited = true }) =>
      $isFavorited ? tokens.color.neutral[0] : tokens.color.neutral[700]};
    border: ${({ $isFavorited = true }) =>
      $isFavorited ? "none" : `1px solid ${tokens.color.neutral[200]}`};
    border-radius: 50%;
    width: 32px;
    height: 32px;
    padding: 0;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  `,
  ScoreBadge: styled.div`
    display: flex;
    align-items: center;
    justify-content: center;
    height: 32px;
    padding: 0 12px;
    border: 1px solid ${tokens.color.primary[500]};
    border-radius: 14px;
    color: ${tokens.color.primary[500]};
    ${typography.body.xs}
    font-size: 13px;
    font-weight: 500;
    line-height: 18px;
  `,
  TagsRow: styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 12px;
  `,
  Tag: styled.span`
    display: flex;
    padding: 4px 12px;
    background-color: ${tokens.color.neutral[200]};
    color: ${tokens.color.neutral[900]};
    border-radius: 14px;
    ${typography.body.xs}
    font-size: 13px;
    font-weight: 500;
    line-height: 18px;
  `,
};
