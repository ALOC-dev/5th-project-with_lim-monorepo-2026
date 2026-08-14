import styled from "@emotion/styled";

import { tokens } from "../../design-system/tokens.generated";

export const S = {
  Detail: styled.div`
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 14px;
    overflow: auto;
  `,
  Card: styled.section`
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 0 24px;
    padding: 16px;
    border: 1px solid ${tokens.color.neutral[200]};
    border-radius: 12px;
    background: white;

    h3,
    h4,
    p {
      margin: 0;
    }

    span,
    p {
      color: ${tokens.color.neutral[700]};
    }
  `,
  Heading: styled.h2`
    margin: 0;
    color: ${tokens.color.neutral[900]};
    ${tokens.typography.title.xs};
  `,
  TypeDescription: styled.p`
    color: ${tokens.color.neutral[700]};
  `,
  Route: styled.p`
    color: ${tokens.color.primary[700]}!important;
  `,
  Stop: styled.div`
    display: grid;
    grid-template-columns: 42px 26px 1fr;
    gap: 8px;

    time {
      color: ${tokens.color.neutral[700]};
    }

    b {
      display: grid;
      width: 24px;
      height: 24px;
      place-items: center;
      border-radius: 50%;
      background: ${tokens.color.primary[100]};
    }

    span {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    small {
      color: ${tokens.color.neutral[700]};
    }

    a {
      min-height: 44px;
      padding: 12px 0;
      color: ${tokens.color.primary[700]};
    }
  `,
  Leg: styled.p`
    margin: 8px 0 8px 76px;
    color: ${tokens.color.neutral[700]};
    ${tokens.typography.body.xs};
  `,
  ReasonList: styled.ul`
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin: 0;
    padding-left: 20px;
    color: ${tokens.color.neutral[700]};
  `,
  MealPlan: styled.div`
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 12px;
    border-radius: 10px;
    background: ${tokens.color.primary[50]};
  `,
  DecisionList: styled.ul`
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin: 0;
    padding: 0;
    list-style: none;

    li {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
  `,
  LegacyBadge: styled.span`
    align-self: flex-start;
    padding: 5px 10px;
    border-radius: 999px;
    background: ${tokens.color.neutral[50]};
    color: ${tokens.color.neutral[700]};
    ${tokens.typography.label.xs};
  `,
  InlineError: styled.p`
    margin: 20px 24px 0;
    color: ${tokens.color.warning[500]};
    ${tokens.typography.body.xs};
  `,
  MapNotice: styled.p`
    margin: 0 24px;
    color: ${tokens.color.neutral[700]};
    ${tokens.typography.body.xs};
  `,
};
