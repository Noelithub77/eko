import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

const host = process.env.TAURI_DEV_HOST;
const platform = process.env.PLATFORM || "desktop";
const port = Number(process.env.VITE_PORT || 1420);
const isWebClient = platform === "web/client";
const webClientHost = process.env.WEB_CLIENT_DEV_HOST;

export default defineConfig({
  plugins: [react(), tailwindcss()],

  root: path.resolve(__dirname, `frontend/${platform}`),
  cacheDir: path.resolve(__dirname, `node_modules/.vite-${platform}`),

  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "frontend/shared"),
    },
  },

  publicDir: path.resolve(__dirname, "public"),

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
    outDir: path.resolve(__dirname, `dist/${platform}`),
    emptyOutDir: true,
  },
});
