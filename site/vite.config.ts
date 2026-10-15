import { defineConfig } from "vite";

export default defineConfig({
  base: "/",
  server: { port: 4040, strictPort: true },
  preview: { port: 4040, strictPort: true },
  build: {
    target: "es2022",
    modulePreload: { polyfill: false },
    rolldownOptions: {
      // Sonner's 'use client' marker is irrelevant outside React Server Components.
      onLog(level, log, handler) {
        if (log.code !== "MODULE_LEVEL_DIRECTIVE") handler(level, log);
      },
    },
  },
});
