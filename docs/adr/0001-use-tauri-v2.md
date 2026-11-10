# 0001 - Use Tauri v2 with Rust and React

**Date:** 2026-11-09
**Status:** Accepted

## Context
We need a cross-platform desktop framework that produces small, performant binaries with native OS integration (tray, notifications, autostart). The app must be local-first with zero network I/O in v1.

## Decision
Use **Tauri v2** with:
- Rust backend (`git2`, `notify`, `rusqlite`, `tokio`)
- React + TypeScript frontend (Vite, Tailwind 4, Zustand)
- Type-safe IPC via `ts-rs` generated bindings

## Consequences
**Positive:**
- Small binary size (~10-15 MB)
- Native performance for Git operations (libgit2)
- True system tray support on all three platforms
- Capability-based security model (no shell/fs plugins)
- Mature ecosystem, active maintenance

**Negative:**
- WebView2 on Windows adds ~100 MB runtime (system-provided on Win 10+)
- Linux requires WebKitGTK 4.1 + libappindicator3
- macOS codesigning/notarization complexity for distribution
- Smaller community than Electron

## Alternatives Considered
| Alternative | Verdict |
|-------------|---------|
| Electron | Larger binaries, higher memory, less native tray control |
| Wails | Go backend; team prefers Rust for libgit2 |
| Native (Swift/WinUI/GTK) | 3x development effort |
| Flutter desktop | Immature tray/menu support; Dart not preferred |

---

# 0002 - Read-only Git in v1

**Date:** 2026-11-09
**Status:** Accepted

## Context
The spec explicitly limits v1 to read-only Git operations. This avoids credential handling, network I/O, and complex conflict resolution UI.

## Decision
- `git2` built with `default-features = false` (no OpenSSL, no SSH, no HTTPS)
- No staging, unstaging, discarding, committing
- No fetch, pull, push, merge, rebase
- `update_index(false)` on all status calls
- Open repos in user's editor via `opener` plugin instead

## Consequences
**Positive:**
- Zero network attack surface
- Simpler UI (no credential prompts, no conflict resolution flows)
- Smaller binary (no OpenSSL)
- Clear scope for v1

**Negative:**
- Users must fetch/pull externally to update ahead/behind
- Cannot stage/commit from the app
- "Behind" count only updates after external fetch

## Mitigation
- Show "last fetch X ago" prominently
- "Open in editor" / "Reveal in Finder/Explorer" as primary escape hatches
- Opt-in fetch is #1 post-0.1 roadmap item

---

# 0003 - SQLite for History, JSON for Config

**Date:** 2026-11-09
**Status:** Accepted

## Context
Need to persist: repo list (paths, pins, order), settings, status snapshots, activity timeline.

## Decision
- **SQLite** (`rusqlite` bundled) for repos, snapshots, activity
- **JSON** (`config.json`) for settings only
- Atomic writes for JSON (temp + rename)
- WAL mode, FKs, `busy_timeout` for SQLite
- Migrations via `PRAGMA user_version`

## Consequences
**Positive:**
- Structured queries for snapshots/activity
- Efficient pruning (retention policies)
- ACID for repo metadata
- Human-editable config for settings

**Negative:**
- Two persistence mechanisms to maintain
- Migration complexity for SQLite schema changes

## Alternatives Considered
| Alternative | Verdict |
|-------------|---------|
| JSON only | No efficient history queries; file grows unbounded |
| SQLite only | Settings less transparent; migration risk for all data |
| Tauri plugin-store | Less control; no WAL; no custom migrations |

---

# 0004 - Watcher Strategy: Metadata + Platform Workdir

**Date:** 2026-11-09
**Status:** Accepted

## Context
Filesystem watching must be efficient and cross-platform. Full recursive worktree watches are expensive on Linux (inotify limits) and noisy on all platforms.

## Decision
1. **Always watch git metadata** (cheap, high signal): `HEAD`, `index`, `packed-refs`, `refs/`, `MERGE_HEAD`, `rebase-*`, `FETCH_HEAD`, `commondir` equivalents.
2. **Workdir by platform:**
   - macOS/Windows: one recursive watcher on workdir; filter events after the fact
   - Linux: ignore-aware walk (`ignore` crate) → non-recursive per-directory watches; cap at `linuxWatchDirCap` (default 2000); fallback to polling on cap/ENOSPC
