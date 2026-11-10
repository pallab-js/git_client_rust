import { open, save } from "@tauri-apps/plugin-dialog";

import { useRepos } from "../stores/repos";
import { useUi, type ToastTone } from "../stores/ui";
import { ipc, toAppError } from "./ipc";
import { openRepo } from "./router";

export function notify(tone: ToastTone, title: string, message?: string): void {
  useUi.getState().addToast({ tone, title, message, sticky: tone === "danger" });
}

export function notifyError(error: unknown, title = "Something went wrong"): void {
  const appError = toAppError(error);
  notify("danger", title, appError.message);
}

export async function pickAndAddRepo(): Promise<void> {
  try {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Add a Git repository",
    });
    if (typeof selected !== "string") return;
    const summary = await ipc.addRepo(selected);
    useRepos.getState().upsert(summary);
    useRepos.getState().select(summary.id);
    notify("success", `${summary.name} added`, "GitPulse is now watching this repository.");
    openRepo(summary.id);
  } catch (error) {
    notifyError(error, "Could not add repository");
  }
}

export async function pickAndScan(): Promise<void> {
  try {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Scan a folder for Git repositories",
    });
    if (typeof selected !== "string") return;
    const handle = await ipc.scanFolder(selected, 3);
    useUi.getState().setScanProgress({
      scanId: handle.scanId,
      scanned: 0,
      found: 0,
      currentPath: selected,
    });
  } catch (error) {
    notifyError(error, "Could not scan this folder");
  }
}

export async function addScannedPaths(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  try {
    const result = await ipc.addRepos(paths);
    let added = 0;
    let firstError: unknown = null;
    for (const item of result.results) {
      if (item.ok && item.repo) {
        useRepos.getState().upsert(item.repo);
        added += 1;
      } else if (item.error && !firstError) {
        firstError = item.error;
      }
    }
    if (added > 0) {
      notify(
        "success",
        `Added ${added} repositor${added === 1 ? "y" : "ies"}`,
        firstError ? "Some folders could not be added." : undefined,
      );
    }
    if (firstError) {
      notifyError(firstError, "Some repositories were not added");
    }
    useUi.getState().clearScan();
  } catch (error) {
    notifyError(error, "Could not add scanned repositories");
  }
}

export async function refreshAllAction(): Promise<void> {
  try {
    await ipc.refreshAll();
    notify("info", "Refreshing all repositories");
  } catch (error) {
    notifyError(error, "Could not refresh repositories");
  }
}

export async function openMainRepo(id: string): Promise<void> {
  try {
    window.localStorage.setItem("gitpulse:select", id);
    await ipc.showMainWindow();
  } catch (error) {
    notifyError(error, "Could not open the GitPulse window");
  }
}

export async function openMainRoute(path: string): Promise<void> {
  try {
    window.localStorage.setItem("gitpulse:navigate", path);
    await ipc.showMainWindow();
  } catch (error) {
    notifyError(error, "Could not open the GitPulse window");
  }
}

export async function exportDiagnosticsAction(): Promise<void> {
  try {
    const selected = await save({
      title: "Save GitPulse diagnostics",
      defaultPath: "gitpulse-diagnostics.json",
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (typeof selected !== "string") return;
    const result = await ipc.exportDiagnostics(selected);
    notify("success", "Diagnostics saved", result.path);
  } catch (error) {
    notifyError(error, "Could not save diagnostics");
  }
}
