import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { applyCachedTheme } from "./stores/settings";
import "./styles/app.css";

applyCachedTheme();

function showBootError(error: unknown) {
  const root = document.getElementById("root");
  const message =
    error instanceof Error
      ? `${error.name}: ${error.message}\n${error.stack ?? ""}`
      : String(error);
  if (root) {
    root.innerHTML = "";
    const pre = document.createElement("pre");
    pre.style.cssText =
      "margin:0;padding:16px;white-space:pre-wrap;word-break:break-word;color:#f85149;background:#0b0d10;min-height:100vh;font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace";
    pre.textContent = `GitPulse failed to start\n\n${message}`;
    root.appendChild(pre);
  } else {
    document.body.textContent = message;
  }
}

window.addEventListener("error", (event) => {
  showBootError(event.error ?? event.message);
});
window.addEventListener("unhandledrejection", (event) => {
  showBootError(event.reason);
});

try {
  const container = document.getElementById("root");
  if (!container) {
    throw new Error("Root element #root not found");
  }
  createRoot(container).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  );
} catch (error) {
  showBootError(error);
}
