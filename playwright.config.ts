import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  webServer: {
    command: "pnpm exec cross-env VITE_PORT=4105 pnpm dev:web:desktop --host 127.0.0.1",
    url: "http://127.0.0.1:4105",
    reuseExistingServer: true,
    timeout: 30_000,
  },
  use: {
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH },
    baseURL: "http://127.0.0.1:4105",
  },
});
