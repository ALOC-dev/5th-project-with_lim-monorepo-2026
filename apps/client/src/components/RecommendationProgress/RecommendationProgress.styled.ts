import { keyframes } from "@emotion/react";
import styled from "@emotion/styled";

import { tokens } from "../../design-system/tokens.generated";

export type RecommendationProgressStepStatus = "pending" | "active" | "done";

const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

export const S = {
  Page: styled.section`
    display: flex;
    min-height: 0;
    flex: 1;
    padding: 72px 24px 40px;
  `,
  Body: styled.div`
    display: flex;
    width: 100%;
    flex-direction: column;
    align-items: flex-start;
  `,
  Spinner: styled.div`
    width: 48px;
    height: 48px;
    margin-bottom: 24px;
    border: 4px solid ${tokens.color.primary[500]};
    border-top-color: transparent;
    border-radius: 50%;
    animation: ${spin} 1s linear infinite;
  `,
  Title: styled.h2`
    margin: 0 0 12px;
    color: ${tokens.color.neutral[900]};
    ${tokens.typography.title.sm};
  `,
  Description: styled.p`
    margin: 0 0 24px;
    color: ${tokens.color.neutral[700]};
    white-space: pre-line;
    ${tokens.typography.body.sm};
  `,
  StepList: styled.ul`
    display: flex;
    width: 100%;
    flex-direction: column;
    gap: 12px;
    margin: 0;
    padding: 0;
    list-style: none;
  `,
  StepItem: styled.li<{ readonly $status: RecommendationProgressStepStatus }>`
    display: flex;
    min-height: 24px;
    align-items: center;
    gap: 8px;
    color: ${({ $status }) =>
      $status === "pending" ? tokens.color.neutral[700] : tokens.color.primary[500]};
    font-weight: ${({ $status }) => ($status === "active" ? 700 : 400)};
    opacity: ${({ $status }) => ($status === "done" ? 0.65 : 1)};
    transition:
      color 0.3s ease,
      opacity 0.3s ease,
      font-weight 0.1s ease;
    ${tokens.typography.body.md};
  `,
  StepMark: styled.span`
    display: grid;
    width: 20px;
    height: 20px;
    flex: 0 0 auto;
    place-items: center;
    ${tokens.typography.body.xs};
  `,
  StepMeta: styled.span`
    margin-left: auto;
    color: ${tokens.color.neutral[700]};
    ${tokens.typography.body.xs};
  `,
  Action: styled.div`
    width: 100%;
    margin-top: 8px;
  `,
};
