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
    flex-direction: column;
    height: 100vh;
    background-color: ${tokens.color.neutral[50]};
  `,
  Header: styled.header`
    background-color: ${tokens.color.neutral[50]};
    height: 96px;
  `,
  StatusBarMock: styled.div`
    display: flex;
    justify-content: space-between;
    padding: 14px 20px;
    ${tokens.typography.body.sm}
    font-weight: 600;
  `,
  NavBar: styled.div`
    display: flex;
    align-items: center;
    padding: 12px 20px;
    gap: 12px;
  `,
  BackButton: styled.button`
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;

    svg {
      width: 24px;
      height: 24px;
    }
  `,
  Title: styled.h1`
    ${tokens.typography.utility.screenTitle}
    font-size: 16px;
    font-weight: 600;
    line-height: 22px;
    color: ${tokens.color.neutral[900]};
  `,
  Main: styled.main`
    flex: 1;
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

  /* 빈 화면 (Empty State) UI */
  EmptyStateWrapper: styled.div`
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    gap: 14px;
    padding-bottom: 60px;
  `,
  EmptyIconWrapper: styled.div`
    color: ${tokens.color.primary[500]};
    margin-bottom: 16px;

    svg {
      width: 37px;
      height: 37px;
    }
  `,
  EmptyTitle: styled.h2`
    ${typography.title.sm}
    font-size: 20px;
    font-weight: 700;
    line-height: 28px;
    color: ${tokens.color.neutral[900]};
  `,
  EmptyDescription: styled.p`
    ${typography.body.xs}
    font-size: 13px;
    font-weight: 400;
    line-height: 20px;
    color: ${tokens.color.neutral[700]};
  `,
  EmptyButton: styled.button`
    display: flex;
    justify-content: center;
    align-items: center;
    background-color: ${tokens.color.primary[500]};
    color: ${tokens.color.neutral[0]};
    border: none;
    border-radius: 10px;
    ${typography.utility.cta}
    cursor: pointer;
    width: 100%;
    height: 52px;
  `,

  /* 찜한 장소 리스트 (Card) UI */
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
  IconButton: styled.button`
    background-color: ${tokens.color.primary[500]};
    color: ${tokens.color.neutral[0]};
    border: none;
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
