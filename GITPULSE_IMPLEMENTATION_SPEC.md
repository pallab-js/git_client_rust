# GitPulse: Implementation Specification (for AI coding agents)

**Document version:** 2.0 · **Date:** 2026-11-09 · **Status:** Approved scope, implementation not started
**Audience:** an autonomous or semi-autonomous AI coding agent. Humans may read it, but it is written to be executed.

---

## PART A: AGENT OPERATING PROTOCOL (read first, obey always)

### A.1 Mission
Build **GitPulse**: a cross-platform (macOS, Windows, Linux), local-first, **read-only** Git repository monitor with a system-tray presence and a compact dashboard window. Stack: **Tauri v2 · Rust (`git2`) · React + TypeScript**.

### A.2 Rules of engagement
1. **Work phase by phase** (Part K). Do not start phase N+1 until phase N's exit gate passes. Report gate results explicitly.
2. **Never guess versions.** At P0, resolve the latest *stable* version of every dependency from its registry (`cargo search`/`cargo add`, `pnpm view <pkg> version`), commit lockfiles, and record the resolved versions in `docs/TECH.md`. Pin Tauri to an explicit `2.x` minor; never accept a v3 pre-release. For TypeScript, use the newest major that `typescript-eslint`, Vite, and Vitest officially support.
3. **Never add network access, a shell plugin, or an fs plugin.** Never add write operations on user repositories (see A.3).
4. **No `unwrap()` / `expect()` / `panic!` / unchecked indexing** in command, watcher, scheduler, DB, or git paths. Tests may use them.
5. **Prefer the simplest design that meets this spec.** Do not add abstractions, crates, or features that are not listed. If you believe the spec is wrong, record the objection in `docs/adr/` and continue with the spec unless the issue is a blocker.
6. **Ask or stop only for blockers** (Part A.5). For everything else apply the defaults in Part M and note the choice in the phase report.
7. **Every phase ends with:** all checks green (A.4), a short phase report (what was done, deviations, measurements, open issues), and a commit on a branch (conventional commit messages).
8. **Do not fake results.** If a spike, benchmark, or platform test cannot be run in your environment, say so and mark the item "unverified", rather than inventing numbers.
9. **Security and privacy are non-negotiable:** zero telemetry, zero network, no execution of repository content or hooks.

### A.3 Hard constraints (violating any is a failed build)
- **Read-only Git:** no staging, unstaging, discard, commit, fetch, pull, push, merge, rebase, checkout, or index writes. Status must use `update_index(false)`.
- **No network I/O** of any kind in v1. `git2` is built with `default-features = false`.
- **No shell interpretation.** The only process spawning allowed is `launcher.rs` (A/§F.9), which uses argv arrays, never strings passed to a shell.
- **Repo content is untrusted:** file paths, branch names, commit messages, and diffs render only as React text nodes. `dangerouslySetInnerHTML` is banned by ESLint.
- **Capabilities allowlist:** core window, dialog, notification, opener, autostart only.
- **Single source of truth rules** in §G.5 must be followed exactly.

### A.4 Required checks (run before declaring any phase done)
```
# Frontend
pnpm install --frozen-lockfile
pnpm exec tsc --noEmit
pnpm lint
pnpm test --run
pnpm build

# Rust (from src-tauri/)
cargo fmt --all -- --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test --all

# From P2 onward
pnpm gen:bindings && git diff --exit-code src/lib/bindings.generated.ts
```
From P0 onward, CI runs these on macOS, Windows, and Linux. A phase is not done if CI is red on any OS.

### A.5 Blockers (stop and ask the human)
- Product name conflict or bundle-ID namespace not decided (needed before the first public release, not before coding).
- A spike result contradicts a hard constraint or a capability-matrix row (§C).
- A required dependency cannot be built in CI on one of the three OSes.
- Anything that would require network access, a shell plugin, or write operations on repos.

---

## PART B: PRODUCT BRIEF

**Name:** GitPulse · **Tagline:** "Your repositories, at a glance."
**Problem:** Developers keep 5–30 local clones. Finding which have uncommitted work, are on which branch, or have diverged requires visiting each directory. GitPulse watches selected repositories and shows live branch and working-tree status from the tray or a compact dashboard.

**Personas:** polyrepo developer (8–20 clones), reviewer/tech lead (conflict and divergence visibility), OSS contributor (passive tray badge, low overhead).

### B.1 Locked decisions
| Decision | Choice |
|---|---|
| Git functionality | Read-only monitor (status, branches, divergence, log, diffs) |
| Platforms | macOS, Windows, Linux; **feature parity not promised** (Linux has no popover) |
| Repo discovery | Manual add + optional folder scan returning candidates for the user to select |
| Surfaces | Tray popover (macOS/Windows) + main window (all); Linux: tray menu + main window |
| Notifications | Opt-in, off by default |
| Persistence | `config.json` (settings only) + bundled SQLite (repos, cache, history) |
| Styling | Tailwind 4 + custom minimal components |
| Release | Unsigned (macOS ad-hoc signed only), no auto-updater |
| License | MIT |
| Language / telemetry | English only; none |
| Identifiers | Binary/crate `gitpulse`; bundle ID `io.github.<owner>.gitpulse` until an owned domain exists (decide **before** first release; changing it later breaks autostart and app-data paths). Version `0.1.0`, tag `v0.1.0`. |

### B.2 Non-goals (v1)
Staging/discard/commit; fetch/pull/push/merge/rebase/cherry-pick; credentials, SSH agents, GitHub API; cloud sync/accounts; auto-update; paid code signing; i18n; mobile/web builds; syntax-highlighted diffs.

**Known limitation to state in UI and docs:** ahead/behind is computed against *local* remote-tracking refs, so "behind" changes only after a fetch happens elsewhere. All copy must say "as of last fetch" and show fetch age. (Opt-in fetch is the top post-0.1 roadmap item. Do **not** build it now.)

