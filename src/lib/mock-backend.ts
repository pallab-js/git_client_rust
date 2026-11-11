import type { UnlistenFn } from "@tauri-apps/api/event";

import type {
  AddReposResult,
  BranchEntry,
  CommitPage,
  FileChange,
  FileDiff,
  RepoSummary,
  ScanCompleted,
  ScanHandle,
  Settings,
  SettingsPatch,
} from "./bindings.generated";

/**
 * A tiny in-memory backend used when the UI runs outside Tauri.
 *
 * The real application always talks to the Rust backend. This fallback only
 * activates when `window.__TAURI_INTERNALS__` is missing (a browser preview or
 * the Playwright test runner) so the UI stays interactive instead of showing
 * "Settings unavailable." and repeating IPC errors in a toast loop.
 */

const REPOS_KEY = "gitpulse:mock:repos";
const SETTINGS_KEY = "gitpulse:mock:settings";

const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  startMinimized: false,
  launchAtLogin: false,
  showDockIcon: "whenWindowOpen",
  keepPopoverWarm: true,
  trayBadgeBasis: "attention",
  reconcileIntervalSec: 30,
  idlePollIntervalSec: 120,
  watchMode: "auto",
  linuxWatchDirCap: 2000,
  notifications: {
    enabled: false,
    conflicts: true,
    behindThreshold: 5,
    dirtyThreshold: 100,
    rateLimitMinutes: 30,
  },
  retentionDays: 30,
  snapshotCapPerRepo: 500,
  ignoredPatterns: ["node_modules", "target", "dist", ".next", ".venv", "vendor"],
  editor: null,
};

type MockEvent = { event: string; id: number; payload: unknown };
type MockHandler = (event: MockEvent) => void;

const listeners = new Map<string, Set<MockHandler>>();
let eventCounter = 0;

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be unavailable in private browsing; the mock still works
    // for the lifetime of the page.
  }
}

function loadRepos(): RepoSummary[] {
  return readJson<RepoSummary[]>(REPOS_KEY, []);
}

function saveRepos(repos: RepoSummary[]): void {
  writeJson(REPOS_KEY, repos);
}

function loadSettings(): Settings {
  return { ...DEFAULT_SETTINGS, ...readJson<Partial<Settings>>(SETTINGS_KEY, {}) };
}

function saveSettings(settings: Settings): void {
  writeJson(SETTINGS_KEY, settings);
}

function hash(value: string): string {
  let result = 0;
  for (let index = 0; index < value.length; index += 1) {
    result = (result * 31 + value.charCodeAt(index)) | 0;
  }
  return Math.abs(result).toString(36);
}

function summarize(path: string): RepoSummary {
  const trimmed = path.replace(/[\\/]+$/u, "");
  const name = trimmed.split(/[\\/]/u).filter(Boolean).pop() ?? "repository";
  return {
    id: `mock-${hash(trimmed)}`,
    name,
    path: trimmed,
    pinned: false,
    primaryStatus: "clean",
    flags: { dirty: false, conflicted: false, detached: false, unborn: false },
    branch: "main",
    upstream: "origin/main",
    ahead: 0,
    behind: 0,
    counts: { staged: 0, modified: 0, untracked: 0, conflicted: 0, stashed: 0 },
    lastCommit: null,
    lastFetchAt: null,
    watcher: "active",
    revision: 0,
    updatedAt: new Date().toISOString(),
    error: null,
  };
}

export function emitMock<T>(eventName: string, payload: T): void {
  const handlers = listeners.get(eventName);
  if (!handlers) return;
  eventCounter += 1;
  const event: MockEvent = { event: eventName, id: eventCounter, payload };
  for (const handler of handlers) handler(event);
}

export function mockListen<T>(
  eventName: string,
  handler: (event: { event: string; id: number; payload: T }) => void,
): UnlistenFn {
  const wrapped: MockHandler = (event) =>
    handler(event as { event: string; id: number; payload: T });
  const set = listeners.get(eventName) ?? new Set<MockHandler>();
  set.add(wrapped);
  listeners.set(eventName, set);
  return () => {
    const current = listeners.get(eventName);
    if (!current) return;
    current.delete(wrapped);
    if (current.size === 0) listeners.delete(eventName);
  };
}

export async function mockInvoke<T>(
  command: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const result = await run(command, args);
  return result as T;
}

