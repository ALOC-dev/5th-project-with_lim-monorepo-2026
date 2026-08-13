import styled from "@emotion/styled";

import { theme } from "../../../../design-system/theme.generated";

export const S = {
  Wrapper: styled.div`
    display: flex;
    min-height: 0;
    flex-direction: column;
    gap: 16px;
    height: 70dvh;
  `,
  SelectedLocationStatus: styled.p`
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0;
    color: ${theme.tokens.color.secondary[700]};

    ${theme.tokens.typography.label.md}
  `,
  SelectionMark: styled.span`
    display: flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background-color: ${theme.tokens.color.primary[500]};
    color: ${theme.tokens.color.neutral[0]};
    font-size: 12px;
    font-weight: 700;
  `,
  SearchInputSlot: styled.div`
    flex: 0 0 auto;
  `,
  Footer: styled.div`
    flex: 0 0 auto;
  `,
};