### B.3 Functional requirements
| ID | Requirement | Pri |
|---|---|---|
| FR-01 | Add/remove repos; canonicalize and dedupe paths; reject non-git and bare repos with actionable errors | P0 |
| FR-02 | Scan a root folder: depth 1–5 (default 3), skip heavy dirs, never follow symlinks, cancellable, cap 500, stop descending at first `.git`; returns candidates for user selection | P0 |
| FR-03 | Show branch, detached HEAD, unborn branch, upstream, ahead/behind, last-fetch age | P0 |
| FR-04 | Show staged, modified, untracked, conflicted, stash counts plus changed paths | P0 |
| FR-05 | Live refresh: watchers + debounce + reconciliation poll + refresh on window focus | P0 |
| FR-06 | Tray icon with aggregate state, tooltip, context menu; left-click popover on macOS/Windows | P0 |
| FR-07 | Dashboard sorted by attention priority; pin, reorder, search | P0 |
| FR-08 | Repo detail: grouped changes, unified diff viewer, recent commits, local branches | P0 |
| FR-09 | Settings: theme, start minimized, launch at login, poll intervals, watch mode, ignore patterns, retention | P0 |
| FR-10 | Smart notifications, off by default, rate-limited per repo+reason | P1 |
| FR-11 | Moved/deleted/unreadable repos: Locate / Remove actions | P0 |
| FR-12 | Activity timeline UI + diagnostics export | P1 (stretch; first to cut) |
| FR-13 | First-run onboarding empty state with Add and Scan; main window always shown on first run regardless of "start minimized" | P0 |
| FR-14 | Keyboard **navigation** (focus order, Enter/Esc, arrow selection) P0; global shortcut set P1 | P0/P1 |

### B.4 Non-functional targets (validate in P0 spikes; freeze in `docs/TECH.md`)
| ID | Target |
|---|---|
| NFR-01 | Cold start to tray with **no webview created** < 500 ms. Popover with cached data < 150 ms (warm); cold lazily-created popover < 600 ms |
| NFR-02 | Idle CPU < 0.5% averaged over 10 min with 25 repos |
| NFR-03 | Quick status median < 40 ms/repo for repos < ~10k tracked files; 25 repos < 1 s; 100 repos < 3 s (Apple silicon). Large repos measured separately |
| NFR-04 | Installer < 20 MB per platform (verify in P0) |
| NFR-05 | Zero network I/O; no shell interpretation; capability-scoped IPC |
| NFR-06 | WCAG 2.1 AA contrast; keyboard-complete; reduced motion respected |
| NFR-07 | Crash-safe config and DB (atomic writes, WAL) |
| NFR-08 | Watcher failures degrade to polling without data loss or error spam |
| NFR-09 | Live edit reflected within 1 s (p95) on macOS/Windows; within poll interval for polling-mode repos |

Memory budgets (targets): Rust core RSS < 40 MB at 25 repos; tray-only (all webviews destroyed) < 60 MB total; popover warm, no main window: macOS < 200 MB, Windows < 250 MB (sum of WebView2 processes); main window open: measure and record. DB growth < 5 MB / 30 days at 25 repos.

---

## PART C: PLATFORM CAPABILITY MATRIX (authoritative)

| Capability | macOS | Windows | Linux |
|---|---|---|---|
| Tray icon | Yes (template icon) | Yes | Via appindicator (GNOME needs the AppIndicator extension) |
| Tray click events + icon position | Yes | Yes | **No** (menu only) |
| Left-click popover | **Yes** | **Yes** | **No** → tray menu + "Open GitPulse" |
| Aggregate indicator | Title count + icon variant | Icon variants + tooltip (no overlay badge exists on tray icons) | Icon variants + menu header line |
| Window positioning | Yes | Yes | Unreliable (Wayland), so don't depend on it |
| Watcher backend | FSEvents (recursive, cheap) | ReadDirectoryChangesW (recursive) | inotify (per-directory cost) |
| Launch at login | Yes | Yes | Yes (XDG autostart; test per DE) |

Linux tray menu: header line ("3 dirty · 1 conflict"), top ~8 repos by urgency (click opens that repo in the main window), Refresh all, Open GitPulse, Quit.

Spike S1 (P0) must confirm or correct this matrix. If it is corrected, update this matrix, record an ADR, and continue.

---

## PART D: REPOSITORY LAYOUT (create exactly this)

```text
gitpulse/
├─ .github/
│  ├─ workflows/{ci.yml, release.yml, release-dryrun.yml}
│  ├─ ISSUE_TEMPLATE/{bug.yml, feature.yml}
│  ├─ PULL_REQUEST_TEMPLATE.md
│  └─ dependabot.yml
├─ docs/{PRD.md, TECH.md, UX.md, PLAN.md, TESTING.md} + adr/NNNN-*.md
├─ src/
│  ├─ main.tsx, App.tsx
│  ├─ routes/{Dashboard,RepoDetail,Settings,Onboarding}.tsx
│  ├─ components/{ui,repo,changes,layout,tray}/
│  ├─ stores/{repos,settings,ui}.ts
│  ├─ lib/{ipc.ts, bindings.generated.ts, events.ts, format.ts, status.ts}
│  └─ styles/{tokens.css, app.css}
├─ src-tauri/
│  ├─ Cargo.toml, build.rs, tauri.conf.json
│  ├─ capabilities/default.json
│  ├─ icons/
│  └─ src/
│     ├─ main.rs, lib.rs, error.rs, state.rs, events.rs
│     ├─ tray.rs, windows.rs, notify.rs, launcher.rs
│     ├─ commands/{mod,repos,git,settings,window}.rs
│     ├─ git/{mod,open,status,branches,log,diff,scan}.rs
│     ├─ watch/{mod,debounce,manager,fswalk}.rs
│     └─ store/{mod,config,db,migrations,snapshots,activity}.rs
├─ tests/                    # Rust integration tests (temp repos)
├─ scripts/{make-fixtures, bench, check-version-sync}
├─ package.json, pnpm-lock.yaml, vite.config.ts, tsconfig.json
├─ README.md, LICENSE, CONTRIBUTING.md, CODE_OF_CONDUCT.md, SECURITY.md, CHANGELOG.md
└─ .gitignore, .editorconfig, rustfmt.toml, clippy.toml, rust-toolchain.toml, deny.toml
```

**Working directory:** do not create the project under an iCloud/OneDrive-synced folder (for example `~/Desktop`). Use a non-synced path such as `~/dev/gitpulse`.

---

## PART E: TOOLCHAIN POLICY

