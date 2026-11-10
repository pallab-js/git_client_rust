# GitPulse

> Your repositories, at a glance.

GitPulse is a cross-platform, local-first Git repository monitor that lives in your system tray. It watches your local repositories and shows live branch status, uncommitted changes, and divergence — all without ever making a network request or modifying your repositories.

![GitPulse screenshot](docs/screenshot.png)

## Features

- **System tray presence** — Aggregate status at a glance; left-click for a compact popover (macOS/Windows)
- **Live updates** — Filesystem watchers + debounced Git status; changes appear within ~1 second
- **Multi-repo dashboard** — Search, pin, reorder; sort by attention (conflicts → behind → dirty → ahead → clean)
- **Repo detail view** — Grouped changes (staged/unstaged/untracked/conflicts), unified diff, recent commits, local branches
- **Read-only, local-first** — Never stages, commits, fetches, pulls, or pushes. Zero network I/O.
- **Smart notifications** — Opt-in, transition-driven, rate-limited (conflicts, behind threshold, dirty threshold)
- **Folder scanning** — Discover repos up to 5 levels deep, skipping heavy build folders
- **Cross-platform** — macOS (arm64 + x64), Windows (x64), Linux (x64 AppImage/deb)
- **Keyboard complete** — Full Tab navigation, shortcuts (⌘K search, ⌘R refresh, ⌘O add repo, ⌘, settings, ⌘D dashboard from popover)
- **Accessible** — WCAG 2.1 AA contrast, focus rings, reduced motion, screen-reader friendly
- **Privacy respecting** — No telemetry, no accounts, no cloud sync. Everything stays on your machine.

## Installation

