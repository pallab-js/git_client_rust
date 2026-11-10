export type Surface = "main" | "popover";

export function detectSurface(): Surface {
  if (typeof window === "undefined") return "main";
  const params = new URLSearchParams(window.location.search);
  if (params.get("surface") === "popover") return "popover";
  try {
    const globalWindow = window as typeof window & {
      __TAURI_INTERNALS__?: { metadata?: { currentWindow?: { label?: string } } };
    };
    const label = globalWindow.__TAURI_INTERNALS__?.metadata?.currentWindow?.label;
    if (label === "popover") return "popover";
  } catch {
    // Browser preview: fall through to the default surface.
  }
  return "main";
}

export async function hideCurrentWindow(): Promise<void> {
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().hide();
  } catch {
    // Browser preview or a missing window permission: nothing to hide.
  }
}
