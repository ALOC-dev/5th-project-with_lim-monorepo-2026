import styled from "@emotion/styled";

import { theme } from "../../../../../../design-system/theme.generated";

export const S = {
  Wrapper: styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 100%;
  `,
  Label: styled.h2`
    margin: 0;

    color: ${theme.tokens.color.neutral[900]};
    font-family: "Noto Sans KR", sans-serif;
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
};
