import styled from "@emotion/styled";

import { tokens } from "../../design-system/tokens.generated";

export const S = {
  Wrapper: styled.header`
    display: flex;
    min-height: 52px;
    padding: 12px 20px;
    align-items: center;
    gap: 12px;
    background-color: ${tokens.color.neutral["50"]};
  `,
  BackButton: styled.button`
    display: flex;
    width: 44px;
    height: 44px;
    margin: -10px;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 0;
    background: none;
    color: ${tokens.color.neutral["900"]};
    cursor: pointer;
  `,
  Title: styled.h1`
    margin: 0;
    color: ${tokens.color.neutral["900"]};
    ${tokens.typography.utility.screenTitle}
    font-weight: 600;
  `,
  Right: styled.div`
    display: flex;
    margin-left: auto;
    align-items: center;
  `,
};
