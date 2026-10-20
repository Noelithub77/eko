import { createRoot } from "react-dom/client";
import { AppErrorBoundary } from "@shared/components/AppErrorBoundary";
import App from "./popup/App";
import "./style.css";

document.documentElement.classList.toggle("dark", localStorage.getItem("eko-extension-theme") === "dark" ||
  (!localStorage.getItem("eko-extension-theme") && matchMedia("(prefers-color-scheme: dark)").matches));
const root = document.getElementById("root");
if (root) createRoot(root).render(<AppErrorBoundary><App /></AppErrorBoundary>);
