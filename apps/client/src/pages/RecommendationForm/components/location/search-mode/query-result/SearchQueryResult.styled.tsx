import styled from "@emotion/styled";

import { theme } from "../../../../../../design-system/theme.generated";

export const S = {
  Wrapper: styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 100%;
    overflow-y: auto;
  `,
  Label: styled.h2`
    margin: 0;

    color: ${theme.tokens.color.neutral[900]};

    /* Figma label spec(12px/18px/700) has no matching design-system typography token yet. */
    font-family: "Noto Sans KR", system-ui, sans-serif;
    font-size: 12px;
    font-weight: 700;
    line-height: 18px;
  `,
  List: styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 100%;
  `,
  StatusText: styled.p`
    margin: 0;
    padding: 10px 0;

    color: ${theme.tokens.color.secondary[500]};

    ${theme.tokens.typography.body.xs}
  `,
};
