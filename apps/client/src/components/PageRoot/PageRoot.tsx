import styled from "@emotion/styled";

import { tokens } from "../../design-system/tokens.generated";

const PageRoot = ({ children }: { children: React.ReactNode }) => {
  return <S.Root>{children}</S.Root>;
};

export default PageRoot;

const S = {
  Root: styled.div`
    width: 100%;
    min-height: 100dvh;
    background: ${tokens.color.primary[50]};
    overflow-x: hidden;
  `,
};
