# GitPulse - Product Requirements Document

**Version:** 0.1.0
**Status:** Approved
**Date:** 2026-11-09

---

## 1. Problem Statement

Developers maintain 5–30 local Git clones. Finding which repositories have uncommitted work, are on which branch, or have diverged from upstream requires visiting each directory or running commands manually. There is no lightweight, local-first, cross-platform utility that provides a live, aggregated view of repository status from the system tray.

## 2. Personas

| Persona | Description | Needs |
|---------|-------------|-------|
| **Polyrepo Developer** | Works across 8–20 clones daily | Quick overview of all repos; pin important ones; see conflicts & divergence at a glance |
| **Reviewer / Tech Lead** | Monitors team repos for merge readiness | Conflict visibility; ahead/behind counts; fetch age |
| **OSS Contributor** | Contributes to many projects passively | Minimal overhead; tray badge only; no notifications by default |

## 3. Goals

1. **Local-first, read-only**: Zero network I/O in v1. No staging, committing, fetching, or pushing.
2. **Cross-platform**: macOS (arm64 + x64), Windows (x64), Linux (x64).
3. **Live updates**: Filesystem watchers + debounced Git status polling.
4. **Two surfaces**: System tray popover (macOS/Windows) + full dashboard window (all platforms).
5. **Aggregated tray indicator**: Shows count of repos needing attention.
6. **Repository management**: Add/remove/scan folders; pin/reorder; handle moved/deleted repos.
7. **Detailed repo view**: Grouped changes (staged/unstaged/untracked/conflicts), unified diff, recent commits, local branches.
8. **Settings**: Theme, startup behavior, poll intervals, watch modes, ignored patterns, notifications.
9. **Smart notifications**: Opt-in, transition-driven, rate-limited.
10. **Packaging**: Unsigned binaries, no auto-updater, MIT licensed.

## 4. Non-Goals (v1)

- Staging, discarding, committing
- Fetch, pull, push, merge, rebase
- Credential handling, SSH agents, GitHub API
- Cloud sync, accounts, telemetry
- Auto-update, paid code signing
- i18n, mobile/web builds
- Syntax-highlighted diffs

## 5. Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-01 | Add/remove repos; canonicalize and dedupe paths; reject non-git and bare repos | P0 |
| FR-02 | Scan a root folder: depth 1–5 (default 3), skip heavy dirs, never follow symlinks, cancellable, cap 500, stop at first `.git` | P0 |
| FR-03 | Show branch, detached HEAD, unborn branch, upstream, ahead/behind, last-fetch age | P0 |
| FR-04 | Show staged, modified, untracked, conflicted, stash counts plus changed paths | P0 |
| FR-05 | Live refresh: watchers + debounce + reconciliation poll + refresh on window focus | P0 |
| FR-06 | Tray icon with aggregate state, tooltip, context menu; left-click popover on macOS/Windows | P0 |
| FR-07 | Dashboard sorted by attention priority; pin, reorder, search | P0 |
| FR-08 | Repo detail: grouped changes, unified diff viewer, recent commits, local branches | P0 |
| FR-09 | Settings: theme, start minimized, launch at login, poll intervals, watch mode, ignore patterns, retention | P0 |
| FR-10 | Smart notifications, off by default, rate-limited per repo+reason | P1 |
| FR-11 | Moved/deleted/unreadable repos: Locate / Remove actions | P0 |
| FR-12 | Activity timeline UI + diagnostics export | P1 (stretch) |
| FR-13 | First-run onboarding empty state with Add and Scan; main window always shown on first run | P0 |
| FR-14 | Keyboard navigation (focus order, Enter/Esc, arrow selection) P0; global shortcuts P1 | P0/P1 |

## 6. Non-Functional Requirements

| ID | Target |
|----|--------|
| NFR-01 | Cold start to tray with no webview < 500 ms; popover with cached data < 150 ms |
| NFR-02 | Idle CPU < 0.5% averaged over 10 min with 25 repos |
| NFR-03 | Quick status median < 40 ms/repo for repos < ~10k tracked files |
| NFR-04 | Installer < 20 MB per platform |
| NFR-05 | Zero network I/O; no shell interpretation; capability-scoped IPC |
| NFR-06 | WCAG 2.1 AA contrast; keyboard-complete; reduced motion respected |
| NFR-07 | Crash-safe config and DB (atomic writes, WAL) |
| NFR-08 | Watcher failures degrade to polling without data loss or error spam |
| NFR-09 | Live edit reflected within 1 s (p95) on macOS/Windows |

## 7. Success Metrics

- **Adoption**: 1,000+ downloads in first month
- **Retention**: 40% weekly active users at 30 days
- **Performance**: All NFR targets met on CI across three OSes
- **Quality**: Zero critical bugs in first release; < 5 high-severity bugs in first 60 days

## 8. Release Criteria

- All P0 requirements implemented and tested
- CI green on macOS, Windows, Linux
- Security checklist (Part J) passes
- Installable artifacts produced for all three platforms
- Documentation complete (README, CHANGELOG, CONTRIBUTING, SECURITY, CODE_OF_CONDUCT)

---

*This PRD is derived from the implementation specification in `GITPULSE_IMPLEMENTATION_SPEC.md`.*