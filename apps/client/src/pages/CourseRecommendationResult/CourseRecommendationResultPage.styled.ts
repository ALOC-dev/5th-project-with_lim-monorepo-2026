import styled from "@emotion/styled";

import { tokens } from "../../design-system/tokens.generated";

export const S = {
  Result: styled.section`
    display: flex;
    min-height: 0;
    flex: 1;
    flex-direction: column;
    gap: 16px;
    padding: 12px 24px 32px;
    overflow: auto;
  `,
  ResultHeader: styled.div`
    display: flex;
    flex-direction: column;
    gap: 4px;
  `,
  ResultTitle: styled.h2`
    margin: 0;
    color: ${tokens.color.neutral[900]};
    ${tokens.typography.title.xs};
  `,
  ResultCount: styled.span`
    color: ${tokens.color.primary[700]};
  `,
  ResultDescription: styled.p`
    margin: 0;
    color: ${tokens.color.neutral[700]};
    ${tokens.typography.body.sm};
  `,
};
