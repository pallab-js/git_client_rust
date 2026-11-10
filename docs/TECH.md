# GitPulse - Technical Reference Document

**Version:** 0.1.0
**Date:** 2026-11-09

---

## 1. Stack & Pinned Versions

| Layer | Choice | Version |
|-------|--------|---------|
| Shell | Tauri | 2.12.5 |
| Rust | stable (pinned in `rust-toolchain.toml`) | 1.77+ |
| Git | `git2` | 0.21.0 (`default-features = false`) |
| FS Events | `notify` | 8.2.2 |
| Ignore | `ignore` | 0.4.34 |
| DB | `rusqlite` | 0.41.1 (`bundled`) |
| Async | `tokio` | 1.x (full) |
| Serde | `serde`, `serde_json` | 1.x |
| Misc | `thiserror`, `chrono`, `tracing`, `uuid` (v7), `ts-rs` | latest compatible |
| Frontend | React | 19.3.1 |
| | TypeScript | 6.0.3 |
| | Vite | 8.3.6 |
| | Tailwind CSS | 4.3.5 (`@tailwindcss/vite`) |
| | State | Zustand 5.1.0 |
| | Icons | lucide-react 1.70.0 |
| Tests | Vitest | 5.1.0 |
| | Testing Library | 16.3.3 |

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    React UI (WebView)                        │
│  Dashboard · Repo Detail · Settings · Popover (mac/Win)      │
└─────────────────────▲───────────────────────────────────────┘
                      │ typed invoke() + event subscription