### macOS
Download the latest `.dmg` from [Releases](https://github.com/pallab-js/git_client_rust/releases).  
**Note:** The app is unsigned. On first open, right-click the app and choose **Open**, or run:
```bash
xattr -dr com.apple.quarantine /Applications/GitPulse.app
```

### Windows
Download the latest `.exe` (NSIS installer) from [Releases](https://github.com/pallab-js/git_client_rust/releases).  
**Note:** Windows SmartScreen may warn about an unrecognized app. Click **More info → Run anyway**.

### Linux
Download the latest `.AppImage` or `.deb` from [Releases](https://github.com/pallab-js/git_client_rust/releases).

**AppImage:**
```bash
chmod +x GitPulse-*.AppImage
./GitPulse-*.AppImage
```

**Debian/Ubuntu:**
```bash
sudo dpkg -i gitpulse_*.deb
sudo apt-get install -f  # pull dependencies if needed
```

**GNOME requirement:** The system tray requires the **AppIndicator** extension. Install it via your distribution's extension manager or:
```bash
# Ubuntu/Fedora
sudo apt install gnome-shell-extension-appindicator   # Ubuntu
sudo dnf install gnome-shell-extension-appindicator   # Fedora
```
Then enable it in **Extensions** → **AppIndicator and KStatusNotifierItem Support**.

## Quick Start

1. Launch GitPulse — it starts in the tray (or shows the dashboard on first run)
2. Click **Add repo** or **Scan a folder** to select your Git repositories
3. GitPulse will show each repo's branch, ahead/behind count, and working-tree status
4. Left-click the tray icon (macOS/Windows) for a quick popover; click **Open dashboard** for the full view
5. Click a repository to see detailed changes, diffs, and commit history

## Configuration

All settings are stored locally in:
- **macOS:** `~/Library/Application Support/io.github.pallab-js.gitpulse/`
- **Windows:** `%APPDATA%\io.github.pallab-js.gitpulse\`
- **Linux:** `~/.config/io.github.pallab-js.gitpulse/` or `$XDG_CONFIG_HOME/io.github.pallab-js.gitpulse/`

### Settings (via Dashboard → Settings)

| Section | Options |
|---------|---------|
| **General** | Theme (system/light/dark), start minimized, launch at login, show dock icon (macOS), keep popover warm, tray badge basis (attention/dirty/conflicted), watcher mode, poll intervals |
| **Repositories** | Add/remove/scan, pin, reorder, per-repo watch mode (auto/polling), locate moved repos |
| **Notifications** | Enable (off by default), conflicts, behind threshold, dirty threshold, rate limit |
| **Data & History** | Retention days, snapshots per repo, ignored folder patterns, export diagnostics |
| **About** | Version, keyboard shortcuts, license |

## Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Search repositories | `⌘/Ctrl+K` |
| Refresh all | `⌘/Ctrl+R` |
| Add repository | `⌘/Ctrl+O` |
| Open settings | `⌘/Ctrl+,` |
| Open dashboard (from popover) | `⌘/Ctrl+D` |
| Close popover / back | `Esc` |
| Navigate lists | `↑/↓`, `Enter` to select |

## Known Limitations

- **Ahead/behind is local only** — Counts are computed against local remote-tracking refs. "Behind" only updates after you (or another tool) run `git fetch`. All divergence info shows "as of last fetch" with the fetch age.
- **No Git write operations** — GitPulse never stages, commits, fetches, pulls, or pushes. Use your editor/terminal for those.
- **Linux popover** — Not available on Linux due to Wayland/tray limitations. Use the tray menu or main window.
- **Unsigned binaries** — See installation notes for each platform.

## Building from Source

### Prerequisites
- **Rust** (stable, via `rustup`)
- **Node.js** 24+ and **pnpm** 10+
- **CMake** (for libgit2-sys)
- **Platform deps:**
  - macOS: Xcode Command Line Tools
  - Windows: Visual Studio Build Tools + WebView2
  - Linux: `libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf build-essential`

### Build
```bash
git clone https://github.com/pallab-js/git_client_rust.git
cd gitpulse
pnpm install
pnpm tauri build
```
Artifacts in `src-tauri/target/release/bundle/`.

### Development
```bash
pnpm tauri dev
```

## Architecture

```
┌─────────────────────┐     typed invoke + events      ┌──────────────────────┐
│   React UI (WebView) │ ◄────────────────────────────► │   Tauri Host (Rust)  │
│ Dashboard · Detail  │                                 │  git2 · notify · SQLite │
│ Settings · Popover  │                                 │  tray · windows · IPC   │
└─────────────────────┘                                 └──────────────────────┘
```

- **Rust core**: `git2` for Git operations, `notify` for filesystem events, `rusqlite` for persistence, `tokio` for async
- **Frontend**: React 19, TypeScript, Vite, Tailwind 4, Zustand
- **IPC**: Type-safe via `ts-rs` generated bindings (checked in CI)

## Security

- **Zero network I/O** — `git2` built without OpenSSL/SSH/HTTPS features
- **No shell execution** — Only `opener` plugin for "Open in editor" / "Reveal"
- **Capability allowlist** — core window, dialog, notification, opener, autostart only
- **CSP** — `default-src 'self'; img-src 'self' asset: data:; script-src 'self'`
- **Untrusted content** — All repo data rendered as text nodes; `dangerouslySetInnerHTML` banned by ESLint
- **SQL injection prevention** — Parameterized queries only
- **Path validation** — Canonicalization, symlink rejection, bare repo rejection

See [SECURITY.md](SECURITY.md) for vulnerability reporting.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, coding standards, and PR process.

## License

MIT License — see [LICENSE](LICENSE) for details.

## Roadmap (Post 0.1)

- Opt-in `git fetch` with credential helper/SSH agent support
- Auto-updater with signed releases
- Syntax-highlighted diffs (via `syntect`/`tree-sitter`)
- GitHub/GitLab integration (PR status, CI checks)
- Worktree & submodule improvements
- i18n support

---

*GitPulse is not affiliated with Git or GitHub. "Git" is a trademark of Software Freedom Conservancy.*