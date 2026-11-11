import { listen, type UnlistenFn } from "@tauri-apps/api/event";

import type {
  AppError,
  RepoSummary,
  ScanCompleted,
  ScanProgress,
  TrayStats,
} from "./bindings.generated";
import { mockListen } from "./mock-backend";
import { isTauriRuntime } from "./tauri-env";

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

  // Register listeners independently so one failing channel (for example a
  // temporary IPC hiccup) does not tear down every other subscription.
  async function add<T>(
    name: string,
    handler: (event: { event: string; id: number; payload: T }) => void,
  ): Promise<void> {
    try {
      const stop = isTauriRuntime() ? await listen<T>(name, handler) : mockListen<T>(name, handler);
      unlisten.push(stop);
    } catch (error) {
      console.warn(`GitPulse could not listen for "${name}"`, error);
    }
  }

  if (handlers.onRepoUpdated) {
    const handler = handlers.onRepoUpdated;
    await add<RepoSummary>("repo:updated", (event) => handler(event.payload));
  }
  if (handlers.onRepoRemoved) {
    const handler = handlers.onRepoRemoved;
    await add<{ id: string }>("repo:removed", (event) => handler(event.payload.id));
  }
  if (handlers.onRepoSelect) {
    const handler = handlers.onRepoSelect;
    await add<{ id: string }>("repo:select", (event) => handler(event.payload.id));
  }
  if (handlers.onScanProgress) {
    const handler = handlers.onScanProgress;
    await add<ScanProgress>("scan:progress", (event) => handler(event.payload));
  }
  if (handlers.onScanCompleted) {
    const handler = handlers.onScanCompleted;
    await add<ScanCompleted>("scan:completed", (event) => handler(event.payload));
  }
  if (handlers.onAppError) {
    const handler = handlers.onAppError;
    await add<AppError>("app:error", (event) => handler(event.payload));
  }
  if (handlers.onTrayStats) {
    const handler = handlers.onTrayStats;
    await add<TrayStats>("tray:stats", (event) => handler(event.payload));
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