┌─────────────────────▼───────────────────────────────────────┐
│                     Tauri Host (Rust)                        │
│  commands/ · Arc<AppState> · error mapping · launcher        │
│  git engine (git2) · watch mgr (notify) · tray+windows       │
│  SQLite (repos/cache/history) · scheduler+debounce · config  │
└─────────────────────────────────────────────────────────────┘
```

**Dependency Rule:** `commands` → `git` / `watch` / `store`. `git` and `store` **never** import Tauri types. `git::*` functions are pure, read-only functions of path + options returning typed errors.

---

## 3. Processes & Threading

| Component | Rule |
|-----------|------|
| Main thread | Tauri host, tray events, window commands only. Never blocks on git or SQLite |
| Watch manager | Owns per-repo watchers; isolates failures; sends dirty hints to scheduler |
| Debounce | Per-repo last-event time, dirty flag, hard-flush deadline. Deterministic, mock-clock-testable |
| Scheduler | Bounded channel + semaphore (max 4 concurrent git jobs). **At most one job in flight per repo**; trailing events set `pending` → exactly one follow-up |
| Git jobs | `spawn_blocking`; open repo, compute, drop. **Never share `git2::Repository` across threads** |
| DB | Single `Mutex<Connection>` used from `spawn_blocking` (no dedicated writer task) |
| Summary cache | `RwLock<HashMap<RepoId, RepoSummary>>` in `AppState` |
| Tray updater | Recompute aggregate from cache; throttle ≤ 10 Hz |

Commands validate input, enqueue work, and return fast. Watcher events never call git directly. All errors cross IPC as `AppError`. Catch panics at the command boundary where feasible.

---

## 4. Watcher Strategy

1. **Always watch git metadata** (cheap, high signal): `HEAD`, `index`, `packed-refs`, `refs/` (recursive), `MERGE_HEAD`, `rebase-*`, plus `commondir` equivalents for linked worktrees. **Ignore** `objects/`, `logs/`, `lfs/`, `modules/`.
2. **Working tree by platform:**
   - **macOS/Windows:** one recursive watcher on the workdir; filter events after the fact.
   - **Linux:** build the watch set with an **ignore-aware walk** (`ignore` crate: `.gitignore`, global ignores, default heavy dirs, user patterns) and register **non-recursive** watches per directory. Cap at `linuxWatchDirCap` (default 2000 dirs/repo) plus a global cap. On cap exceeded or `ENOSPC`, switch that repo to **polling** and show a "polling" badge. Add newly created directories incrementally.
3. **Default ignores:** `node_modules`, `target`, `dist`, `build`, `.next`, `.venv`, `vendor`, `.cache`, plus user `ignoredPatterns`.
4. **Debounce per repo:** 300 ms quiet period, 2 s hard flush.
5. **Coalesce:** single in flight + pending flag.
6. **Job tiers:** workdir events → *quick* (status + HEAD). Metadata events → *medium* (+ branches, upstream, ahead/behind). Detail view open → *full* on demand.
7. **Reconciliation poll:** 30 s while a window is focused, 120 s idle; also on window focus and popover open (for repos stale > 10 s).
8. **Circuit breaker:** repeated event storms (rate over a rolling window) or registration failure → polling mode for that repo, log once, retry watch mode with backoff. Never spam errors.
9. **Emit** `repo:updated` with bumped `revision`, then recompute tray stats.

---

## 5. Git Read Strategy

- `Repository::open` on the workdir; reject bare repos; map libgit2 failures to error codes (`UNSAFE_OWNERSHIP`, `UNSUPPORTED_REPO_FORMAT`, etc.).
- **Status options:** `include_untracked(true)`, `recurse_untracked_dirs(false)`, `renames_head_to_index(true)`, `include_ignored(false)`, `update_index(false)`. Evaluate `exclude_submodules(true)` as default for speed.
- Derive staged / unstaged / conflicted from `StatusEntry` flags. **Untracked count is entries, not files** (a new directory counts once); label accurately in UI; the detail view expands on demand.
- Stash count via `stash_foreach`. Ahead/behind via `graph_ahead_behind` against the upstream ref. Last fetch from `.git/FETCH_HEAD` mtime.
- Commits: last 20 via revwalk, paginated, lazily loaded. Branches: local, sorted by committer date; compute divergence lazily for the first 50.
- **Diff:** unstaged `diff_index_to_workdir`; staged `diff_tree_to_index`; untracked: read ≤ 256 KB, binary if NUL byte, else render as all-added lines. Cap patch at **5,000 lines / 1 MB** → `truncated: true`. Compute line stats only when changed files ≤ 100.
- Submodules: show the submodule path as a changed entry; **do not recurse**.
- **Large-repo policy:** if large-repo status exceeds an acceptable bound (e.g., > 500 ms), mitigate in this order: larger poll interval for that repo → `exclude_submodules` → documented limit. Shelling out to system `git` is a last-resort fallback that requires an explicit ADR. It is **not** a v1 default.

---

## 6. Status Model & Attention Sorting

Store orthogonal facts: `conflicted`, `ahead`, `behind`, `dirty` (staged+modified+untracked > 0), `detached`, `unborn`, availability. UI shows every applicable badge. Derive **primaryStatus** by precedence:

```
conflicted (5) > diverged [ahead && behind] (4) > behind (3) > dirty (2) > ahead (1) > clean (0)
unavailable / error → listed after usable repos unless pinned
```

`detached` and `unborn` are informational flags and never outrank conflicted/dirty. **Sort order:** pinned first (manual `sort_order` within pinned) → primary-status priority → last commit time desc.

**Tray aggregate:** default basis "attention" = repos that are conflicted OR dirty OR behind (setting `trayBadgeBasis`). Icon variants: clean / attention / conflict. Show the count in the tooltip, the macOS title, and the Linux menu header.

---

## 7. IPC Contract

All commands return `Result<T, AppError>`; camelCase JSON.

| Command | Args | Returns |
|---------|------|---------|
| `list_repos` | n/a | `RepoSummary[]` |
| `add_repo` | `{ path }` | `RepoSummary` (dedupe → returns existing) |
| `scan_folder` | `{ root, maxDepth }` | `ScanHandle { scanId }` (progress via `scan:progress`) |
| `cancel_scan` | `{ scanId }` | `void` |
| `add_repos` | `{ paths: string[] }` | `AddReposResult` (per-path ok/error) |
| `remove_repo` | `{ id }` | `void` |
| `locate_repo` | `{ id, newPath }` | `RepoSummary` |
| `set_repo_pinned` | `{ id, pinned }` | `void` |
| `reorder_repos` | `{ ids: string[] }` | `void` |
| `set_repo_watch_mode` | `{ id, mode }` | `RepoSummary` |
| `refresh_repo` | `{ id, mode: "quick" \| "full" }` | `RepoSummary` |
| `refresh_all` | n/a | `void` |
| `get_repo_changes` | `{ id }` | `FileChange[]` |
| `get_repo_commits` | `{ id, cursor?, limit }` | `CommitPage` |
| `get_repo_branches` | `{ id }` | `BranchEntry[]` |
| `get_file_diff` | `{ id, path, staged }` | `FileDiff` |
| `get_activity` | `{ id?, limit }` | `ActivityEntry[]` (stretch) |
| `get_settings` / `update_settings` | `{ patch }` | `Settings` |
| `open_in_editor` | `{ id }` | `void` (via `launcher.rs`) |
| `reveal_repo` | `{ id }` | `void` |
| `show_main_window` / `toggle_popover` | n/a | `void` |
| `export_diagnostics` | `{ destPath }` | `{ path }` (stretch) |

**Events:** `repo:updated` (`RepoSummary` incl. `revision`), `repo:removed {id}`, `scan:progress {scanId, scanned, found, currentPath}`, `app:error (AppError)`, `tray:stats {repos, dirty, conflicts, behind}`.

**`AppError`:** `{ code, message, details?, retryable }` with `code` ∈ `REPO_NOT_FOUND | NOT_A_REPO | BARE_REPO | PERMISSION_DENIED | INVALID_PATH | UNSAFE_OWNERSHIP | UNSUPPORTED_REPO_FORMAT | WATCHER_FAILED | SCAN_CANCELLED | DB_ERROR | CONFIG_ERROR | EDITOR_NOT_FOUND | UNKNOWN`. `message` must be actionable (what happened + what to do); codes appear only under "Details" in UI.

---

## 8. Data Model

### 8.1 `config.json` (settings only; atomic temp-file + rename; `schemaVersion` gated)

```json
{
  "schemaVersion": 1,
  "settings": {
    "theme": "system",
    "startMinimized": true,
    "launchAtLogin": false,
    "showDockIcon": "whenWindowOpen",
    "keepPopoverWarm": true,
    "trayBadgeBasis": "attention",
    "reconcileIntervalSec": 30,
    "idlePollIntervalSec": 120,
    "watchMode": "auto",
    "linuxWatchDirCap": 2000,
    "notifications": {
      "enabled": false,
      "conflicts": true,
      "behindThreshold": 5,
      "dirtyThreshold": 100,
      "rateLimitMinutes": 30
    },
    "retentionDays": 30,
    "snapshotCapPerRepo": 500,
    "ignoredPatterns": ["node_modules", "target", "dist", ".next", ".venv", "vendor"],
    "editor": null
  }
}
```

### 8.2 SQLite (`gitpulse.db` in the app-data dir)

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;

CREATE TABLE IF NOT EXISTS repos (
  id             TEXT PRIMARY KEY,
  path           TEXT NOT NULL UNIQUE,
  name           TEXT NOT NULL,
  pinned         INTEGER NOT NULL DEFAULT 0,
  sort_order     INTEGER NOT NULL DEFAULT 0,
  watch_mode     TEXT NOT NULL DEFAULT 'auto',
  added_at       INTEGER NOT NULL,
  last_seen_at   INTEGER,
  cached_summary TEXT
);

CREATE TABLE IF NOT EXISTS snapshots (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  repo_id       TEXT NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
  captured_at   INTEGER NOT NULL,
  branch        TEXT, head_sha TEXT,
  detached      INTEGER NOT NULL DEFAULT 0,
  upstream      TEXT,
  ahead         INTEGER NOT NULL DEFAULT 0,
  behind        INTEGER NOT NULL DEFAULT 0,
  staged        INTEGER NOT NULL DEFAULT 0,
  modified      INTEGER NOT NULL DEFAULT 0,
  untracked     INTEGER NOT NULL DEFAULT 0,
  conflicted    INTEGER NOT NULL DEFAULT 0,
  stashed       INTEGER NOT NULL DEFAULT 0,
  fingerprint   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS activity (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  repo_id     TEXT NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,
  payload     TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_snapshots_repo_time ON snapshots(repo_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_repo_time  ON activity(repo_id, created_at DESC);
```

