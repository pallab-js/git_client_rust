# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial implementation of GitPulse
- Cross-platform system tray with popover (macOS/Windows) and menu (Linux)
- Multi-repository dashboard with search, pin, reorder
- Live Git status: branch, ahead/behind, working-tree changes
- Repo detail view with grouped changes, unified diff, commits, branches
- Folder scanning for repository discovery (depth 1-5, cap 500)
- Settings: theme, startup, poll intervals, watch modes, ignored patterns
- Smart notifications (opt-in, transition-driven, rate-limited)
- SQLite persistence with snapshots and activity timeline
- Diagnostics export
- Keyboard navigation and shortcuts
- Accessibility (WCAG 2.1 AA, reduced motion, focus management)
- CI/CD pipeline for macOS, Windows, Linux

### Security
- Read-only Git operations (no staging, commit, fetch, push)
- Zero network I/O in v1 (`git2` built without OpenSSL)
- Capability-scoped IPC (no shell, no fs plugin)
- CSP and input sanitization

## [0.1.0] - 2026-11-09

### Added
- First public release

---

## Release Types

- **Major** (`x.0.0`) — Breaking changes to IPC, data schema, or user-facing workflows
- **Minor** (`0.x.0`) — New features, backwards-compatible
- **Patch** (`0.0.x`) — Bug fixes, performance improvements, documentation

## Versioning

Version is synchronized across:
- `package.json`
- `src-tauri/Cargo.toml`
- `src-tauri/tauri.conf.json`

CI enforces version sync on release tags.

## Links

- [GitHub Releases](https://github.com/<owner>/gitpulse/releases)
- [Issues](https://github.com/<owner>/gitpulse/issues)
- [Discussions](https://github.com/<owner>/gitpulse/discussions)