| Layer | Choice | Policy |
|---|---|---|
| Shell | Tauri v2 | Pin minor explicitly; no v3 |
| Plugins | single-instance, dialog, notification, opener, autostart | v2-compatible only; **no shell, no fs** |
| Git | `git2` (`default-features = false`) | Local only; no OpenSSL |
| FS events | `notify` + `ignore` crate | `ignore` for ignore-aware walks |
| DB | `rusqlite` (`bundled`) | WAL, FKs, migrations via `user_version` |
| Async | `tokio` (Tauri runtime) | Blocking work in `spawn_blocking` |
| Serde | `serde`, `serde_json` | camelCase at the IPC boundary |
| Misc | `thiserror`, `chrono` (serde), `tracing` + rolling file appender, `ulid` or `uuid` v7 | |
| Rust | current stable at P0, pinned in `rust-toolchain.toml` | |
| Node/pnpm | Node LTS (24+), pnpm 10+ | |
| Frontend | React, TypeScript, Vite + `@vitejs/plugin-react`, Tailwind 4 via `@tailwindcss/vite`, Zustand, `lucide-react` | see A.2 rule 2 |
| Type bindings | **Generated from Rust** (`ts-rs` or equivalent derive) → `src/lib/bindings.generated.ts` (checked in) | CI fails on regeneration diff |
| Tests | `cargo test` + `tempfile`; Vitest + Testing Library | |
| Supply chain | `cargo deny`, `cargo audit`, `pnpm audit`, Dependabot | |

**Local prerequisites:** `cmake` (or system libgit2 via pkg-config). Linux: `libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf build-essential curl wget file`. Windows: MSVC build tools + WebView2. macOS: Xcode Command Line Tools. Document these in README and CONTRIBUTING.

---

## PART F: ENGINEERING DESIGN

### F.1 Architecture and dependency rule
```text
React UI (WebView, lazily created)  ◄── typed invoke() + event subscription ──►  Tauri host (Rust)
  Dashboard · Repo detail · Settings · Popover (mac/Win)                         commands/ · Arc<AppState> · error mapping · launcher
                                                                                 git engine (git2) · watch mgr (notify) · tray+windows
                                                                                 SQLite (repos/cache/history) · scheduler+debounce · settings JSON
```
**Rule:** `commands` → `git` / `watch` / `store`. `git` and `store` **never** import Tauri types. `git::*` functions are pure, read-only functions of path + options returning typed errors.

### F.2 Threading and concurrency
| Component | Rule |
|---|---|
| Main thread | Tauri host, tray events, window commands only. Never blocks on git or SQLite |
| Watch manager | Owns per-repo watchers; isolates failures; sends dirty hints to the scheduler |
| Debounce | Per-repo last-event time, dirty flag, hard-flush deadline. Deterministic, mock-clock-testable |
| Scheduler | Bounded channel + semaphore (max 4 concurrent git jobs). **At most one job in flight per repo**; trailing events set `pending` → exactly one follow-up |
| Git jobs | `spawn_blocking`; open repo, compute, drop. **Never share `git2::Repository` across threads** |
| DB | Single `Mutex<Connection>` used from `spawn_blocking` (no dedicated writer task) |
| Summary cache | `RwLock<HashMap<RepoId, RepoSummary>>` in `AppState` |
| Tray updater | Recompute aggregate from cache; throttle ≤ 10 Hz |

Commands validate input, enqueue work, and return fast. Watcher events never call git directly. All errors cross IPC as `AppError`. Catch panics at the command boundary where feasible.

### F.3 Watcher strategy
1. **Always watch git metadata** (cheap, high signal): `HEAD`, `index`, `packed-refs`, `refs/` (recursive), `MERGE_HEAD`, `rebase-*`, plus the `commondir` equivalents for linked worktrees. **Ignore** `objects/`, `logs/`, `lfs/`, `modules/`. This catches commits, branch switches, staging, merges, fetches.
2. **Working tree by platform:**
   - **macOS/Windows:** one recursive watcher on the workdir; filter events after the fact.
   - **Linux:** build the watch set with an **ignore-aware walk** (`ignore` crate: `.gitignore`, global ignores, default heavy dirs, user patterns) and register **non-recursive** watches per directory. Cap at `linuxWatchDirCap` (default 2000 dirs/repo) plus a global cap. On cap exceeded or `ENOSPC`, switch that repo to **polling** and show a "polling" badge. Add newly created directories incrementally.
3. **Default ignores:** `node_modules`, `target`, `dist`, `build`, `.next`, `.venv`, `vendor`, `.cache`, plus user `ignoredPatterns`.
4. **Debounce per repo:** 300 ms quiet period, 2 s hard flush.
5. **Coalesce:** per F.2 (single in flight + pending flag).
6. **Job tiers:** workdir events → *quick* (status + HEAD). Metadata events → *medium* (+ branches, upstream, ahead/behind). Detail view open → *full* on demand.
7. **Reconciliation poll:** 30 s while a window is focused, 120 s idle; also on window focus and popover open (for repos stale > 10 s).
8. **Circuit breaker:** repeated event storms (rate over a rolling window) or registration failure → polling mode for that repo, log once, retry watch mode with backoff. Never spam errors.
9. **Emit** `repo:updated` with bumped `revision` (F.8/§G.3), then recompute tray stats.

### F.4 Git read strategy
- `Repository::open` on the workdir; reject bare repos; map libgit2 failures to the error codes in F.6 (including `UNSAFE_OWNERSHIP`, `UNSUPPORTED_REPO_FORMAT`).
- **Status options:** `include_untracked(true)`, `recurse_untracked_dirs(false)`, `renames_head_to_index(true)`, `include_ignored(false)`, `update_index(false)`. Evaluate `exclude_submodules(true)` as default for speed (decide via spike S3).
- Derive staged / unstaged / conflicted from `StatusEntry` flags. **Untracked count is entries, not files** (a new directory counts once); label accurately in UI; the detail view expands on demand.
- Stash count via `stash_foreach`. Ahead/behind via `graph_ahead_behind` against the upstream ref. Last fetch from `.git/FETCH_HEAD` mtime.
- Commits: last 20 via revwalk, paginated, lazily loaded. Branches: local, sorted by committer date; compute divergence lazily for the first 50.
- **Diff:** unstaged `diff_index_to_workdir`; staged `diff_tree_to_index`; untracked: read ≤ 256 KB, binary if NUL byte, else render as all-added lines. Cap patch at **5,000 lines / 1 MB** → `truncated: true`. Compute line stats only when changed files ≤ 100.
- Submodules: show the submodule path as a changed entry; **do not recurse**.
- **Large-repo policy (spike S3):** if large-repo status exceeds an acceptable bound (for example > 500 ms), mitigate in this order: larger poll interval for that repo → `exclude_submodules` → documented limit. Shelling out to system `git` is a last-resort fallback that requires an explicit ADR. It is **not** a v1 default.

### F.5 Status model and attention sorting
Store orthogonal facts: `conflicted`, `ahead`, `behind`, `dirty` (staged+modified+untracked > 0), `detached`, `unborn`, availability. UI shows every applicable badge. Derive **primaryStatus** by precedence:

