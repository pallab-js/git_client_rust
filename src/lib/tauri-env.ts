/**
 * Returns true when the page is running inside a Tauri webview.
 *
 * When the app is opened in a plain browser (for example during Playwright
 * UI tests or when previewing the Vite dev server) the Tauri IPC bridge is
 * missing. Callers use this to fall back to the in-memory mock backend
 * instead of throwing `transformCallback` errors.
 */
export function isTauriRuntime(): boolean {
  if (typeof window === "undefined") return false;
  const candidate = window as typeof window & { __TAURI_INTERNALS__?: unknown };
  return Boolean(candidate.__TAURI_INTERNALS__);
}
