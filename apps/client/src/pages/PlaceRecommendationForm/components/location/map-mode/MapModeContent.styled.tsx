import styled from "@emotion/styled";

import { theme } from "../../../../../design-system/theme.generated";

export const S = {
  Wrapper: styled.div`
    display: flex;
    flex-direction: column;
    gap: 16px;
    flex: 1;
  `,
  MapFrame: styled.div`
    position: relative;
    width: 100%;
    min-height: 0;
    flex: 1;
  `,
  ActionRow: styled.div`
    display: flex;
    gap: 8px;
  `,
  CenterMarker: styled.div`
    position: absolute;
    left: 50%;
    top: 50%;
    z-index: 1;
    width: 8px;
    height: 8px;
    border-radius: 500%;
    background: blue;
    transform: translate(-50%, -50%);
    pointer-events: none;
  `,
  CurrentLocationButton: styled.button`
    position: absolute;
    right: 16px;
    bottom: 16px;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    padding: 0;
    border: 1px solid ${theme.tokens.color.neutral[200]};
    border-radius: 50%;
    color: ${theme.tokens.color.neutral[700]};
    background: ${theme.tokens.color.neutral[0]};
    box-shadow: 0 2px 8px rgba(20, 20, 19, 0.18);
    cursor: pointer;

    &:focus-visible {
      outline: 2px solid ${theme.tokens.color.primary[500]};
      outline-offset: 2px;
    }

    &:active {
      transform: scale(0.96);
    }

    &:disabled {
      cursor: wait;
      opacity: 0.65;
      transform: none;
    }
  `,
};
