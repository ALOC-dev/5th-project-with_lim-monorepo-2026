import styled from "@emotion/styled";

import { tokens } from "../../../design-system/tokens.generated";

export const S = {
  Card: styled.article`
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 20px;
    border: 1px solid ${tokens.color.neutral[200]};
    border-radius: 16px;
    background: ${tokens.color.neutral[0]};
  `,
  Header: styled.div`
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
  `,
  TitleGroup: styled.div`
    display: flex;
    min-width: 0;
    flex: 1;
    flex-direction: column;
    gap: 4px;
  `,
  Eyebrow: styled.span`
    color: ${tokens.color.primary[700]};
    ${tokens.typography.label.sm};
  `,
  Title: styled.h2`
    margin: 0;
    color: ${tokens.color.neutral[900]};
    ${tokens.typography.title.sm};
  `,
  BookmarkButton: styled.button<{ readonly $isSaved: boolean }>`
    display: inline-grid;
    width: 36px;
    height: 36px;
    flex: none;
    place-items: center;
    padding: 0;
    border: 1px solid ${tokens.color.neutral[200]};
    border-radius: 50%;
    background-color: ${tokens.color.neutral[0]};
    color: ${({ $isSaved }) => ($isSaved ? tokens.color.primary[500] : tokens.color.primary[700])};

    &:disabled {
      cursor: wait;
      opacity: 0.6;
    }

    &:focus-visible {
      outline: 2px solid ${tokens.color.primary[500]};
      outline-offset: 2px;
    }
  `,
  Meta: styled.p`
    color: ${tokens.color.neutral[700]};
    ${tokens.typography.body.md};
  `,
  Route: styled.p`
    color: ${tokens.color.neutral[900]};
    overflow-wrap: anywhere;
    ${tokens.typography.body.lg};
  `,
  Reason: styled.p`
    display: -webkit-box;
    overflow: hidden;
    color: ${tokens.color.neutral[700]};
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    ${tokens.typography.body.sm};
  `,
  OpenButton: styled.button`
    display: flex;
    min-height: 44px;
    align-items: center;
    justify-content: flex-end;
    gap: 4px;
    color: ${tokens.color.primary[700]};
    ${tokens.typography.utility.cta};

    &:focus-visible {
      outline: 2px solid ${tokens.color.primary[500]};
      outline-offset: 2px;
      border-radius: 8px;
    }
  `,
  LegacyBadge: styled.span`
    align-self: flex-start;
    padding: 5px 10px;
    border-radius: 999px;
    background: ${tokens.color.neutral[50]};
    color: ${tokens.color.neutral[700]};
    ${tokens.typography.label.xs};
  `,
};