```text
conflicted (5) > diverged [ahead && behind] (4) > behind (3) > dirty (2) > ahead (1) > clean (0)
unavailable / error → listed after usable repos unless pinned
```
`detached` and `unborn` are informational flags and never outrank conflicted/dirty. **Sort order:** pinned first (manual `sort_order` within pinned) → primary-status priority → last commit time desc.

**Tray aggregate:** default basis "attention" = repos that are conflicted OR dirty OR behind (setting `trayBadgeBasis`). Icon variants: clean / attention / conflict. Show the count in the tooltip, the macOS title, and the Linux menu header.

### F.6 IPC contract
All commands return `Result<T, AppError>`; camelCase JSON.

| Command | Args | Returns |
|---|---|---|
| `list_repos` | n/a | `RepoSummary[]` |
| `add_repo` | `{ path }` | `RepoSummary` (dedupe → returns existing) |
| `scan_folder` | `{ root, maxDepth }` | `ScanHandle { scanId }` (progress via `scan:progress`; results event or poll) |
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
| `export_diagnostics` | `{ destPath }` | `{ path }` (path from a save dialog; stretch) |

**Events:** `repo:updated` (`RepoSummary` incl. `revision`), `repo:removed {id}`, `scan:progress {scanId, scanned, found, currentPath}`, `app:error (AppError)`, `tray:stats {repos, dirty, conflicts, behind}`.

**`AppError`:** `{ code, message, details?, retryable }` with `code` ∈ `REPO_NOT_FOUND | NOT_A_REPO | BARE_REPO | PERMISSION_DENIED | INVALID_PATH | UNSAFE_OWNERSHIP | UNSUPPORTED_REPO_FORMAT | WATCHER_FAILED | SCAN_CANCELLED | DB_ERROR | CONFIG_ERROR | EDITOR_NOT_FOUND | UNKNOWN`. `message` must be actionable (what happened + what to do); codes appear only under "Details" in UI.

### F.7 Error handling
- No panics in command/watcher/DB paths; watcher failures are isolated per repo.
- DB failure: log, emit `app:error`, keep in-memory summaries usable.
- Config corruption: rename to `config.corrupt-<timestamp>.json`, restore defaults, warn the user.

### F.8 Security
- Capabilities: core window, dialog, notification, opener, autostart. **No shell, no fs.**
- **CSP:** `default-src 'self'; img-src 'self' asset: data:; script-src 'self'`. Avoid `style-src 'unsafe-inline'`. Verify it is not required (prefer class-based styling); allow only if proven necessary and document it in an ADR.
- Untrusted content rules per A.3. Escape control and bidi characters in displayed paths.
- Canonicalize user paths. Scan never follows symlinks. Reject bare repos. Never execute repository content or hooks.
- SQL: parameterized only.
- Diagnostics export is user-initiated and shows what it includes before saving.

### F.9 `launcher.rs` (the only process-spawning code)
- `open_in_editor`: spawn an **allowlisted** launcher (known editor CLIs, or a user-chosen executable from settings) with an **argv array**. On macOS use `open -a <App> <path>`. The path must be canonicalized and match a registered repo. Never interpolate into a shell string. On failure return `EDITOR_NOT_FOUND`.
- `reveal_repo`: use the `opener` plugin's reveal API.

### F.10 Webview lifecycle (main memory lever)
- **No webview is created at boot.**
- Popover (mac/Win): created on first tray click; kept warm by default (`keepPopoverWarm: true`), otherwise destroyed after N idle minutes.
- Main window: created on demand. **Closing it destroys the webview**; the app stays alive in the tray. Explicit Quit exits.
- macOS activation policy: **accessory** when no window is open, **regular** while the main window is open (`showDockIcon: "whenWindowOpen" | "always" | "never"`).

---

## PART G: DATA MODEL

### G.1 `config.json` (settings only; atomic temp-file + rename; `schemaVersion` gated)
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
Validate every setting on `update_settings` (ranges, enums); reject invalid patches with `CONFIG_ERROR`.

### G.2 SQLite (`gitpulse.db` in the app-data dir)
```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;

CREATE TABLE IF NOT EXISTS repos (
  id             TEXT PRIMARY KEY,        -- full ULID / UUIDv7
  path           TEXT NOT NULL UNIQUE,    -- canonical path
  name           TEXT NOT NULL,
  pinned         INTEGER NOT NULL DEFAULT 0,
  sort_order     INTEGER NOT NULL DEFAULT 0,
  watch_mode     TEXT NOT NULL DEFAULT 'auto',
  added_at       INTEGER NOT NULL,
  last_seen_at   INTEGER,
  cached_summary TEXT                     -- last RepoSummary JSON for cold-start rendering
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

### G.3 Write policy and `revision`
- **Fingerprint** = hash(branch, head_sha, detached, upstream, ahead, behind, counts).
- Write a snapshot only if the fingerprint changed **or** ≥ 15 min since the last snapshot (heartbeat). Update `cached_summary` at the same cadence.
- **`revision` (per repo, in-memory, monotonically increasing):** bump on **every** completed job that observed a workdir or metadata event, even if the fingerprint is unchanged. `repo:updated` carries it. The detail view refetches changes and the open diff when `revision` changes. (This fixes stale detail views when counts are unchanged.)
- **Activity entries only for transitions:** new conflict, conflict resolved, branch changed, clean↔dirty, divergence crossing a threshold. These also drive notification dedupe and rate limiting.
- **Retention:** at startup and daily, prune snapshots older than `retentionDays` or beyond `snapshotCapPerRepo`; activity older than 90 days; then `PRAGMA optimize`.

### G.4 TypeScript types (generated from Rust; shown for shape)
```ts
export type PrimaryStatus = 'clean'|'ahead'|'dirty'|'behind'|'diverged'|'conflicted'|'unavailable'|'error'|'scanning';
export type WatcherState = 'active'|'polling'|'unavailable';

