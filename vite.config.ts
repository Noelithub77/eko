import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

const host = process.env.TAURI_DEV_HOST;
const platform = process.env.PLATFORM || "desktop";
const port = Number(process.env.VITE_PORT || 1420);
const isWebClient = platform === "web/client";
const isHosted = platform === "hosted";
const isExtension = platform === "extension";
const webClientHost = process.env.WEB_CLIENT_DEV_HOST;

export default defineConfig({
  plugins: [react(), tailwindcss()],

  root: path.resolve(__dirname, isExtension ? "extension" : `frontend/${isHosted ? "web" : platform}`),
  base: isExtension ? "./" : "/",
  publicDir: isExtension ? path.resolve(__dirname, "extension/public") : isHosted ? path.resolve(__dirname, "frontend/web/public") : "public",
  cacheDir: path.resolve(__dirname, `node_modules/.vite-${platform}`),

  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "frontend/shared"),
    },
  },

  clearScreen: false,

  server: {
    port,
    strictPort: true,
    host: host || (isWebClient && webClientHost ? "0.0.0.0" : false),
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: port + 1,
        }
      : isWebClient && webClientHost
        ? {
            host: webClientHost,
            clientPort: port,
          }
        : undefined,
    watch: {
      ignored: ["**/rust/**"],
    },
  },

  build: {
    outDir: path.resolve(__dirname, `dist/${isHosted ? "hosted" : platform}`),
    emptyOutDir: true,
    rollupOptions: isExtension ? {
      input: {
        popup: path.resolve(__dirname, "extension/popup.html"),
        receiver: path.resolve(__dirname, "extension/receiver.html"),
        offscreen: path.resolve(__dirname, "extension/offscreen.html"),
        background: path.resolve(__dirname, "extension/background.ts"),
      },
      output: { entryFileNames: "[name].js" },
      onwarn(warning, warn) {
        if (warning.code !== "MODULE_LEVEL_DIRECTIVE") warn(warning);
      },
    } : isHosted ? {
      input: {
        landing: path.resolve(__dirname, "frontend/web/index.html"),
        client: path.resolve(__dirname, "frontend/web/client/index.html"),
      },
      onwarn(warning, warn) {
        if (warning.code !== "MODULE_LEVEL_DIRECTIVE") warn(warning);
      },
    } : undefined,
  },
});
