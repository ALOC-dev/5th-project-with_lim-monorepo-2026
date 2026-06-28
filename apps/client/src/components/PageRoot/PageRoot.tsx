import styled from "@emotion/styled";
import { useLayoutEffect } from "react";

import { tokens } from "../../design-system/tokens.generated";

type PageRootBackgroundColor = {
  [Group in keyof typeof tokens.color]: (typeof tokens.color)[Group][keyof (typeof tokens.color)[Group]];
}[keyof typeof tokens.color];

type PageRootProps = {
  backgroundColor?: PageRootBackgroundColor;
  children: React.ReactNode;
};

/**
 * 페이지 배경의 단일 소유자.
 * body/#root 배경은 GlobalStyle에 선언된 `--page-background` 규칙 하나로 관리되고, PageRoot는 그 변수 '값'만 갱신한다.
 */
const PageRoot = ({ backgroundColor = tokens.color.primary[50], children }: PageRootProps) => {
  useLayoutEffect(() => {
    document.documentElement.style.setProperty("--page-background", backgroundColor);
  }, [backgroundColor]);

  return <S.Wrapper $backgroundColor={backgroundColor}>{children}</S.Wrapper>;
};

export default PageRoot;

const S = {
  Wrapper: styled.main<{ $backgroundColor: PageRootBackgroundColor }>`
    flex: 1;
    min-height: 100dvh;
    padding-bottom: env(safe-area-inset-bottom);
    background-color: var(--page-background);
    overflow-x: hidden;
  `,
};
