import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [
          [
            "@emotion/babel-plugin",
            {
              sourceMap: true,
              autoLabel: "dev-only",
              labelFormat: "[filename]__[local]",
            },
          ],
        ],
      },
    }),
  ],
});
