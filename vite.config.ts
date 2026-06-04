import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

const host = process.env.TAURI_DEV_HOST;
const platform = process.env.PLATFORM || "desktop";

export default defineConfig({
  plugins: [react()],

  root: path.resolve(__dirname, `frontend/${platform}`),

  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "frontend/shared"),
    },
  },

  publicDir: path.resolve(__dirname, "public"),

  clearScreen: false,

  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
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
