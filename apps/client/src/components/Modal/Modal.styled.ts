import { keyframes } from "@emotion/react";
import styled from "@emotion/styled";

import { tokens } from "../../design-system/tokens.generated";
import { typography } from "../../design-system/typography.generated";

const modalEnter = keyframes`
  from {
    opacity: 0;
    transform: translateY(calc(-50% + 8px));
  }

  to {
    opacity: 1;
    transform: translateY(-50%);
  }
`;

const modalExit = keyframes`
  from {
    opacity: 1;
    transform: translateY(-50%);
  }

  to {
    opacity: 0;
    transform: translateY(calc(-50% + 8px));
  }
`;

export const S = {
  Dialog: styled.section`
    position: fixed;
    top: 50%;
    inset-inline: 20px;
    transform: translateY(-50%);

    display: flex;
    flex-direction: column;
    gap: 16px;

    padding: 20px;

    background-color: ${tokens.color.neutral[50]};
    border: 1px solid ${tokens.color.neutral[200]};
    border-radius: 16px;

    opacity: 0;
    transition:
      opacity var(--overlay-animation-duration) ease,
      transform var(--overlay-animation-duration) ease;

    [data-state="opening"] & {
      opacity: 1;
      animation: ${modalEnter} var(--overlay-animation-duration) ease both;
    }

    [data-state="opened"] & {
      opacity: 1;
      transform: translateY(-50%);
    }

    [data-state="closing"] & {
      pointer-events: none;
      opacity: 0;
      animation: ${modalExit} var(--overlay-animation-duration) ease both;
    }
  `,
  Texts: styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
  `,
  Title: styled.h2`
    ${typography.title.lg}
    color: ${tokens.color.neutral[900]};
    word-break: keep-all;
  `,
  Description: styled.p`
    ${typography.body.xs}
    color: ${tokens.color.secondary[700]};
  `,
  ActionRow: styled.div<{ $hasSecondaryAction: boolean }>`
    display: grid;
    grid-template-columns: ${({ $hasSecondaryAction }) =>
      $hasSecondaryAction ? "repeat(2, minmax(0, 1fr))" : "minmax(0, 1fr)"};
    gap: 10px;
  `,
  Button: styled.button<{ variant: "primary" | "secondary" }>`
    padding: 14px 16px;
    border: ${({ variant }) =>
      variant === "secondary" ? `1px solid ${tokens.color.neutral[200]}` : "0"};
    border-radius: 12px;
    background-color: ${({ variant }) =>
      variant === "primary" ? tokens.color.primary[500] : tokens.color.secondary[100]};
    color: ${({ variant }) =>
      variant === "primary" ? tokens.color.neutral[0] : tokens.color.neutral[900]};
    ${typography.utility.cta}
    text-align: center;

    &:disabled {
      cursor: not-allowed;
      opacity: 0.5;
    }
  `,
};
