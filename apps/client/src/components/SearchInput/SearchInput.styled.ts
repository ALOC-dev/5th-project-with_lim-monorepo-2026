import styled from "@emotion/styled";

import { theme } from "../../design-system/theme.generated";

export const S = {
  Wrapper: styled.div`
    position: relative;
    display: flex;
    align-items: center;
    width: 100%;
    height: 48px;

    > input {
      padding: 0 44px;
    }
  `,
  IconButton: styled.button`
    position: absolute;
    top: 0;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 48px;
    padding: 0;

    color: ${theme.tokens.color.neutral[700]};
    background: transparent;
    border: 0;
    cursor: pointer;

    &:first-child {
      left: 0;
    }

    &:last-child {
      right: 0;
    }

    &:disabled {
      cursor: default;
      opacity: 0;
    }
  `,
};
