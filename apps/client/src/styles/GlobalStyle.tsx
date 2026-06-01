import { css, Global } from "@emotion/react";

import { tokens } from "../design-system/tokens.generated";

const globalStyle = css`
  *,
  *::before,
  *::after {
    box-sizing: border-box;
  }

  html,
  body,
  #root {
    min-height: 100%;
    background-color: ${tokens.color.primary[50]};
  }

  html {
    -webkit-text-size-adjust: 100%;
  }

  body {
    min-height: 100dvh;
    margin: 0;
    overflow-x: hidden;
    text-rendering: optimizeSpeed;
    line-height: 1.5;
  }

  #root {
    min-height: 100dvh;
    position: relative;
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

  button {
    cursor: pointer;
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

const GlobalStyle = () => <Global styles={globalStyle} />;

export default GlobalStyle;
