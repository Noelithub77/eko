import React from "react";
import ReactDOM from "react-dom/client";
import { syncDeviceTheme } from "@shared/utils/device-theme";
import App from "./App";
import "./index.css";

syncDeviceTheme();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
