# GitPulse - Implementation Plan

**Version:** 0.1.0
**Date:** 2026-11-09

---

## Phase Overview

| Phase | Name | Duration | Key Deliverable |
|-------|------|----------|-----------------|
| P0 | Foundations + Spikes | 3 days | Scaffold, CI skeleton, spike ADRs, frozen budgets |
| P1 | Git Engine | 4 days | Pure git2 modules with tests |
| P2 | Persistence | 2 days | Config + SQLite + generated TS bindings |
| P3 | Watcher & Jobs | 4 days | Cross-platform watch manager, debounce, scheduler |
| P4 | Tauri Shell + M1 | 4 days | Commands, tray, windows, security checklist |
| P5 | React UI | 7 days | Dashboard, detail, settings, popover, keyboard, a11y |
| P6 | Polish & Performance | 4 days | Notifications, perf validation, per-OS quirks |
| P7 | Packaging & CI/CD | 3 days | Signed/unsigned artifacts, release pipeline |
| P8 | OSS Launch | 2 days | README, templates, release publish |

**Total:** ~33 engineer-days base; ~40 days with contingency.

---

## P0: Foundations + Spikes (3 days)

### Tasks
1. `git init` (non-synced path), MIT `LICENSE`, `.gitignore`, `.editorconfig`.
2. Scaffold Vite + React + TS; remove demo assets. Add Tailwind 4 (`@tailwindcss/vite`) and `tokens.css`.
3. `pnpm tauri init`; set product name, identifier `io.github.<owner>.gitpulse` (placeholder), window specs. **No window created at boot** (configure windows programmatically or `create: false`).
4. `rust-toolchain.toml`, `rustfmt.toml`, `clippy.toml`, `deny.toml`. ESLint flat config (ban `dangerouslySetInnerHTML`) + Prettier. Add scripts: `lint`, `test`, `gen:bindings`.
5. Placeholder icons via `tauri icon`; pre-render tray variants (template for macOS; clean/attention/conflict for Windows/Linux).
6. **CI skeleton on all three OSes** including `tauri build --debug --no-bundle` smoke on each.
7. Author `docs/PRD.md`, `docs/TECH.md` skeleton (resolved versions, capability matrix), initial ADRs.
8. Resolve and record all dependency versions.
9. **Spikes (time-boxed; record each as an ADR with real measurements):**
   - **S1 Tray & popover:** tray click events, icon rect, positioning on macOS and Windows; what Linux (GNOME+extension, KDE) supports. Confirms/corrects Capability Matrix.
   - **S2 Memory & start:** RSS for core-only, popover warm, main window open, per OS; verify webview destroy-on-close is reliable. Freezes NFR budgets.
   - **S3 libgit2 performance:** status latency on small, ~10k-file, and very large repos; behavior with submodules, worktrees, unsafe ownership. Freezes NFR-03 tiers; decides `exclude_submodules` default.
   - **S4 Linux watching:** inotify consumption of the ignore-aware walk on a `node_modules`-heavy repo; `ENOSPC` handling. Freezes `linuxWatchDirCap`.
10. Confirm `cmake`/libgit2 builds in CI on all runners; confirm the macOS arm64 build is ad-hoc signed.
11. Initial commit on `main`.

### Gate
- `pnpm build`, `cargo check`, `cargo test` green on 3 OSes
- Spike ADRs recorded (mark "unverified" for any that could not be run)
- Budgets frozen in `docs/TECH.md`

---

## P1: Git Engine (4 days)

### Tasks
Implement in `src-tauri/src/git/`:
- `open.rs`: validate, canonicalize, reject bare, detect worktrees, map ownership/format errors.
- `status.rs`: counts + file list per Git read strategy.
- `branches.rs`: HEAD, detached, unborn, upstream, ahead/behind, local branches (lazy divergence for first 50).
- `log.rs`: paginated commits with cursor.
- `diff.rs`: staged/unstaged/untracked patches, binary detection, truncation (5,000 lines / 1 MB), thresholded stats.
- `scan.rs`: depth limit, skip list, cancel token, 500 cap, no symlink following, `.git` **file** (worktree/submodule) detection, stop at first `.git`.
- `scripts/make-fixtures` generating: clean, modified, staged, untracked, rename, conflict, detached, unborn, bare, linked worktree, submodule, unicode paths, unsafe-owner (where creatable).
- Tests with `tempfile`; large-repo benchmark script in `scripts/bench`.
- Document libgit2/cmake prerequisites.