export interface RepoSummary {
  id: string; name: string; path: string;
  primaryStatus: PrimaryStatus;
  flags: { dirty: boolean; conflicted: boolean; detached: boolean; unborn: boolean };
  branch: string | null;           // short SHA display handled by UI when detached
  upstream: string | null;
  ahead: number; behind: number;
  counts: { staged: number; modified: number; untracked: number; conflicted: number; stashed: number };
  lastCommit: { sha: string; summary: string; author: string; at: string } | null;
  lastFetchAt: string | null;
  watcher: WatcherState;
  revision: number;
  updatedAt: string;
  error?: AppError;
}
export interface FileChange {
  path: string; oldPath: string | null;
  status: 'added'|'modified'|'deleted'|'renamed'|'copied'|'typechange'|'conflicted'|'untracked';
  staged: boolean; insertions: number | null; deletions: number | null; binary: boolean;
}
export interface FileDiff { path: string; staged: boolean; patch: string; binary: boolean; truncated: boolean; languageHint: string | null }
export interface CommitEntry { sha: string; shortSha: string; summary: string; author: string; email: string; at: string }
export interface CommitPage { items: CommitEntry[]; nextCursor: string | null }
export interface BranchEntry { name: string; isHead: boolean; upstream: string | null; ahead: number; behind: number; lastCommitAt: string }
export interface ActivityEntry { id: number; repoId: string; kind: string; payload: unknown; createdAt: string }
```
**Contract guard:** Rust integration tests serialize representative payloads against committed JSON fixtures in `tests/fixtures/contract/`; Vitest asserts the same fixtures against the generated types. CI fails if regenerated bindings differ from the committed file.

### G.5 State ownership (exact)
| State | Owner | Persistence |
|---|---|---|
| Repo list (path, name, pin, order, watch mode) | **SQLite `repos`** | DB |
| Settings | Rust + frontend mirror | `config.json` |
| Live summaries | Rust memory + Zustand mirror | `cached_summary` in DB for cold start |
| UI state (filters, search, selection) | Zustand only | Session only |
| Tray stats | Rust, derived | In-memory |
| Activity | SQLite | Pruned |

The JSON config **never** contains a repo list.

---

## PART H: RUNTIME FLOWS

- **Boot:** load settings → open DB, migrate, prune → hydrate cached summaries → build tray (**no webview**) → register watchers → enqueue initial refresh → show main window only if first run (no repos) or `startMinimized` is false.
- **File edit:** OS event → filter → debounce → quick job → persist if fingerprint changed → emit `repo:updated` (revision++) → store patch → tray stats.
- **Branch switch:** metadata event → medium job → branch/upstream/divergence → record transition → persist → emit.
- **Add repo:** folder picker → canonicalize → validate (exists, git, not bare) → dedupe (focus existing) → insert in DB → initial snapshot → start watcher → emit → toast.
- **Popover open (mac/Win):** render cached instantly → enqueue quick refresh for repos stale > 10 s → events patch rows.
- **Close vs quit:** closing the main window destroys the webview and keeps the tray; Quit exits.

**Per-repo state machine:**
```text
idle → refreshing → ready
                 ↘ error (retryable)
ready → stale (poll due) → refreshing
ready → unavailable (path missing) → locate / remove
any → polling (watcher fallback; backoff retry to watch mode)
```

**Edge cases (each must have a test or manual-QA entry):**
| Case | Behavior |
|---|---|
| Repo moved/deleted | Card "Unavailable"; watcher stops; Locate / Remove; no error spam |
| Not a git repo / bare | Add rejected, with an explanation |
| Unsafe ownership | `UNSAFE_OWNERSHIP` with an explanation of Git's safe-directory rule; **no bypass in-app** |
| Unsupported repo format | `UNSUPPORTED_REPO_FORMAT`; listed but marked unsupported |
| Linked worktree | Watch workdir + common dir; show correct branch |
| Submodule changes | Show path as modified; no recursion |
| Detached HEAD / unborn branch | Short SHA / branch name with zero commits; no divergence |
| Permission denied | Per-repo error card with retry; others unaffected |
| Huge repo / diff | Skip line stats > 100 changed files; truncate diffs at 5,000 lines / 1 MB with banner |
| Watcher failure / inotify limit | Polling mode + "polling" badge |
| Duplicate add | Focus existing repo |
| Popover blur | Auto-hide; focus returns to previous app |
| Config corruption | Back up, restore defaults, warn |
| Scan hits symlink cycle | Symlinks never followed |

---

## PART I: UI/UX SPECIFICATION

### I.1 Principles
Dense but calm · status triple-encoded (color + icon + text, never color alone) · cached-first (render instantly, refresh in background) · one primary action per surface · keyboard-complete, no hover-only actions · respect reduced motion and system theme · honest freshness (show fetch age and watcher mode where they affect trust).

### I.2 Information architecture
```text
GitPulse
├─ Dashboard: sidebar (search, repo list, add) + overview pane
├─ Repo detail: header, changes (staged/unstaged/untracked/conflicted), diff viewer, tabs: Commits · Branches · Activity*
├─ Settings: General · Repositories · Notifications · Data & history · About
└─ Tray: popover (macOS/Windows) | native menu (Linux)
```
\* Activity is stretch.

### I.3 Surfaces
| Surface | Spec |
|---|---|
| Main window | 1080×720 default; min 900×600; native decorations; created on demand, destroyed on close |
| Popover (mac/Win) | 380×520; undecorated; always on top; skip taskbar; hides on blur; positioned from tray icon rect and clamped to the monitor work area |
| Linux tray | Menu only (see Part C) |
| Settings | Full-window route |
| Onboarding | Empty state inside Dashboard (no blocking wizard); Add and Scan actions; scan shows a checklist of candidates |
| Toasts | Bottom-right (main) / top (popover); auto-dismiss 4 s; errors persist; stack limit 3 |

Platform notes: **macOS** template tray icon + optional title count; menu on right-click, popover on left-click (`show_menu_on_left_click(false)`). **Windows** pre-rendered icon variants swapped at runtime plus tooltip; generate HiDPI variants at build time. **Linux** avoid transparency/rounded-window effects; README must note the GNOME AppIndicator extension requirement.

### I.4 Wireframes (reference)
```text
DASHBOARD
┌──────────────────────────────────────────────────────────────────┐
│ ● GitPulse        [⌘K Search]          [Refresh]  [Settings]     │
├──────────────┬───────────────────────────────────────────────────┤
│ REPOS 12     │  app   main  ↑2 ↓0  ●4 dirty        ~/code/app    │
│ ● app     4  │  ┌─────────────────────────────────────────────┐  │
│ ● api     0  │  │ CHANGES 4   BRANCH main   LAST COMMIT 2m    │  │
│ ○ web     0  │  │ M  src/server.ts        +12 −3              │  │
│ ⚠ infra   2  │  │ A  src/new.ts           +40                 │  │
│ [+ Add repo] │  │ ?  notes.md                                 │  │
│              │  └─────────────────────────────────────────────┘  │
│              │  Recent commits · Local branches · Activity        │
└──────────────┴───────────────────────────────────────────────────┘

