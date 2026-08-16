import styled from "@emotion/styled";

import { tokens } from "../../design-system/tokens.generated";

export const S = {
  Detail: styled.div`
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 16px;
    padding: 12px 24px 32px;
    overflow: auto;
  `,
  Card: styled.section`
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 20px 16px;
    border: 1px solid ${tokens.color.neutral[200]};
    border-radius: 16px;
    background: ${tokens.color.neutral[0]};
  `,
  SectionLabel: styled.h3`
    margin: 0;
    color: ${tokens.color.neutral[700]};
    ${tokens.typography.label.lg};
  `,
  Reason: styled.p`
    margin: 0;
    color: ${tokens.color.neutral[900]};
    ${tokens.typography.body.lg};
  `,
  AdditionalInfo: styled.details`
    border: 1px solid ${tokens.color.neutral[200]};
    border-radius: 16px;
    background: ${tokens.color.neutral[0]};

    summary {
      display: flex;
      min-height: 56px;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
      color: ${tokens.color.neutral[900]};
      cursor: pointer;
      list-style: none;
      ${tokens.typography.label.lg};

      &::-webkit-details-marker {
        display: none;
      }

      svg {
        transition: transform 160ms ease;
      }

      &:focus-visible {
        outline: 2px solid ${tokens.color.primary[500]};
        outline-offset: 2px;
        border-radius: 16px;
      }
    }

    &[open] summary svg {
      transform: rotate(90deg);
    }
  `,
  AdditionalContent: styled.div`
    display: flex;
    flex-direction: column;
    gap: 20px;
    padding: 0 16px 18px;
  `,
  InfoSection: styled.section`
    display: flex;
    flex-direction: column;
    gap: 8px;

    h4,
    p {
      margin: 0;
    }

    h4 {
      color: ${tokens.color.neutral[900]};
      ${tokens.typography.label.lg};
    }

    p {
      color: ${tokens.color.neutral[700]};
      ${tokens.typography.body.sm};
    }
  `,
  InfoList: styled.ul`
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin: 0;
    padding-left: 20px;
    color: ${tokens.color.neutral[700]};
    ${tokens.typography.body.sm};
  `,
  DecisionList: styled.ul`
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin: 0;
    padding: 0;
    color: ${tokens.color.neutral[700]};
    list-style: none;
    ${tokens.typography.body.sm};

    li {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
  `,
  InlineError: styled.p`
    margin: -4px 0 0;
    color: ${tokens.color.warning[500]};
    ${tokens.typography.body.xs};
  `,
};
