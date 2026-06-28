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
  Wrapper: styled.div<{ $presenceAnimationDurationMs: number }>`
    overflow-y: scroll;
    overscroll-behavior-y: none;

    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    background-color: ${tokens.color.neutral[0]};
    border-radius: 16px 16px 0 0;

    transform: translateY(100%);
    opacity: 0;
    transition:
      transform ${({ $presenceAnimationDurationMs }) => $presenceAnimationDurationMs}ms ease,
      opacity ${({ $presenceAnimationDurationMs }) => $presenceAnimationDurationMs}ms ease;

    &[data-state="opening"] {
      transform: translateY(0);
      opacity: 1;
      animation: ${bottomSheetEnter} ${({ $presenceAnimationDurationMs }) => $presenceAnimationDurationMs}ms
        ease both;
    }

    &[data-state="opened"] {
      transform: translateY(0);
      opacity: 1;
    }

    &[data-state="closing"] {
      pointer-events: none;
      transform: translateY(100%);
      opacity: 0;
      animation: ${bottomSheetExit} ${({ $presenceAnimationDurationMs }) => $presenceAnimationDurationMs}ms
        ease both;
    }
  `,
  InnerPadding: styled.div`
    padding: 16px 28px;
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
