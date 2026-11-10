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

export type RefreshMode = "quick" | "full";

export const ipc = {
  listRepos: () => invoke<RepoSummary[]>("list_repos"),
  addRepo: (path: string) => invoke<RepoSummary>("add_repo", { path }),
  scanFolder: (root: string, maxDepth?: number) =>
    invoke<ScanHandle>("scan_folder", { root, maxDepth }),
  cancelScan: (scanId: string) => invoke<void>("cancel_scan", { scanId }),
  addRepos: (paths: string[]) => invoke<AddReposResult>("add_repos", { paths }),
  removeRepo: (id: string) => invoke<void>("remove_repo", { id }),
  locateRepo: (id: string, newPath: string) =>
    invoke<RepoSummary>("locate_repo", { id, newPath }),
  setRepoPinned: (id: string, pinned: boolean) =>
    invoke<void>("set_repo_pinned", { id, pinned }),
  reorderRepos: (ids: string[]) => invoke<void>("reorder_repos", { ids }),
  setRepoWatchMode: (id: string, mode: WatchMode) =>
    invoke<RepoSummary>("set_repo_watch_mode", { id, mode }),
  refreshRepo: (id: string, mode: RefreshMode = "quick") =>
    invoke<RepoSummary>("refresh_repo", { id, mode }),
  refreshAll: () => invoke<void>("refresh_all"),
  getRepoChanges: (id: string) => invoke<FileChange[]>("get_repo_changes", { id }),
  getRepoCommits: (id: string, cursor: string | null, limit = 20) =>
    invoke<CommitPage>("get_repo_commits", { id, cursor, limit }),
  getRepoBranches: (id: string) => invoke<BranchEntry[]>("get_repo_branches", { id }),
  getFileDiff: (id: string, path: string, staged: boolean) =>
    invoke<FileDiff>("get_file_diff", { id, path, staged }),
  getActivity: (id: string | null, limit = 100) =>
    invoke<ActivityEntry[]>("get_activity", { id, limit }),
  getSettings: () => invoke<Settings>("get_settings"),
  updateSettings: (patch: SettingsPatch) =>
    invoke<Settings>("update_settings", { patch }),
  openInEditor: (id: string) => invoke<void>("open_in_editor", { id }),
  revealRepo: (id: string) => invoke<void>("reveal_repo", { id }),
  showMainWindow: () => invoke<void>("show_main_window"),
  togglePopover: () => invoke<void>("toggle_popover"),
  takePendingSelection: () => invoke<string | null>("take_pending_selection"),
  exportDiagnostics: (destPath: string) =>
    invoke<ExportResult>("export_diagnostics", { destPath }),
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
