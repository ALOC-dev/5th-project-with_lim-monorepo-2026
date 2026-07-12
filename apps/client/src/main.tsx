import "modern-css-reset/dist/reset.css";

import { ThemeProvider } from "@emotion/react";
import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App";
import { theme } from "./design-system/theme.generated";
import GlobalStyle from "./styles/GlobalStyle";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <GlobalStyle />
      <App />
    </ThemeProvider>
  </React.StrictMode>,
);