### Gate
- Engine tests green on 3 OSes
- **No Tauri dependency** in `git/` (enforce with a check that `git` modules don't `use tauri`)
- Large-repo benchmark recorded

---

## P2: Persistence (2 days)

### Tasks
- `store/config.rs` (atomic write, schema version, corruption recovery, validation)
- `db.rs` + `migrations.rs` (user_version)
- Repo CRUD, ordering, pinning
- `snapshots.rs` (fingerprint, dedupe, heartbeat)
- `activity.rs` (transition detection)
- Retention at startup + daily timer
- Generated TS bindings + `tests/fixtures/contract/` JSON fixtures; `pnpm gen:bindings`

### Tests
- Migration from empty DB
- Corrupt config recovery
- Concurrent reads/writes
- Fingerprint dedupe
- Retention

### Gate
- Restart-safe state
- Migrations tested
- Bindings diff check in CI

---

## P3: Watcher & Jobs (4 days)

### Tasks
- Watch path resolution (gitdir, commondir, workdir)
- Metadata watcher
- Platform workdir strategies
- `fswalk.rs` ignore-aware, capped
- `debounce.rs` state machine with **mock-clock tests**
- Scheduler (bounded channel, semaphore of 4, one in flight per repo, pending flag)
- Polling fallback + circuit breaker + retry backoff
- Lifecycle on add/remove/quit
- `revision` bump logic

### Tests
- Debounce (quiet period, hard flush, coalescing)
- Integration: write file → event → summary updated < 1 s (generous timeout, bounded retries, tagged as timing-sensitive)
- Forced limit → polling on Linux CI
- No duplicate in-flight jobs

### Gate
- Live edit < 1 s on macOS/Windows
- Linux degrades to polling cleanly under forced limit

---

## P4: Tauri Shell + Walking Skeleton, Milestone M1 (4 days)

### Tasks
- `AppState`, command registration, event helpers
- All commands (validated, non-blocking)
- `tray.rs` (icon variants, tooltip, menu, aggregate, throttled)
- Popover on macOS/Windows with work-area clamping; Linux tray menu
- `windows.rs` (create/destroy main window, activation policy)
- Single-instance focus
- Autostart wiring
- Capability allowlist + CSP
- `launcher.rs` (only process-spawning code)
- Minimal list UI (enough to show repos and live status)

### Gate (M1)
- Demo on **macOS, Windows, and Linux**: add a repo → live status appears in the tray and a basic list
- Security checklist passes

---

## P5: React UI (7 days)

### Tasks
- Typed IPC client + event-subscription lifecycle (unsubscribe on unmount)
- Zustand stores (`repos`, `settings`, `ui`)
- Tokens and all components
- Dashboard (list, detail pane, search, sort)
- Repo detail (grouped changes, diff viewer with `revision`-driven refetch, commits, branches, activity as stretch)
- Settings (all sections)
- Onboarding + scan checklist
- Popover route with focus trap
- Toasts and error cards
- Keyboard navigation (+ P1 shortcuts if time allows)
- Vitest + RTL tests
- Accessibility and contrast audit

### Gate
- All P0 flows usable on all 3 OSes
- Vitest/RTL green
- Contrast audit passes

---

## P6: Polish & Performance (4 days)

### Tasks
- Smart notifications (rate-limited per repo+reason, off by default, transition-driven)
- Tray variants per OS
- Theme/density polish
- Empty/error/loading states
- Profiling against scripted 25- and 100-repo fixtures plus at least one large real repo
- Idle CPU/memory sampled over 10 minutes
- Bundle analysis, lazy-load detail routes
- Per-OS quirks (Linux rendering, Windows DPI, macOS activation policy)
- Reduced-motion/high-contrast checks
- Reconcile docs with actual behavior

### Gate
- NFR budgets validated and recorded per OS (or deviations documented with justification)

---

## P7: Packaging & CI/CD (3 days)

### Tasks
- Final icon set (icns, ico, png)
- macOS universal build (**verify ad-hoc signature** on arm64 with `codesign -dv`)
- Windows **NSIS only** for 0.1
- Linux AppImage + deb
- `release.yml`, `release-dryrun.yml`, version-sync guard script, `SHA256SUMS.txt`
- Install docs with corrected unsigned flows
- Smoke test each artifact on a clean machine/VM

### Gate
- Dry-run and a real tag each produce installable artifacts, smoke-tested per OS

---

## P8: OSS Launch (2 days)

### Tasks
- README (hero, GIF, features, per-OS install, capability table, build, architecture, privacy, known limitations, roadmap)
- CONTRIBUTING
- CODE_OF_CONDUCT (Contributor Covenant 2.1)
- SECURITY (private disclosure; local-only, read-only threat model)
- Issue/PR templates
- Dependabot (npm, cargo, actions, weekly)
- CHANGELOG 0.1.0 (Keep a Changelog)
- Name/trademark/bundle-ID decision locked
- Branch protection + required checks
- Publish release

### Gate
- Public-repo checklist complete

---

## Cut Order (if time slips)

1. FR-12 (Activity UI + diagnostics export)
2. Global shortcut set
3. Notifications (FR-10)
4. Keep-popover-warm tuning

**P0-priority requirements are never cut.**

---

## Global Definition of Done (Every Phase)

- All checks green on all supported OSes
- No `unwrap`/`expect` in command, watcher, DB paths
- Every action reachable by keyboard; every failure has an actionable user-facing state
- Behavior matches the capability matrix (no silent per-OS divergence)
- Docs and changelog updated for the phase
- From P4 onward, the phase gate is verified on **all three OSes**

---

*This PLAN.md is derived from the implementation specification in `GITPULSE_IMPLEMENTATION_SPEC.md`.*