3. Default ignores: `node_modules`, `target`, `dist`, `build`, `.next`, `.venv`, `vendor`, `.cache` + user patterns
4. Debounce: 300 ms quiet, 2 s hard flush per repo
5. Coalesce: single in-flight job + pending flag per repo
6. Circuit breaker: event storm → polling mode with backoff retry

## Consequences
**Positive:**
- Catches commits, branch switches, staging, merges, fetches via metadata
- Linux inotify usage bounded
- Graceful degradation to polling
- Low CPU when idle

**Negative:**
- Workdir changes on Linux may have higher latency (polling fallback)
- macOS/Windows recursive watcher sees `node_modules` noise (filtered post-hoc)
- Complexity in event classification

---

# 0005 - No Auto-updater in v1

**Date:** 2026-11-09
**Status:** Accepted

## Context
Auto-updater requires code signing certificates (Apple Developer ID, Windows EV cert) and Tauri updater keys. The spec calls for unsigned v1 release.

## Decision
- Ship unsigned binaries (macOS ad-hoc signed only)
- No Tauri updater configuration
- Users manually download new versions from GitHub Releases
- Document Gatekeeper/SmartScreen workarounds in README

## Consequences
**Positive:**
- Zero cost for certificates
- Simpler release pipeline
- No updater attack surface

**Negative:**
- Manual update friction for users
- No delta updates
- macOS users must `xattr -dr com.apple.quarantine` or right-click Open

## Future
- Add auto-updater when signing infrastructure is in place (post-0.1)
- Consider Sparkle (macOS) / NSIS auto-updater (Windows) / AppImageUpdate (Linux)

---

# 0006 - Type-safe IPC via ts-rs

**Date:** 2026-11-09
**Status:** Accepted

## Context
Need compile-time safety for Rust ↔ TypeScript IPC boundary. Manual type definitions drift easily.

## Decision
- Use `ts-rs` derive on Rust models
- Binary `export_bindings` generates `src/lib/bindings.generated.ts`
- CI checks `git diff --exit-code` on generated file
- Contract tests: Rust serializes fixtures → JSON → Vitest asserts against TS types

## Consequences
**Positive:**
- Single source of truth in Rust
- Compile-time catching of breaking changes
- No runtime schema validation needed

**Negative:**
- `ts-rs` adds compile-time dependency
- Generated file must be committed (reviewed in PRs)
- Some complex types (e.g., `serde_json::Value`) map to `unknown`

## Alternatives Considered
| Alternative | Verdict |
|-------------|---------|
| `specta` + `tauri-specta` | Requires matching Tauri version; more complex setup |
| Manual TypeScript types | High drift risk; no compile-time guard |
| `tsify` (wasm) | Overkill; adds wasm build step |

---

# 0007 - Linux Tray: Menu Only (No Popover)

**Date:** 2026-11-09
**Status:** Accepted

## Context
Tauri's tray popover relies on tray icon click events and icon positioning, which are not reliably available on Linux (especially Wayland).

## Decision
- **macOS/Windows:** left-click → popover, right-click → menu
- **Linux:** tray menu only; no popover
- Linux menu: header line with aggregate counts, top 8 repos by urgency, Refresh all, Open GitPulse, Quit
- Clicking a repo in the Linux menu opens that repo in the main window

## Consequences
**Positive:**
- Reliable on all Linux DEs (GNOME with AppIndicator, KDE, Xfce)
- No Wayland positioning bugs
- Consistent with other tray apps (e.g., Discord, Slack)

**Negative:**
- Feature parity gap: no quick-glance popover on Linux
- Users must open main window for details

## Mitigation
- Document clearly in README
- "Open GitPulse" is prominent in Linux menu
- Main window opens fast (lazy webview creation)

---

*All ADRs are recorded in `docs/adr/NNNN-*.md` format.*