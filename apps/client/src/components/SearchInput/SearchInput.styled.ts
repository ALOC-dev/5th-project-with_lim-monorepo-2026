import styled from "@emotion/styled";

import { theme } from "../../design-system/theme.generated";

export const S = {
  Wrapper: styled.div`
    display: flex;
    align-items: center;
    width: 100%;
    height: 48px;
    overflow: hidden;

    background-color: ${theme.tokens.color.neutral[0]};
    border: 1px solid #e6dfd8;
    border-radius: 8px;
    transition:
      border-color 0.2s ease,
      box-shadow 0.2s ease;

    &:focus-within {
      border-color: ${theme.tokens.color.primary[500]};
      box-shadow: 0 0 0 2px ${theme.tokens.color.primary[50]};
    }
  `,
  IconButton: styled.button`
    display: flex;
    flex: 0 0 44px;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 100%;
    padding: 0;

    color: ${theme.tokens.color.neutral[700]};
    background: transparent;
    border: 0;
    cursor: pointer;

    &:disabled {
      cursor: default;
      opacity: 0;
    }
  `,
  Input: styled.input`
    min-width: 0;
    flex: 1;
    height: 100%;
    padding: 0;

    color: ${theme.tokens.color.neutral[900]};
    background: transparent;
    border: 0;
    outline: none;

    ${theme.tokens.typography.body.md}

    &::placeholder {
      color: ${theme.tokens.color.neutral[700]};
    }
  `,
};
