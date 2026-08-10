import styled from "@emotion/styled";

import { tokens } from "../../design-system/tokens.generated";

export const S = {
  Wrapper: styled.section`
    display: flex;
    width: 100%;
    min-height: 100%;
    padding: 32px 20px;
    flex: 1;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    color: ${tokens.color.neutral["900"]};
    text-align: center;
  `,
  Title: styled.h2`
    margin: 0;
    ${tokens.typography.title.xs}
  `,
  Description: styled.p`
    margin: 0;
    color: ${tokens.color.neutral["700"]};
    ${tokens.typography.body.sm}
  `,
  ActionButton: styled.button`
    min-height: 44px;
    margin-top: 8px;
    padding: 10px 16px;
    border: 0;
    border-radius: 10px;
    background-color: ${tokens.color.primary["500"]};
    color: ${tokens.color.neutral["0"]};
    cursor: pointer;
    ${tokens.typography.utility.cta}
  `,
};
