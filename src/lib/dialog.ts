import { open, save } from "@tauri-apps/plugin-dialog";

import { isTauriRuntime } from "./tauri-env";

/**
 * Thin wrappers around the Tauri dialog plugin.
 *
 * Outside Tauri there is no native picker, so we fall back to `window.prompt`.
 * That keeps previews and Playwright runs functional instead of throwing when
 * the dialog plugin is unavailable.
 */
export async function pickDirectory(title: string): Promise<string | null> {
  if (!isTauriRuntime()) {
    const value = window.prompt(`${title}\n\nFolder path:`, "");
    return value && value.trim() ? value.trim() : null;
  }
  const selected = await open({ directory: true, multiple: false, title });
  return typeof selected === "string" ? selected : null;
}

interface SaveDialogOptions {
  title: string;
  defaultPath: string;
  filters: Array<{ name: string; extensions: string[] }>;
}

export async function pickSavePath(options: SaveDialogOptions): Promise<string | null> {
  if (!isTauriRuntime()) {
    const value = window.prompt(`${options.title}\n\nSave as:`, options.defaultPath);
    return value && value.trim() ? value.trim() : null;
  }
  const selected = await save(options);
  return typeof selected === "string" ? selected : null;
}
