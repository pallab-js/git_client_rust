# GitPulse

GitPulse is a cross-platform, local-first desktop app for monitoring local Git repositories from a system tray and dashboard. It reads repository status and does not modify repositories or perform network operations.

## Features

- Monitor multiple local repositories
- Show branch, ahead/behind, and working-tree status
- View grouped changes, diffs, recent commits, and local branches
- System tray status with popover (macOS/Windows) and main dashboard
- Optional notifications, folder scan, and configurable settings
- Local-only storage; no telemetry or account

## Installation

Download binaries from the project Releases page:
https://github.com/pallab-js/git_client_rust/releases

Platform notes:
- macOS: app may be unsigned; allow it in system security settings if needed.
- Windows: SmartScreen may warn for unsigned builds.
- Linux: tray integration may require AppIndicator support depending on desktop environment.

## Development

Prerequisites:
- Rust (stable)
- Node.js 24+
- pnpm 10+
- Tauri platform dependencies for your OS

Common commands:
```bash
pnpm install
pnpm tauri dev
```

Build:
```bash
pnpm tauri build
```

## Configuration

Settings and local data are stored in the platform application data directory for `io.github.pallabpc.gitpulse`.

## Notes

- Ahead/behind counts are based on local refs; GitPulse does not run `git fetch`.
- GitPulse is read-only and does not stage, commit, fetch, pull, or push.

## License

MIT. See LICENSE for details.