Migrations: `PRAGMA user_version`, one transaction each, each tested from an empty DB. **There is no `snapshot_changes` table** (file lists are always read live).

### 8.3 Write Policy & `revision`

- **Fingerprint** = hash(branch, head_sha, detached, upstream, ahead, behind, counts).
- Write a snapshot only if the fingerprint changed **or** ≥ 15 min since the last snapshot (heartbeat). Update `cached_summary` at the same cadence.
- **`revision`** (per repo, in-memory, monotonically increasing): bump on **every** completed job that observed a workdir or metadata event, even if the fingerprint is unchanged. `repo:updated` carries it. The detail view refetches changes and the open diff when `revision` changes.
- **Activity entries only for transitions:** new conflict, conflict resolved, branch changed, clean↔dirty, divergence crossing a threshold. These also drive notification dedupe and rate limiting.
- **Retention:** at startup and daily, prune snapshots older than `retentionDays` or beyond `snapshotCapPerRepo`; activity older than 90 days; then `PRAGMA optimize`.

---

## 9. Security

- Capabilities: core window, dialog, notification, opener, autostart. **No shell, no fs.**
- **CSP:** `default-src 'self'; img-src 'self' asset: data:; script-src 'self'`. Avoid `style-src 'unsafe-inline'`. Verify it is not required; allow only if proven necessary and document in an ADR.
- Untrusted content rules: escape control and bidi characters in displayed paths. `dangerouslySetInnerHTML` banned by ESLint.
- Canonicalize user paths. Scan never follows symlinks. Reject bare repos. Never execute repository content or hooks.
- SQL: parameterized only.
- Diagnostics export is user-initiated and shows what it includes before saving.
- `git2` built with `default-features = false` (no OpenSSL, no network).

