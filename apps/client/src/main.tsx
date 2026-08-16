import "modern-css-reset/dist/reset.css";

import { ThemeProvider } from "@emotion/react";
import React from "react";
import ReactDOM from "react-dom/client";
import { Toaster } from "sonner";

import App from "./App";
import { AuthProvider } from "./contexts/Auth.context";
import { theme } from "./design-system/theme.generated";
import GlobalStyle from "./styles/GlobalStyle";

const reactDevToolsSetting = import.meta.env.VITE_DISABLE_REACT_DEVTOOLS;
const reactDevToolsDisabled =
  reactDevToolsSetting === "1" || reactDevToolsSetting === "true";
const shouldLoadReactDevTools = import.meta.env.DEV && !reactDevToolsDisabled;

const renderApp = () => {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <ThemeProvider theme={theme}>
        <GlobalStyle />
        <AuthProvider>
          <App />
        </AuthProvider>
        <Toaster
          closeButton
          position="top-center"
          richColors
          theme="light"
          toastOptions={{ duration: 4_000 }}
        />
      </ThemeProvider>
    </React.StrictMode>,
  );
};

if (shouldLoadReactDevTools) {
  void Promise.all([import("react-scan"), import("react-grab")])
    .then(([{ scan }]) => scan({ enabled: true }))
    .finally(renderApp);
} else {
  renderApp();
}
