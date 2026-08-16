import styled from "@emotion/styled";

import { tokens } from "../../design-system/tokens.generated";

export const S = {
  FavoriteContent: styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
  `,
  InlineError: styled.p`
    margin: 20px 24px 0;
    color: ${tokens.color.warning[500]};
    ${tokens.typography.body.xs};
  `,
  FavoriteList: styled.ul`
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
  SkeletonInfo: styled.div`
    display: flex;
    min-width: 0;
    flex-direction: column;
    justify-content: center;
    gap: 8px;
  `,
  Favorite: styled.li`
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 6px;
    padding: 14px;
    border: 1px solid ${tokens.color.neutral[200]};
    border-radius: 12px;
    background: white;

    time {
      grid-column: 1/-1;
      color: ${tokens.color.neutral[700]};
    }
  `,
  FavoriteOpen: styled.button`
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
    border: 0;
    background: transparent;
    text-align: left;

    small {
      color: ${tokens.color.neutral[700]};
    }
  `,
};