---

## 10. Capability Matrix

| Capability | macOS | Windows | Linux |
|------------|-------|---------|-------|
| Tray icon | Yes (template) | Yes | Via appindicator (GNOME needs AppIndicator extension) |
| Tray click events + icon position | Yes | Yes | **No** (menu only) |
| Left-click popover | **Yes** | **Yes** | **No** → tray menu + "Open GitPulse" |
| Aggregate indicator | Title count + icon variant | Icon variants + tooltip | Icon variants + menu header line |
| Window positioning | Yes | Yes | Unreliable (Wayland), so don't depend on it |
| Watcher backend | FSEvents (recursive, cheap) | ReadDirectoryChangesW (recursive) | inotify (per-directory cost) |
| Launch at login | Yes | Yes | Yes (XDG autostart; test per DE) |

Linux tray menu: header line ("3 dirty · 1 conflict"), top ~8 repos by urgency (click opens that repo in the main window), Refresh all, Open GitPulse, Quit.

---

## 11. Performance Budgets

| Metric | Target |
|--------|--------|
| Cold start to tray (no webview) | < 500 ms |
| Popover render (cached) | < 150 ms |
| Popover render (cold) | < 600 ms |
| Idle CPU (25 repos, 10 min avg) | < 0.5% |
| Quick status median (< 10k files) | < 40 ms/repo |
| 25 repos quick refresh | < 1 s |
| 100 repos quick refresh | < 3 s |
| Binary size (per platform) | < 20 MB |
| Rust core RSS (25 repos) | < 40 MB |
| Tray-only total RSS | < 60 MB |
| Popover warm, no main window | macOS < 200 MB, Windows < 250 MB |
| DB growth (30 days, 25 repos) | < 5 MB |

---

## 12. Known Limitation

Ahead/behind is computed against *local* remote-tracking refs, so "behind" changes only after a fetch happens elsewhere. All copy must say "as of last fetch" and show fetch age. Opt-in fetch is the top post-0.1 roadmap item.

---

*This TECH.md is derived from the implementation specification in `GITPULSE_IMPLEMENTATION_SPEC.md`.*