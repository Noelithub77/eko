import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".", testMatch: "*.spec.ts", fullyParallel: false,
  outputDir: "../../.test-results/extension",
  webServer: { command: "pnpm exec cross-env PLATFORM=extension VITE_PORT=4141 vite --host 127.0.0.1",
    cwd: new URL("../..", import.meta.url).pathname,
    url: "http://127.0.0.1:4141/popup.html", reuseExistingServer: true, timeout: 30_000 },
  use: { baseURL: "http://127.0.0.1:4141", viewport: { width: 420, height: 600 },
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } },
});
