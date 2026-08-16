import { css, Global } from "@emotion/react";

import { tokens } from "../design-system/tokens.generated";

const globalResetStyle = css`
  *,
  *::before,
  *::after {
    box-sizing: border-box;
  }

  :root {
    /* 페이지 배경의 단일 소스. 값은 PageRoot가 선언적으로 갱신한다. */
    --page-background: ${tokens.color.primary[50]};
  }

  html,
  body,
  #root {
    min-height: 100%;
    background-color: var(--page-background);
  }

  html {
    color-scheme: light;
    -webkit-text-size-adjust: 100%;
    overscroll-behavior-y: none;
  }

  body {
    position: relative;
    min-height: 100dvh;
    margin: 0;
    overflow-x: hidden;
    overscroll-behavior-y: none;
    text-rendering: optimizeSpeed;
    /* Global reset baseline only. Component text must use design-system typography tokens. */
    line-height: 1.5;

    display: flex;
    flex-direction: column;
  }

  #root {
    flex: 1;
    min-height: 100dvh;

    overflow-x: hidden;
    display: flex;
    flex-direction: column;
  }

  h1,
  h2,
  h3,
  h4,
  h5,
  h6,
  p,
  figure,
  blockquote,
  dl,
  dd {
    margin: 0;
  }

  ul[role="list"],
  ol[role="list"] {
    list-style: none;
  }

  img,
  picture,
  svg,
  video,
  canvas {
    display: block;
    max-width: 100%;
  }

  button,
  input,
  textarea,
  select {
    font: inherit;
  }

  button,
  a {
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
  }

  [data-route-frame] {
    display: flex;
    min-width: 0;
    flex: 1;
    flex-direction: column;
  }

  button {
    appearance: none;
    margin: 0;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    color: inherit;
    cursor: pointer;
    text-align: inherit;
  }

  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      scroll-behavior: auto !important;
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
    }
  }
`;

const GlobalStyle = () => <Global styles={globalResetStyle} />;

export default GlobalStyle;
