import React from "react";
import ReactDOM from "react-dom/client";
import { AppErrorBoundary } from "@shared/components/AppErrorBoundary";
import { syncDeviceTheme } from "@shared/utils/device-theme";
import { formatError, logError } from "@shared/utils/logger";
import { installStartupErrorLogging, renderStartupError } from "@shared/utils/startup-errors";
import App from "./App";
import "./index.css";

installStartupErrorLogging();

try {
  syncDeviceTheme();
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <AppErrorBoundary>
        <App />
      </AppErrorBoundary>
    </React.StrictMode>,
  );
} catch (error) {
  void logError("Desktop app startup failed", error);
  renderStartupError(formatError(error));
}
