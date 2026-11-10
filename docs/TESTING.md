# GitPulse - Testing Strategy

**Version:** 0.1.0
**Date:** 2026-11-09

---

## Test Layers

| Layer | Coverage |
|-------|----------|
| Rust unit | Status scenarios, divergence, diff extraction/truncation/binary, scan (depth, caps, symlinks), path validation, debounce (mock clock), config atomicity, retention, fingerprint, revision bumping |
| Rust integration | Temp repos built with `git2`; watcher write-and-wait with timeouts/retries; DB migration + restart; corrupt config; forced inotify-limit fallback (Linux CI) |
| Frontend unit | Status precedence, formatting, stores, IPC error mapping, path shortening |
| Frontend component | RepoCard states, DiffViewer truncation + text-only rendering, Settings validation, popover focus trap, empty/error states, scan checklist |
| Contract | Generated-binding diff check + serde JSON fixtures ↔ TS assertions |
| Security | Malicious-content fixtures (HTML in names/messages, bidi characters, symlink loops) |
| Performance | 25- and 100-repo scripted fixtures + ≥ 1 large real repo; idle CPU/memory over 10 min; recorded at each gate and release |
| Manual QA | macOS arm64 (incl. Sequoia install flow), Windows 11, Ubuntu 22.04/24.04 (GNOME with extension, KDE); multi-monitor, HiDPI, Wayland and X11, moved repos, permission errors, detached/unborn, worktrees, submodules, unsafe-owner repo |

---

## Rust Unit Tests

### Status Scenarios
- Clean repo
- Modified files only
- Staged files only
- Mixed staged + unstaged
- Untracked files (including directories)
- Renamed files (detected via `renames_head_to_index`)
- Typechange (e.g., file → symlink)
- Submodule pointer changes (shown as modified, not recursed)
- Merge conflicts (both sides modified, deleted by us/them)
- Detached HEAD
- Unborn branch (no commits)
- Large repo (> 10k files) - measure latency

### Divergence
- Ahead only
- Behind only
- Diverged (both ahead and behind)
- No upstream configured
- Upstream deleted locally
- Multiple remotes (use first upstream)

### Diff Extraction
- Staged diff vs unstaged diff
- Binary file detection (NUL byte in first 8 KB)
- Truncation at 5,000 lines / 1 MB
- Untracked file rendering (all-added, up to 256 KB)
- Language hint from extension
- Symlink handling (show target)

### Scan
- Depth limit (1–8, default 3)
- Cap at 500 candidates
- Symlinks not followed
- Stops descending at first `.git` (including worktree `.git` files)
- Ignored patterns applied
- Cancellation via atomic flag
- Progress events emitted

### Path Validation
- Non-existent path → `REPO_NOT_FOUND`
- Not a git repo → `NOT_A_REPO`
- Bare repo → `BARE_REPO`
- Permission denied → `PERMISSION_DENIED`
- Unsafe ownership → `UNSAFE_OWNERSHIP`
- Invalid characters / path traversal → `INVALID_PATH`

### Debounce (Mock Clock)
- Quiet period flushes after 300 ms
- Hard deadline flushes after 2 s during stream
- Events after flush start new burst
- Coalescing: multiple events → single flush

### Config Atomicity
- Write to temp file + rename
- Windows rename over existing file handled
- Corrupt JSON → backup + defaults + warning
- Schema version mismatch → defaults + warning
- Validation on load and save

### Retention
- Snapshots older than `retentionDays` pruned
- Snapshots beyond `snapshotCapPerRepo` pruned (keep newest)
- Activity older than 90 days pruned
- `PRAGMA optimize` runs after prune

### Fingerprint
- Same fingerprint → no new snapshot (within 15 min)
- Different fingerprint → new snapshot
- Heartbeat at 15 min writes snapshot even if unchanged

### Revision Bumping
- Bumps on every completed job that observed an event
- Does not bump on polling-only jobs with no events
- `repo:updated` carries new revision

---

## Rust Integration Tests

### Temp Repo Helpers
Create test fixtures programmatically using `git2`:
```rust
fn init_repo() -> (tempfile::TempDir, git2::Repository) { ... }
fn commit_file(repo: &Repository, path: &str, content: &str) { ... }
fn stage_file(repo: &Repository, path: &str) { ... }
fn create_conflict(repo: &Repository) { ... }
```

