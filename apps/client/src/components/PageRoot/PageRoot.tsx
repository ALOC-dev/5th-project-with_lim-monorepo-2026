import styled from "@emotion/styled";
import { useLayoutEffect } from "react";

import { tokens } from "../../design-system/tokens.generated";

type PageRootBackgroundColor = {
  [Group in keyof typeof tokens.color]: (typeof tokens.color)[Group][keyof (typeof tokens.color)[Group]];
}[keyof typeof tokens.color];

export type PageRootLayout = "full" | "contained";

type PageRootProps = {
  backgroundColor?: PageRootBackgroundColor;
  children: React.ReactNode;
  layout?: PageRootLayout;
  withBottomSafeArea?: boolean;
};

/**
 * 페이지 배경의 단일 소유자.
 * body/#root 배경은 GlobalStyle에 선언된 `--page-background` 규칙 하나로 관리되고, PageRoot는 그 변수 '값'만 갱신한다.
 */
const PageRoot = ({
  backgroundColor = tokens.color.primary[50],
  children,
  layout = "full",
  withBottomSafeArea = true,
}: PageRootProps) => {
  useLayoutEffect(() => {
    document.documentElement.style.setProperty("--page-background", backgroundColor);
  }, [backgroundColor]);

  return (
    <S.Wrapper
      $backgroundColor={backgroundColor}
      $layout={layout}
      $withBottomSafeArea={withBottomSafeArea}
      data-layout={layout}
    >
      {children}
    </S.Wrapper>
  );
};

export default PageRoot;

const S = {
  Wrapper: styled.main<{
    $backgroundColor: PageRootBackgroundColor;
    $layout: PageRootLayout;
    $withBottomSafeArea: boolean;
  }>`
    display: flex;
    flex: 1;
    flex-direction: column;
    width: 100%;
    max-width: ${({ $layout }) => ($layout === "contained" ? "390px" : "none")};
    margin-inline: ${({ $layout }) => ($layout === "contained" ? "auto" : "0")};
    min-height: 100dvh;
    padding-top: ${({ $layout }) => ($layout === "contained" ? "env(safe-area-inset-top)" : "0")};
    padding-bottom: ${({ $withBottomSafeArea }) =>
      $withBottomSafeArea ? "env(safe-area-inset-bottom)" : "0"};
    background-color: var(--page-background);
    overflow-x: hidden;
  `,
};
