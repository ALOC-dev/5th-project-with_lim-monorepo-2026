import { readFileSync } from "node:fs";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const httpsCertPath = process.env.ALOC_DEV_HTTPS_CERT;
const httpsKeyPath = process.env.ALOC_DEV_HTTPS_KEY;

if ((httpsCertPath && !httpsKeyPath) || (!httpsCertPath && httpsKeyPath)) {
  throw new Error("ALOC_DEV_HTTPS_CERT and ALOC_DEV_HTTPS_KEY must be provided together.");
}

export default defineConfig({
  server: {
    // Allow other devices on the local network to use the development server.
    host: true,
    https:
      httpsCertPath && httpsKeyPath
        ? {
            cert: readFileSync(httpsCertPath),
            key: readFileSync(httpsKeyPath),
          }
        : undefined,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3000",
        changeOrigin: true,
      },
      "/health": {
        target: "http://127.0.0.1:3000",
        changeOrigin: true,
      },
    },
  },
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
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        id: "/",
        name: "SAI",
        short_name: "SAI",
        description: "나에게 맞는 장소와 코스를 추천받는 SAI",
        lang: "ko-KR",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#FFF7F2",
        theme_color: "#CC785C",
        launch_handler: {
          client_mode: "focus-existing",
        },
        icons: [
          {
            src: "/pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "/pwa-maskable-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        navigateFallback: "index.html",
        navigateFallbackDenylist: [/^\/api\//, /^\/health$/],
      },
    }),
  ],
});