POPOVER (mac/Win)                     REPO DETAIL
┌────────────────────────────┐        ┌──────────────────────────────────────────────┐
│ GitPulse      3 dirty  ⟳ ⚙│        │ ← app  main ↑2 ↓0 ●4  [Open editor][Reveal][⟳]│
├────────────────────────────┤        ├───────────────────────┬──────────────────────┤
│ app       main ↑2 ●4    ›  │        │ CHANGES               │ src/server.ts unstaged│
│ api       dev ✓         ›  │        │ ▾ Staged (1)          │ @@ -10,6 +10,9 @@    │
│ web       main ↓3 ⚠2    ›  │        │ ▾ Unstaged (3)        │ - const port = 3000; │
├────────────────────────────┤        │ ▾ Conflicts (0)       │ + const port = ...   │
│ Open dashboard          ⌘D │        ├───────────────────────┴──────────────────────┤
└────────────────────────────┘        │ [Commits] [Branches] [Activity]              │
                                      └──────────────────────────────────────────────┘
```
The popover header also shows watcher state when any repo is in polling mode.

### I.5 Design tokens (define in `src/styles/tokens.css` as CSS variables, with light and dark sets)
| Token | Dark | Light |
|---|---|---|
| `--bg` | `#0B0D10` | `#F6F7F9` |
| `--surface` | `#12151A` | `#FFFFFF` |
| `--surface-2` | `#171B22` | `#F0F2F6` |
| `--border` | `#232936` | `#E3E7EE` |
| `--text` | `#E6EAF2` | `#11151C` |
| `--muted` | `#8B94A7` | `#5B6475` |
| `--accent` | `#5B8CFF` | `#2F6BFF` |
| `--success` | `#3FB950` | `#1F883D` |
| `--warning` | `#D29922` | `#9A6700` |
| `--danger` | `#F85149` | `#CF222E` |
| `--info` | `#58A6FF` | `#0969DA` |

Spacing on a 4 px grid. Radii 8 px (controls), 12 px (cards). System UI font stack; 13 px base, 12 px in popover, 12 px monospace for SHAs/paths/diffs. Motion 120–180 ms ease-out, disabled under `prefers-reduced-motion`. **Contrast task (P5):** verify every text token pair ≥ 4.5:1 and non-text status colors ≥ 3:1; fix tokens if they fail.

### I.6 Component inventory
`Button` (primary, ghost, danger, icon) · `IconButton` (requires `aria-label`) · `Input`/`SearchInput` (150 ms debounce) · `Toggle` (accessible switch) · `Select` (native, styled) · `Badge`/`CountBadge` (caps at `99+`) · `StatusDot` (icon + color + tooltip) · `DivergencePill` (`↑2 ↓3`, with screen-reader text) · `RepoCard`/`RepoRow` · `ChangeRow` (status letter, path, line stats) · `DiffViewer` (hunk headers, +/- coloring, truncation banner, copy path, **text nodes only**) · `CommitList` · `BranchList` · `EmptyState` · `ErrorCard` (message, details disclosure, retry) · `Toast` · `ConfirmDialog` (destructive actions only) · `TrayPopover` (focus trap, Esc handling) · `ScanResultsChecklist`.

### I.7 Keyboard
**P0:** complete Tab order, Enter to open, Esc to close/back, arrow-key selection in lists.
**P1 shortcuts:** `⌘/Ctrl+K` search · `⌘/Ctrl+R` refresh all · `⌘/Ctrl+,` settings · `⌘/Ctrl+O` add repo · `⌘/Ctrl+D` open dashboard from popover.

### I.8 Accessibility
Visible focus rings; `aria-label` on icon-only buttons; popover traps focus and restores it on close; status via text + icon + color; skip-to-content link; reduced motion honored; a polite live region announcing repo status transitions, **rate-limited** so storms of changes don't flood screen readers.

### I.9 Copy
Errors state what happened and what to do next; codes only under "Details". Staleness explicit. Examples: "web is 7 commits behind origin/main (last fetch 3 h ago)", "app has 3 merge conflicts", "Repository moved or deleted. Locate it or remove it.", "This folder is not a Git repository."

---

## PART J: SECURITY CHECKLIST (verify at P4 and P6)
- [ ] `capabilities/default.json` contains only: core window, dialog, notification, opener, autostart.
- [ ] No `shell`/`fs` plugin in `Cargo.toml` or `package.json`.
- [ ] CSP set per F.8.
- [ ] ESLint rule bans `dangerouslySetInnerHTML`.
- [ ] `launcher.rs` is the only place using `std::process::Command`; argv arrays only.
- [ ] All SQL parameterized.
- [ ] Malicious-content fixtures pass (HTML in filenames/commit messages, bidi chars, symlink loops).
- [ ] No network crates reachable (`cargo tree` review); `git2` has `default-features = false`.

---

## PART K: PHASES, TASKS, AND EXIT GATES

Estimates assume one engineer. Base ≈ 33 days; with ~20% contingency ≈ 40 days.

### P0: Foundations + spikes (3 d)
**Tasks**
1. `git init` (non-synced path), MIT `LICENSE`, `.gitignore`, `.editorconfig`.
2. Scaffold Vite + React + TS; remove demo assets. Add Tailwind 4 (`@tailwindcss/vite`) and `tokens.css`.
3. `pnpm tauri init`; set product name, identifier `io.github.<owner>.gitpulse` (placeholder), window specs (I.3). **No window created at boot** (configure windows programmatically or `create: false`).
4. `rust-toolchain.toml`, `rustfmt.toml`, `clippy.toml`, `deny.toml`. ESLint flat config (ban `dangerouslySetInnerHTML`) + Prettier. Add scripts: `lint`, `test`, `gen:bindings`.
5. Placeholder icons via `tauri icon`; pre-render tray variants (template for macOS; clean/attention/conflict for Windows/Linux).
6. **CI skeleton on all three OSes** (Part N.1) including `tauri build --debug --no-bundle` smoke on each.
7. Author `docs/PRD.md` (from Part B), `docs/TECH.md` skeleton (resolved versions, capability matrix), initial ADRs.
8. Resolve and record all dependency versions (A.2 rule 2).
9. **Spikes (time-boxed; record each as an ADR with real measurements):**
   - **S1 Tray & popover:** tray click events, icon rect, positioning on macOS and Windows; what Linux (GNOME+extension, KDE) supports. Confirms/corrects Part C.
   - **S2 Memory & start:** RSS for core-only, popover warm, main window open, per OS; verify webview destroy-on-close is reliable. Freezes §B.4 budgets and F.10.
   - **S3 libgit2 performance:** status latency on small, ~10k-file, and very large repos; behavior with submodules, worktrees, unsafe ownership. Freezes NFR-03 tiers; decides `exclude_submodules` default.
   - **S4 Linux watching:** inotify consumption of the ignore-aware walk on a `node_modules`-heavy repo; `ENOSPC` handling. Freezes `linuxWatchDirCap`.