async function run(command: string, args: Record<string, unknown>): Promise<unknown> {
  switch (command) {
    case "list_repos":
      return loadRepos();

    case "add_repo": {
      const path = String(args.path ?? "");
      return addRepo(path);
    }

    case "add_repos": {
      const paths = Array.isArray(args.paths) ? (args.paths as string[]) : [];
      const results = paths.map((path) => {
        try {
          const repo = addRepo(path);
          return { path, ok: true, repo, error: null };
        } catch (error) {
          return {
            path,
            ok: false,
            repo: null,
            error: {
              code: "UNKNOWN" as const,
              message: error instanceof Error ? error.message : "Could not add repository.",
              details: null,
              retryable: false,
            },
          };
        }
      });
      const payload: AddReposResult = { results };
      return payload;
    }

    case "remove_repo": {
      const id = String(args.id ?? "");
      saveRepos(loadRepos().filter((repo) => repo.id !== id));
      emitMock("repo:removed", { id });
      return null;
    }

    case "locate_repo": {
      const id = String(args.id ?? "");
      const newPath = String(args.newPath ?? "");
      return updateRepo(id, (repo) => ({
        ...repo,
        path: newPath,
        name: summarize(newPath).name,
        primaryStatus: "clean",
        updatedAt: new Date().toISOString(),
        error: null,
      }));
    }

    case "set_repo_pinned": {
      const id = String(args.id ?? "");
      const pinned = Boolean(args.pinned);
      return updateRepo(id, (repo) => ({ ...repo, pinned }));
    }

    case "reorder_repos": {
      const ids = Array.isArray(args.ids) ? (args.ids as string[]) : [];
      const repos = loadRepos();
      const ordered = ids
        .map((id) => repos.find((repo) => repo.id === id))
        .filter((repo): repo is RepoSummary => Boolean(repo));
      const rest = repos.filter((repo) => !ids.includes(repo.id));
      saveRepos([...ordered, ...rest]);
      return null;
    }

    case "set_repo_watch_mode": {
      const id = String(args.id ?? "");
      const mode = args.mode === "polling" ? "polling" : "active";
      return updateRepo(id, (repo) => ({ ...repo, watcher: mode }));
    }

    case "refresh_repo": {
      const id = String(args.id ?? "");
      const repo = loadRepos().find((item) => item.id === id);
      if (!repo) throw new Error("Unknown repository.");
      return repo;
    }

    case "refresh_all": {
      for (const repo of loadRepos()) {
        emitMock("repo:updated", { ...repo, revision: repo.revision + 1 });
      }
      return null;
    }

    case "scan_folder": {
      const root = String(args.root ?? "");
      const scanId = `mock-scan-${hash(root + Date.now())}`;
      if (typeof window !== "undefined") {
        window.setTimeout(() => {
          const completed: ScanCompleted = { scanId, candidates: [], truncated: false };
          emitMock("scan:completed", completed);
        }, 250);
      }
      const handle: ScanHandle = { scanId };
      return handle;
    }

    case "cancel_scan":
      return null;

    case "get_repo_changes":
      return [] as FileChange[];

    case "get_repo_commits":
      return { items: [], nextCursor: null } as CommitPage;

    case "get_repo_branches":
      return [] as BranchEntry[];

    case "get_file_diff":
      return {
        path: String(args.path ?? ""),
        staged: Boolean(args.staged),
        patch: "",
        binary: false,
        truncated: false,
        languageHint: null,
      } as FileDiff;

    case "get_activity":
      return [];

    case "get_settings":
      return loadSettings();

    case "update_settings": {
      const patch = (args.patch ?? {}) as SettingsPatch;
      const next = applyPatch(loadSettings(), patch);
      saveSettings(next);
      return next;
    }

    case "open_in_editor":
    case "reveal_repo":
    case "show_main_window":
    case "toggle_popover":
      return null;

    case "take_pending_selection":
      return null;

    case "export_diagnostics":
      return { path: String(args.destPath ?? "gitpulse-diagnostics.json") };

    default:
      throw new Error(`The browser preview does not implement "${command}".`);
  }
}

function addRepo(path: string): RepoSummary {
  const repo = summarize(path);
  const repos = loadRepos();
  const existing = repos.find((item) => item.id === repo.id);
  if (existing) return existing;
  const next = [...repos, repo];
  saveRepos(next);
  emitMock("repo:updated", repo);
  return repo;
}

function updateRepo(id: string, update: (repo: RepoSummary) => RepoSummary): RepoSummary {
  const repos = loadRepos();
  const index = repos.findIndex((repo) => repo.id === id);
  if (index === -1) throw new Error("Unknown repository.");
  const next = update(repos[index]);
  const list = repos.slice();
  list[index] = next;
  saveRepos(list);
  emitMock("repo:updated", next);
  return next;
}

function applyPatch(settings: Settings, patch: SettingsPatch): Settings {
  const next: Settings = { ...settings };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null || value === undefined) continue;
    (next as unknown as Record<string, unknown>)[key] = value;
  }
  return next;
}
