import styled from "@emotion/styled";
import { Link } from "react-router-dom";

import { tokens } from "../../../design-system/tokens.generated";
import { typography } from "../../../design-system/typography.generated";

export const S = {
  List: styled.div`
    display: flex;
    min-height: 0;
    flex: 1;
    flex-direction: column;
    gap: 12px;
    padding-bottom: calc(18px + env(safe-area-inset-bottom));
  `,
  ResultSummary: styled.div`
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 0 2px 2px;
  `,
  ResultCount: styled.h2`
    margin: 0;
    color: ${tokens.color.neutral[900]};
    ${typography.title.xs}
  `,
  SelectionStatus: styled.p`
    margin: 0;
    overflow: hidden;
    color: ${tokens.color.neutral[700]};
    text-overflow: ellipsis;
    white-space: nowrap;
    ${typography.body.xs}
  `,
  Card: styled.article<{ readonly $isSelected: boolean }>`
    display: flex;
    flex-direction: column;
    gap: 8px;
    cursor: pointer;
    padding: 14px 14px 12px;
    border: 1px solid
      ${({ $isSelected }) =>
        $isSelected ? tokens.color.primary[500] : tokens.color.secondary[300]};
    border-radius: 8px;
    background-color: ${({ $isSelected }) =>
      $isSelected ? tokens.color.neutral[0] : tokens.color.neutral[50]};
    color: ${tokens.color.neutral[900]};
    box-shadow: ${({ $isSelected }) =>
      $isSelected ? "0 8px 20px rgba(168, 94, 69, 0.12)" : "none"};
  `,
  CardHeader: styled.div`
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
  `,
  RankBadge: styled.span<{ readonly $isSelected: boolean }>`
    display: inline-grid;
    place-items: center;
    min-inline-size: 24px;
    aspect-ratio: 1;
    border: 1px solid ${tokens.color.primary[500]};
    border-radius: 999px;
    background-color: ${({ $isSelected }) =>
      $isSelected ? tokens.color.primary[500] : tokens.color.neutral[0]};
    color: ${({ $isSelected }) =>
      $isSelected ? tokens.color.neutral[0] : tokens.color.primary[500]};
    ${typography.utility.caption}
  `,
  TitleBlock: styled.div`
    min-width: 0;
  `,
  PlaceName: styled.strong`
    display: block;
    overflow: hidden;
    color: ${tokens.color.neutral[900]};
    text-overflow: ellipsis;
    white-space: nowrap;
    ${typography.title.xs}
  `,
  Category: styled.span`
    display: block;
    color: ${tokens.color.secondary[700]};
    ${typography.label.xs}
  `,
  ScoreBadge: styled.span`
    padding: 4px 12px;
    border: 1px solid ${tokens.color.primary[500]};
    border-radius: 999px;
    color: ${tokens.color.primary[500]};
    ${typography.label.xs}
  `,
  Description: styled.p`
    display: -webkit-box;
    margin: 0;
    overflow: hidden;
    color: ${tokens.color.neutral[700]};
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    ${typography.body.xs}
  `,
  SubInfo: styled.p`
    margin: 0;
    color: ${tokens.color.secondary[700]};
    ${typography.label.xs}
  `,
  TagRow: styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  `,
  Tag: styled.span`
    padding: 5px 10px;
    border-radius: 999px;
    background-color: ${tokens.color.secondary[100]};
    color: ${tokens.color.neutral[900]};
    ${typography.label.xs}
  `,
  DetailRow: styled.div`
    display: flex;
    justify-content: flex-end;
  `,
  DetailLink: styled(Link)`
    display: inline-flex;
    min-height: 36px;
    align-items: center;
    padding: 6px 12px;
    border: 1px solid ${tokens.color.neutral[200]};
    border-radius: 999px;
    background-color: ${tokens.color.neutral[0]};
    color: ${tokens.color.primary[700]};
    text-decoration: none;
    ${typography.label.xs}
  `,
};
