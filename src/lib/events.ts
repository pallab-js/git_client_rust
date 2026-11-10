import { listen, type UnlistenFn } from "@tauri-apps/api/event";

import type {
  AppError,
  RepoSummary,
  ScanCompleted,
  ScanProgress,
  TrayStats,
} from "./bindings.generated";

export interface AppEventHandlers {
  onRepoUpdated?: (summary: RepoSummary) => void;
  onRepoRemoved?: (id: string) => void;
  onRepoSelect?: (id: string) => void;
  onScanProgress?: (progress: ScanProgress) => void;
  onScanCompleted?: (completed: ScanCompleted) => void;
  onAppError?: (error: AppError) => void;
  onTrayStats?: (stats: TrayStats) => void;
}

export async function subscribeAppEvents(handlers: AppEventHandlers): Promise<UnlistenFn[]> {
  const unlisten: UnlistenFn[] = [];

  if (handlers.onRepoUpdated) {
    unlisten.push(
      await listen<RepoSummary>("repo:updated", (event) => handlers.onRepoUpdated?.(event.payload)),
    );
  }
  if (handlers.onRepoRemoved) {
    unlisten.push(
      await listen<{ id: string }>("repo:removed", (event) =>
        handlers.onRepoRemoved?.(event.payload.id),
      ),
    );
  }
  if (handlers.onRepoSelect) {
    unlisten.push(
      await listen<{ id: string }>("repo:select", (event) =>
        handlers.onRepoSelect?.(event.payload.id),
      ),
    );
  }
  if (handlers.onScanProgress) {
    unlisten.push(
      await listen<ScanProgress>("scan:progress", (event) =>
        handlers.onScanProgress?.(event.payload),
      ),
    );
  }
  if (handlers.onScanCompleted) {
    unlisten.push(
      await listen<ScanCompleted>("scan:completed", (event) =>
        handlers.onScanCompleted?.(event.payload),
      ),
    );
  }
  if (handlers.onAppError) {
    unlisten.push(
      await listen<AppError>("app:error", (event) => handlers.onAppError?.(event.payload)),
    );
  }
  if (handlers.onTrayStats) {
    unlisten.push(
      await listen<TrayStats>("tray:stats", (event) => handlers.onTrayStats?.(event.payload)),
    );
  }

  return unlisten;
}

export function unsubscribeAll(unlisten: UnlistenFn[]): void {
  for (const stop of unlisten) {
    try {
      stop();
    } catch {
      // Listener already removed.
    }
  }
}
