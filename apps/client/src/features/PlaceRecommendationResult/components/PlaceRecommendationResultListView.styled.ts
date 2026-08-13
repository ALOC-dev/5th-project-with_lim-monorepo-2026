import styled from "@emotion/styled";

import { tokens } from "../../../design-system/tokens.generated";

export const S = {
  Root: styled.div`
    position: relative;
    display: flex;
    min-height: 0;
    flex: 1;
    flex-direction: column;
    overflow: hidden;
    padding-top: env(safe-area-inset-top);
  `,
  HeaderLayer: styled.div`
    position: relative;
    z-index: 1001;
    width: 100%;
    max-width: 390px;
    margin-inline: auto;
    border-bottom: 1px solid ${tokens.color.neutral[200]};
    box-shadow: 0 2px 12px rgba(20, 20, 19, 0.06);
  `,
};