10. Confirm `cmake`/libgit2 builds in CI on all runners; confirm the macOS arm64 build is ad-hoc signed.
11. Initial commit on `main`.

**Gate:** `pnpm build`, `cargo check`, `cargo test` green on 3 OSes; spike ADRs recorded (mark "unverified" for any that could not be run); budgets frozen in `docs/TECH.md`.

### P1: Git engine (4 d)
**Tasks:** implement in `src-tauri/src/git/`:
- `open.rs`: validate, canonicalize, reject bare, detect worktrees, map ownership/format errors.
- `status.rs`: counts + file list per F.4.
- `branches.rs`: HEAD, detached, unborn, upstream, ahead/behind, local branches (lazy divergence for first 50).
- `log.rs`: paginated commits with cursor.
- `diff.rs`: staged/unstaged/untracked patches, binary detection, truncation (5,000 lines / 1 MB), thresholded stats.
- `scan.rs`: depth limit, skip list, cancel token, 500 cap, no symlink following, `.git` **file** (worktree/submodule) detection, stop at first `.git`.
- `scripts/make-fixtures` generating: clean, modified, staged, untracked, rename, conflict, detached, unborn, bare, linked worktree, submodule, unicode paths, unsafe-owner (where creatable).
- Tests with `tempfile`; large-repo benchmark script in `scripts/bench`.
- Document libgit2/cmake prerequisites.