### Watcher Tests
- Write file → event fires → debounce → status updated
- Stage file → metadata event → full refresh
- Switch branch → HEAD event → branch info updated
- Delete repo folder → watcher stops → repo marked unavailable
- Linux: force `ENOSPC` → repo switches to polling mode

### DB Migration
- Fresh DB → migration runs → tables exist
- Corrupt config → backup created → defaults loaded
- Concurrent read/write → no deadlock

---

## Frontend Unit Tests

### Status Precedence
```ts
expect(statusPriority('conflicted')).toBe(5)
expect(statusPriority('diverged')).toBe(4)
expect(statusPriority('behind')).toBe(3)
expect(statusPriority('dirty')).toBe(2)
expect(statusPriority('ahead')).toBe(1)
expect(statusPriority('clean')).toBe(0)
```

### Formatting
- `relativeTime`: just now, Xm ago, Xh ago, Xd ago, Xmo ago, Xy ago
- `shortenPath`: `~/code/foo/bar/baz` → `…/bar/baz`
- `escapeUnsafeText`: strips control chars, bidi overrides
- `formatCount`: 5 → "5", 150 → "99+"

### Stores
- `useRepos`: load, upsert, remove, select, sorting
- `useSettings`: load, update, local patch, theme application
- `useUi`: search, scan progress, toasts

### IPC Error Mapping
- `toAppError` handles: `AppError`, `Error`, string, unknown
- `errorText` extracts message

---

## Frontend Component Tests

### RepoCard
- Renders name, path, branch, divergence, status pill
- Shows badges for conflicted, dirty, behind, ahead, stashed, detached, unborn, polling
- Click calls `onSelect`
- Error state shows message + Locate/Remove buttons

### DiffViewer
- Empty state when no file selected
- Loading spinner
- Error card with retry
- Binary file message
- Truncation banner when `truncated: true`
- Line classification: meta, hunk, add, del, file-add, file-del, context, note
- Text-only rendering (no `dangerouslySetInnerHTML`)
- Copy path button

### Settings
- All sections render
- Toggles update settings via IPC
- Number fields validate min/max on blur
- Patterns field splits on newlines/commas
- Ignored patterns validation (no absolute paths, no `..`)
- Export diagnostics button calls IPC

### Popover
- Focus trap on mount
- Esc closes popover
- Cmd/Ctrl+D opens dashboard
- Cmd/Ctrl+R refreshes all
- Tab cycling within popover
- Repo list renders with correct badges
- Empty state shows "Open GitPulse" button

### Scan Checklist
- Shows progress (scanned, found, current path)
- Cancel button works
- Completed state shows checkboxes for each candidate
- "Add selected" calls `addRepos` IPC

---

## Contract Tests

### Generated Bindings
- `pnpm gen:bindings` produces `src/lib/bindings.generated.ts`
- CI fails if regenerated bindings differ from committed file
- Rust integration tests serialize representative payloads against committed JSON fixtures in `tests/fixtures/contract/`
- Vitest asserts the same fixtures against the generated types

### Fixture Examples
```json
// tests/fixtures/contract/RepoSummary.json
{
  "id": "01J...",
  "name": "app",
  "path": "/Users/x/code/app",
  "pinned": true,
  "primaryStatus": "dirty",
  "flags": { "dirty": true, "conflicted": false, "detached": false, "unborn": false },
  "branch": "main",
  "upstream": "origin/main",
  "ahead": 2,
  "behind": 0,
  "counts": { "staged": 1, "modified": 3, "untracked": 2, "conflicted": 0, "stashed": 1 },
  "lastCommit": { "sha": "abc123...", "summary": "Fix bug", "author": "Alice", "at": "2026-11-09T10:00:00Z" },
  "lastFetchAt": "2026-11-09T08:00:00Z",
  "watcher": "active",
  "revision": 42,
  "updatedAt": "2026-11-09T10:00:00Z",
  "error": null
}
```

---

## Security Tests

### Malicious Content Fixtures
- HTML in branch names: `<script>alert(1)</script>`
- HTML in commit messages
- HTML in file paths (where filesystem allows)
- Bidi override characters: `\u202E`, `\u202D`
- Symlink loops in worktree (scan should not follow)
- Very long strings (DoS via rendering)
- Unicode normalization attacks

