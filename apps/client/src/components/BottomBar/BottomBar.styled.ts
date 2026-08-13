import styled from "@emotion/styled";

import { tokens } from "../../design-system/tokens.generated";

export const S = {
  Navigation: styled.nav`
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    margin-top: auto;
    padding: 8px 20px calc(8px + env(safe-area-inset-bottom));
    border-top: 1px solid ${tokens.color.neutral[200]};
    background: ${tokens.color.neutral[0]};
  `,
  NavigationButton: styled.button<{ $active: boolean }>`
    display: flex;
    height: 52px;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    border-radius: 14px;
    color: ${({ $active }) => ($active ? tokens.color.primary[500] : tokens.color.secondary[500])};
    background: ${({ $active }) => ($active ? tokens.color.primary[50] : "transparent")};

    span {
      ${tokens.typography.label.xs};
    }

    &:focus-visible {
      outline: 2px solid ${tokens.color.primary[500]};
      outline-offset: 2px;
    }
  `,
};