**Gate:** engine tests green on 3 OSes; **no Tauri dependency** in `git/` (enforce with a check that `git` modules don't `use tauri`); large-repo benchmark recorded.

### P2: Persistence (2 d)
**Tasks:** `store/config.rs` (atomic write, schema version, corruption recovery, validation) · `db.rs` + `migrations.rs` (G.2, `user_version`) · repo CRUD, ordering, pinning · `snapshots.rs` (fingerprint, dedupe, heartbeat) · `activity.rs` (transition detection) · retention at startup + daily timer · generated TS bindings + `tests/fixtures/contract/` JSON fixtures; `pnpm gen:bindings`.

**Tests:** migration from empty DB; corrupt config recovery; concurrent reads/writes; fingerprint dedupe; retention.
**Gate:** restart-safe state; migrations tested; bindings diff check in CI.

### P3: Watcher & jobs (4 d)
**Tasks:** watch path resolution (gitdir, commondir, workdir) · metadata watcher (F.3.1) · platform workdir strategies (F.3.2) · `fswalk.rs` ignore-aware, capped · `debounce.rs` state machine with **mock-clock tests** · scheduler (bounded channel, semaphore of 4, one in flight per repo, pending flag) · polling fallback + circuit breaker + retry backoff · lifecycle on add/remove/quit · `revision` bump logic.

**Tests:** debounce (quiet period, hard flush, coalescing); integration: write file → event → summary updated < 1 s (generous timeout, bounded retries, tagged as timing-sensitive); forced limit → polling on Linux CI; no duplicate in-flight jobs.
**Gate:** live edit < 1 s on macOS/Windows; Linux degrades to polling cleanly under forced limit.

### P4: Tauri shell + walking skeleton, milestone M1 (4 d)
**Tasks:** `AppState`, command registration, event helpers · all commands in F.6 (validated, non-blocking) · `tray.rs` (icon variants, tooltip, menu, aggregate, throttled) · popover on macOS/Windows with work-area clamping; Linux tray menu · `windows.rs` (create/destroy main window, activation policy, F.10) · single-instance focus · autostart wiring · capability allowlist + CSP · `launcher.rs` (F.9) · minimal list UI (enough to show repos and live status).

**Gate (M1):** demo on **macOS, Windows, and Linux**: add a repo → live status appears in the tray and a basic list; Security checklist (Part J) passes.

### P5: React UI (7 d)
**Tasks:** typed IPC client + event-subscription lifecycle (unsubscribe on unmount) · Zustand stores (`repos`, `settings`, `ui`) · tokens and all components (I.6) · Dashboard (list, detail pane, search, sort per F.5) · Repo detail (grouped changes, diff viewer with `revision`-driven refetch, commits, branches, activity as stretch) · Settings (all sections) · Onboarding + scan checklist · popover route with focus trap · toasts and error cards · keyboard navigation (+ P1 shortcuts if time allows) · Vitest + RTL tests · accessibility and contrast audit.

**Gate:** all P0 flows usable on all 3 OSes; Vitest/RTL green; contrast audit passes.

### P6: Polish & performance (4 d)
**Tasks:** smart notifications (rate-limited per repo+reason, off by default, transition-driven, copy per I.9) · tray variants per OS · theme/density polish · empty/error/loading states · profiling against scripted 25- and 100-repo fixtures plus at least one large real repo; idle CPU/memory sampled over 10 minutes · bundle analysis, lazy-load detail routes · per-OS quirks (Linux rendering, Windows DPI, macOS activation policy) · reduced-motion/high-contrast checks · reconcile docs with actual behavior.

**Gate:** NFR budgets validated and recorded per OS (or deviations documented with justification).

### P7: Packaging & CI/CD (3 d)
**Tasks:** final icon set (icns, ico, png) · macOS universal build (**verify ad-hoc signature** on arm64 with `codesign -dv`) · Windows **NSIS only** for 0.1 · Linux AppImage + deb · `release.yml`, `release-dryrun.yml`, version-sync guard script, `SHA256SUMS.txt` · install docs with corrected unsigned flows (Part N.3) · smoke test each artifact on a clean machine/VM.

**Gate:** dry-run and a real tag each produce installable artifacts, smoke-tested per OS.

### P8: OSS launch (2 d)
**Tasks:** README (hero, GIF, features, per-OS install, capability table, build, architecture, privacy, known limitations, roadmap) · CONTRIBUTING · CODE_OF_CONDUCT (Contributor Covenant 2.1) · SECURITY (private disclosure; local-only, read-only threat model) · issue/PR templates · Dependabot (npm, cargo, actions, weekly) · CHANGELOG 0.1.0 (Keep a Changelog) · name/trademark/bundle-ID decision locked · branch protection + required checks · publish release.

**Gate:** public-repo checklist complete.

**Cut order if time slips:** FR-12 (Activity UI + diagnostics export) → global shortcut set → notifications (FR-10) → keep-popover-warm tuning. **P0-priority requirements are never cut.**

### Global definition of done (every phase)
- Part A.4 checks green on all supported OSes.
- No `unwrap`/`expect` in command, watcher, DB paths.
- Every action reachable by keyboard; every failure has an actionable user-facing state.
- Behavior matches the capability matrix (no silent per-OS divergence).
- Docs and changelog updated for the phase.
- From P4 onward, the phase gate is verified on **all three OSes**.

---

## PART L: TESTING STRATEGY
| Layer | Coverage |
|---|---|
| Rust unit | Status scenarios, divergence, diff extraction/truncation/binary, scan (depth, caps, symlinks), path validation, debounce (mock clock), config atomicity, retention, fingerprint, revision bumping |
| Rust integration | Temp repos built with `git2`; watcher write-and-wait with timeouts/retries; DB migration + restart; corrupt config; forced inotify-limit fallback (Linux CI) |
| Frontend unit | Status precedence, formatting, stores, IPC error mapping, path shortening |
| Frontend component | RepoCard states, DiffViewer truncation + text-only rendering, Settings validation, popover focus trap, empty/error states, scan checklist |
| Contract | Generated-binding diff check + serde JSON fixtures ↔ TS assertions |
| Security | Malicious-content fixtures (HTML in names/messages, bidi characters, symlink loops) |
| Performance | 25- and 100-repo scripted fixtures + ≥ 1 large real repo; idle CPU/memory over 10 min; recorded at each gate and release |
| Manual QA | macOS arm64 (incl. Sequoia install flow), Windows 11, Ubuntu 22.04/24.04 (GNOME with extension, KDE); multi-monitor, HiDPI, Wayland and X11, moved repos, permission errors, detached/unborn, worktrees, submodules, unsafe-owner repo |

Watcher tests are timing-sensitive: use generous timeouts and bounded retries, and tag them so flakiness is visible. **No automated end-to-end UI testing of the Tauri shell in 0.1** (WebDriver support is uneven, especially WKWebView on macOS). Tray/popover are covered by the manual matrix and the M1 gate.

---

## PART N: CI/CD

### N.1 `ci.yml` (push / PR)
1. **frontend:** pnpm frozen install → `tsc --noEmit` → ESLint → Vitest → `vite build` → bindings-regeneration diff check.
2. **rust** matrix (`ubuntu-22.04`, `macos-14`, `windows-2022`): fmt check → clippy `-D warnings` → `cargo test`.
3. **supply-chain:** `cargo deny` / `cargo audit`, `pnpm audit` (block on high severity, warn on lower).
4. **tauri-smoke** on **all three OSes:** `tauri build --debug --no-bundle` (Linux installs WebKitGTK 4.1 deps first).
5. Caches: pnpm store, `Swatinem/rust-cache`. Concurrency cancels in-progress runs on the same ref.

### N.2 `release.yml` (tag `v*.*.*`) and `release-dryrun.yml`
1. **Guard:** tag matches versions in `package.json`, `src-tauri/Cargo.toml`, `tauri.conf.json` (`scripts/check-version-sync`).
2. Create a **draft** GitHub Release.
3. Matrix via `tauri-apps/tauri-action`: macOS 14 universal (`aarch64` + `x86_64`) → `.dmg`; Ubuntu 22.04 → `appimage,deb`; Windows 2022 → `nsis` only.
4. Upload artifacts; generate and attach `SHA256SUMS.txt`.
5. No notarization, no updater. **Secrets: none.**
6. `release-dryrun.yml` (`workflow_dispatch` + PR label): full matrix, artifacts attached to the workflow run only, no release created. Run before every tag and at P7.
7. Manual publish after artifact smoke tests.

### N.3 Unsigned-install documentation (use these exact flows in README)
- **macOS (Sequoia 15+):** open the app once and dismiss the warning, then **System Settings → Privacy & Security → "Open Anyway"**. (The older right-click → Open shortcut no longer works on current macOS.) Alternative: `xattr -dr com.apple.quarantine /Applications/GitPulse.app`.
- **Windows:** SmartScreen → "More info" → "Run anyway".
- **Linux:** `chmod +x` the AppImage; install `.deb` with `apt`. Note the GNOME AppIndicator extension requirement.

### N.4 PR standards
Conventional-commit titles; PR template (summary, test plan, screenshots for UI changes); required CI checks; squash merge; protected `main` after P0.

---

## PART M: DEFAULTS FOR AMBIGUITY (apply without asking; note in phase report)
1. Unspecified UI detail → follow tokens, components, and wireframes in Part I; choose the simpler option.
2. Unspecified numeric limits → use the values in this document; otherwise pick a conservative value and document it in `docs/TECH.md`.
3. If a spike cannot run in your environment → implement to the spec, mark the corresponding budget "unverified", and list it in the phase report.
4. If a crate choice is unspecified → prefer the most widely used, actively maintained crate with a permissive license; record in `docs/TECH.md`.
5. If tests are timing-flaky → fix the cause or widen timeouts with bounded retries; never delete or skip tests silently.
6. GitHub URLs use `<owner>` as a placeholder until provided.
7. Retention defaults: 30 days / 500 snapshots per repo. Scan defaults: depth 3, cap 500, no symlinks.

---

## PART O: HUMAN DECISIONS STILL OPEN (do not block P0–P7; resolve before public launch)
1. **Name and identity:** run a trademark/GitHub/crates.io/npm collision check on "GitPulse"; choose the bundle-ID namespace (owned domain vs. `io.github.<owner>.*`) **before** the first release.
2. **Linux popover:** confirm that "tray menu + main window on Linux" is acceptable for 0.1.
3. **Stretch scope:** confirm FR-12 (Activity UI + diagnostics export) may slip to 0.2.

---

## PART P: FIRST ACTIONS (start here)
1. Create the repository in a non-synced directory; resolve and record toolchain versions.
2. Scaffold Vite + React + TypeScript + Tailwind; initialize Tauri v2 with no window created at boot.
3. Stand up CI on macOS, Windows, and Linux, including the `tauri build --debug --no-bundle` smoke job.
4. Run spikes S1–S4; record results as ADRs; freeze the budgets and capability matrix.
5. Write `docs/PRD.md`, the `docs/TECH.md` skeleton, and the initial ADRs.
6. Commit P0 on `main`, report the gate results, then proceed to P1.
