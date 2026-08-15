import { resolve } from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import { createLogRendererApiPlugin } from "./server/api-plugin";

const logRoots = [
  {
    label: "dev-server",
    path: resolve(import.meta.dirname, "../server/.log/recommendation"),
  },
  {
    label: "qa",
    path: resolve(import.meta.dirname, "../server/src/scripts/recommendation-engine/.log"),
  },
];

export default defineConfig({
  server: {
    host: "127.0.0.1",
    port: 4317,
    strictPort: true,
  },
  plugins: [createLogRendererApiPlugin({ logRoots }), react()],
});
