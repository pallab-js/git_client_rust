import { invoke } from "@tauri-apps/api/core";

import type {
  ActivityEntry,
  AddReposResult,
  AppError,
  BranchEntry,
  CommitPage,
  ExportResult,
  FileChange,
  FileDiff,
  RepoSummary,
  ScanHandle,
  Settings,
  SettingsPatch,
  WatchMode,
} from "./bindings.generated";
import { mockInvoke } from "./mock-backend";
import { isTauriRuntime } from "./tauri-env";

export type RefreshMode = "quick" | "full";

function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauriRuntime()) {
    return mockInvoke<T>(command, args);
  }
  return invoke<T>(command, args);
}

export const ipc = {
  listRepos: () => call<RepoSummary[]>("list_repos"),
  addRepo: (path: string) => call<RepoSummary>("add_repo", { path }),
  scanFolder: (root: string, maxDepth?: number) =>
    call<ScanHandle>("scan_folder", { root, maxDepth }),
  cancelScan: (scanId: string) => call<void>("cancel_scan", { scanId }),
  addRepos: (paths: string[]) => call<AddReposResult>("add_repos", { paths }),
  removeRepo: (id: string) => call<void>("remove_repo", { id }),
  locateRepo: (id: string, newPath: string) => call<RepoSummary>("locate_repo", { id, newPath }),
  setRepoPinned: (id: string, pinned: boolean) => call<void>("set_repo_pinned", { id, pinned }),
  reorderRepos: (ids: string[]) => call<void>("reorder_repos", { ids }),
  setRepoWatchMode: (id: string, mode: WatchMode) =>
    call<RepoSummary>("set_repo_watch_mode", { id, mode }),
  refreshRepo: (id: string, mode: RefreshMode = "quick") =>
    call<RepoSummary>("refresh_repo", { id, mode }),
  refreshAll: () => call<void>("refresh_all"),
  getRepoChanges: (id: string) => call<FileChange[]>("get_repo_changes", { id }),
  getRepoCommits: (id: string, cursor: string | null, limit = 20) =>
    call<CommitPage>("get_repo_commits", { id, cursor, limit }),
  getRepoBranches: (id: string) => call<BranchEntry[]>("get_repo_branches", { id }),
  getFileDiff: (id: string, path: string, staged: boolean) =>
    call<FileDiff>("get_file_diff", { id, path, staged }),
  getActivity: (id: string | null, limit = 100) =>
    call<ActivityEntry[]>("get_activity", { id, limit }),
  getSettings: () => call<Settings>("get_settings"),
  updateSettings: (patch: SettingsPatch) => call<Settings>("update_settings", { patch }),
  openInEditor: (id: string) => call<void>("open_in_editor", { id }),
  revealRepo: (id: string) => call<void>("reveal_repo", { id }),
  showMainWindow: () => call<void>("show_main_window"),
  togglePopover: () => call<void>("toggle_popover"),
  takePendingSelection: () => call<string | null>("take_pending_selection"),
  exportDiagnostics: (destPath: string) => call<ExportResult>("export_diagnostics", { destPath }),
};

export function isAppError(value: unknown): value is AppError {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.code === "string" && typeof candidate.message === "string";
}

export function toAppError(value: unknown, fallback = "Something went wrong."): AppError {
  if (isAppError(value)) return value;
  if (value instanceof Error) {
    return {
      code: "UNKNOWN",
      message: value.message || fallback,
      details: null,
      retryable: false,
    };
  }
  if (typeof value === "string" && value.trim()) {
    return { code: "UNKNOWN", message: value, details: null, retryable: false };
  }
  return { code: "UNKNOWN", message: fallback, details: null, retryable: false };
}

export function errorText(value: unknown): string {
  return toAppError(value).message;
}

export function describeError(value: unknown): {
  code: string;
  message: string;
  details: string | null;
  retryable: boolean;
} {
  const error = toAppError(value);
  return {
    code: error.code,
    message: error.message,
    details: error.details ?? null,
    retryable: error.retryable,
  };
}
