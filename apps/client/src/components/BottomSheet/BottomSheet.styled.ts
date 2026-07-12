import { keyframes } from "@emotion/react";
import styled from "@emotion/styled";

import { tokens } from "../../design-system/tokens.generated";

const bottomSheetEnter = keyframes`
  from {
    transform: translateY(100%);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
`;

const bottomSheetExit = keyframes`
  from {
    transform: translateY(0);
    opacity: 1;
  }
  to {
    transform: translateY(100%);
    opacity: 0;
  }
`;

export const S = {
  Wrapper: styled.div<{
    readonly $height: string;
  }>`
    display: flex;
    flex-direction: column;

    position: fixed;
    bottom: 0;
    left: 0;
    height: ${({ $height }) => $height};
    max-height: calc(100dvh - 24px);
    overflow: hidden;
    background-color: ${tokens.color.neutral[50]};
    border-radius: 16px 16px 0 0;
    pointer-events: auto;

    overflow-x: hidden;
    overflow-y: auto;
    overscroll-behavior-y: none;

    transform: translateY(100%);
    opacity: 0;
    transition:
      transform var(--overlay-animation-duration) ease,
      opacity var(--overlay-animation-duration) ease;

    [data-state="opening"] & {
      transform: translateY(0);
      opacity: 1;
      animation: ${bottomSheetEnter} var(--overlay-animation-duration) ease both;
    }

    [data-state="opened"] & {
      transform: translateY(0);
      opacity: 1;
    }

    [data-state="closing"] & {
      pointer-events: none;
      transform: translateY(100%);
      opacity: 0;
      animation: ${bottomSheetExit} var(--overlay-animation-duration) ease both;
    }
  `,
  InnerPadding: styled.div`
    display: flex;
    min-height: 0;
    flex: 1;
    flex-direction: column;
    padding: 16px 24px 20px;
    overflow-x: hidden;
    overflow-y: auto;
  `,
  HandleWrapper: styled.div`
    display: flex;
    justify-content: center;
    padding-top: 8px;
    padding-bottom: 16px;
    cursor: grab;
    touch-action: none;
    user-select: none;

    &:active {
      cursor: grabbing;
    }
  `,
  Handle: styled.div`
    width: 40px;
    height: 4px;
    background-color: ${tokens.color.neutral[200]};
    border-radius: 2px;
  `,
};
