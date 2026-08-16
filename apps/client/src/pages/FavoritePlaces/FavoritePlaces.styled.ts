import styled from "@emotion/styled";

import { tokens } from "../../design-system/tokens.generated";
import { typography } from "../../design-system/typography.generated";

export const S = {
  Container: styled.div`
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;
    background-color: ${tokens.color.neutral[50]};
  `,
  Main: styled.div`
    display: flex;
    min-height: 0;
    flex: 1;
    flex-direction: column;
  `,
  Content: styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
  `,
  DeleteError: styled.p`
    ${typography.body.xs}
    color: ${tokens.color.warning[500]};
    margin: 20px 24px 0;
  `,
  List: styled.ul`
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin: 0;
    padding: 20px 24px;
    list-style: none;
  `,

  SkeletonList: styled.ul`
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin: 0;
    padding: 20px 24px;
    list-style: none;
  `,

  SkeletonCard: styled.li`
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 6px;
    padding: 14px;
    border: 1px solid ${tokens.color.neutral[200]};
    border-radius: 12px;
    background-color: ${tokens.color.neutral[0]};
  `,

  SkeletonDate: styled.div`
    display: flex;
    grid-column: 1 / -1;
    min-height: 18px;
    align-items: center;
  `,

  SkeletonCardBody: styled.div`
    display: flex;
    grid-column: 1 / -1;
    min-width: 0;
    align-items: center;
    justify-content: space-between;
  `,

  SkeletonPlaceInfo: styled.div`
    display: flex;
    min-width: 0;
    flex: 1;
    flex-direction: column;
    gap: 6px;
  `,

  SkeletonControls: styled.div`
    display: flex;
    flex: none;
    align-items: center;
    gap: 8px;
    margin-left: 12px;
  `,

  SkeletonTags: styled.div`
    display: flex;
    grid-column: 1 / -1;
    gap: 6px;
    margin-top: 12px;
  `,

  Card: styled.li`
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 6px;
    padding: 14px;
    background-color: ${tokens.color.neutral[0]};
    border: 1px solid ${tokens.color.neutral[200]};
    border-radius: 12px;
  `,
  DateLabel: styled.time`
    grid-column: 1 / -1;
    ${typography.body.xs}
    font-size: 12px;
    font-weight: 500;
    line-height: 18px;
    color: ${tokens.color.neutral[700]};
  `,
  CardBody: styled.div`
    grid-column: 1 / -1;
    display: flex;
    min-width: 0;
    align-items: center;
    justify-content: space-between;
  `,
  PlaceInfo: styled.div`
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 2px;
  `,
  PlaceTitle: styled.h2`
    margin: 0;
    overflow: hidden;
    color: ${tokens.color.neutral[900]};
    text-overflow: ellipsis;
    white-space: nowrap;
    ${typography.title.xs}
    font-size: 16px;
    font-weight: 700;
    line-height: 24px;
  `,
  PlaceCategory: styled.p`
    margin: 0;
    ${typography.body.xs}
    font-size: 12px;
    font-weight: 400;
    line-height: 18px;
    color: ${tokens.color.secondary[700]};
  `,
  RightControls: styled.div`
    display: flex;
    flex: none;
    align-items: center;
    gap: 8px;
  `,
  IconButton: styled.button<{ $isFavorited?: boolean }>`
    background-color: transparent;
    color: ${({ $isFavorited = true }) =>
      $isFavorited ? tokens.color.primary[500] : tokens.color.neutral[700]};
    border: 0;
    border-radius: 50%;
    width: 44px;
    height: 44px;
    padding: 0;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;

    &:disabled {
      cursor: not-allowed;
      opacity: 0.6;
    }

    &:focus-visible {
      outline: 2px solid ${tokens.color.primary[500]};
      outline-offset: 2px;
    }
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
    grid-column: 1 / -1;
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
