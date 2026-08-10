import { keyframes } from "@emotion/react";
import styled from "@emotion/styled";

import { tokens } from "../../design-system/tokens.generated";
import { typography } from "../../design-system/typography.generated";

export type RecommendationPendingStepStatus = "pending" | "active" | "done";

const spin = keyframes`
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
`;

export const S = {
  Page: styled.div`
    display: flex;
    flex: 1;
    align-items: flex-start;
    padding: 80px 24px 40px;
    background: ${tokens.color.neutral[50]};
  `,
  Body: styled.div`
    display: flex;
    width: 100%;
    max-width: 390px;
    flex-direction: column;
    gap: 0;
  `,
  Spinner: styled.div`
    width: 64px;
    height: 64px;
    margin-bottom: 24px;
    border: 4px solid ${tokens.color.primary[500]};
    border-top-color: transparent;
    border-radius: 50%;
    animation: ${spin} 1s linear infinite;
  `,
  Title: styled.h1`
    margin: 0 0 12px;
    color: ${tokens.color.neutral[900]};
    ${typography.title.lg}
  `,
  Subtitle: styled.p`
    margin: 0 0 24px;
    color: ${tokens.color.secondary[500]};
    white-space: pre-line;
    ${typography.body.sm}
  `,
  StepList: styled.ul`
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin: 0;
    padding: 0;
    list-style: none;
  `,
  StepItem: styled.li<{ readonly $status: RecommendationPendingStepStatus }>`
    display: flex;
    align-items: center;
    gap: 8px;
    color: ${({ $status }) =>
      $status === "pending" ? tokens.color.secondary[500] : tokens.color.primary[500]};
    font-weight: ${({ $status }) => ($status === "active" ? 700 : 400)};
    opacity: ${({ $status }) => ($status === "done" ? 0.5 : 1)};
    transition:
      color 0.3s ease,
      opacity 0.3s ease,
      font-weight 0.1s ease;
    ${typography.body.md}
  `,
  Elapsed: styled.span`
    margin-left: auto;
    color: ${tokens.color.secondary[500]};
    ${typography.body.xs}
  `,
  BackButton: styled.button`
    height: 46px;
    padding: 0 20px;
    border: none;
    border-radius: 14px;
    background-color: ${tokens.color.primary[500]};
    color: ${tokens.color.neutral[0]};
    cursor: pointer;
    ${typography.label.md}
  `,
};