### Verification
- All untrusted content rendered as text nodes only
- ESLint rule bans `dangerouslySetInnerHTML`
- No XSS in diff viewer, commit list, branch list, repo names

---

## Performance Tests

### Fixtures
- 25 repos: mix of small (100 files), medium (5k files), large (50k files)
- 100 repos: same distribution
- 1 real large repo (e.g., Linux kernel, ~70k files)

### Measurements
| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| Cold start to tray | < 500 ms | `time` from process start to tray icon visible |
| Popover render (cached) | < 150 ms | React profiler + manual timing |
| Popover render (cold) | < 600 ms | Same |
| Idle CPU (10 min) | < 0.5% | `top` / `htop` sampling |
| Quick status median | < 40 ms/repo | Instrumented `read_status` |
| 25 repos quick refresh | < 1 s | End-to-end from `refresh_all` |
| 100 repos quick refresh | < 3 s | End-to-end |
| Binary size | < 20 MB | `ls -lh` on artifacts |
| Rust core RSS (25 repos) | < 40 MB | `ps` / Activity Monitor |
| Tray-only RSS | < 60 MB | Same |
| Popover warm RSS | macOS < 200 MB, Win < 250 MB | Same |
| DB growth (30 days) | < 5 MB | SQLite `page_count * page_size` |

### Recording
- Results recorded in `docs/TECH.md` at each gate
- Deviations documented with justification

---

## Manual QA Matrix

| Scenario | macOS | Windows | Linux (GNOME) | Linux (KDE) |
|----------|-------|---------|---------------|-------------|
| Add repo via picker | ✓ | ✓ | ✓ | ✓ |
| Scan folder (depth 3) | ✓ | ✓ | ✓ | ✓ |
| Live file edit → status update < 1s | ✓ | ✓ | Polling fallback | Polling fallback |
| Branch switch → divergence update | ✓ | ✓ | ✓ | ✓ |
| Tray left-click → popover | ✓ | ✓ | Menu only | Menu only |
| Tray right-click → menu | ✓ | ✓ | ✓ | ✓ |
| Tray badge count updates | ✓ | ✓ | Menu header | Menu header |
| Popover positioning (multi-monitor) | ✓ | ✓ | N/A | N/A |
| Main window open/close/destroy | ✓ | ✓ | ✓ | ✓ |
| Settings persist across restart | ✓ | ✓ | ✓ | ✓ |
| Launch at login toggle | ✓ | ✓ | ✓ | ✓ |
| Theme switch (system/light/dark) | ✓ | ✓ | ✓ | ✓ |
| Notifications (opt-in) | ✓ | ✓ | ✓ | ✓ |
| Repo moved → Locate action | ✓ | ✓ | ✓ | ✓ |
| Repo deleted → Remove action | ✓ | ✓ | ✓ | ✓ |
| Bare repo rejected | ✓ | ✓ | ✓ | ✓ |
| Unsafe ownership error | ✓ | ✓ | ✓ | ✓ |
| Detached HEAD display | ✓ | ✓ | ✓ | ✓ |
| Unborn branch display | ✓ | ✓ | ✓ | ✓ |
| Linked worktree | ✓ | ✓ | ✓ | ✓ |
| Submodule change shown | ✓ | ✓ | ✓ | ✓ |
| HiDPI / fractional scaling | ✓ | ✓ | ✓ | ✓ |
| Wayland tray support | N/A | N/A | Check | Check |
| Reduced motion respected | ✓ | ✓ | ✓ | ✓ |
| High contrast mode | ✓ | ✓ | ✓ | ✓ |

---

## Test Commands

```bash
# Frontend
pnpm test --run          # Vitest
pnpm lint                # ESLint
pnpm exec tsc --noEmit   # TypeScript check

# Rust
cargo test --all         # Unit + integration
cargo fmt --all -- --check
cargo clippy --all-targets --all-features -- -D warnings

# Contract
pnpm gen:bindings && git diff --exit-code src/lib/bindings.generated.ts

# Full CI (all OSes via GitHub Actions)
# See .github/workflows/ci.yml
```

---

*This TESTING.md is derived from the implementation specification in `GITPULSE_IMPLEMENTATION_SPEC.md`.*