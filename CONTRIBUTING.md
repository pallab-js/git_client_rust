# Contributing to GitPulse

Thank you for your interest in contributing! This document outlines the process and standards for contributing to GitPulse.

## Code of Conduct

This project follows the [Contributor Covenant 2.1](CODE_OF_CONDUCT.md). By participating, you agree to uphold this code.

## Getting Started

### Prerequisites
- Rust (stable, via `rustup`)
- Node.js 24+ and pnpm 10+
- CMake (for libgit2-sys)
- Platform-specific dependencies (see README)

### Development Setup
```bash
git clone https://github.com/<owner>/gitpulse.git
cd gitpulse
pnpm install
pnpm tauri dev
```

### Running Tests
```bash
# Frontend
pnpm test --run
pnpm lint
pnpm exec tsc --noEmit

# Rust
cd src-tauri
cargo test --all
cargo fmt --all -- --check
cargo clippy --all-targets --all-features -- -D warnings

# Contract
pnpm gen:bindings && git diff --exit-code src/lib/bindings.generated.ts
```

## Development Workflow

1. **Fork** the repository
2. **Create a branch** from `main` with a descriptive name:
   - `feat/short-description` for new features
   - `fix/short-description` for bug fixes
   - `docs/short-description` for documentation
   - `refactor/short-description` for code improvements
3. **Make changes** following the coding standards below
4. **Run all checks** locally before pushing
5. **Open a Pull Request** against `main`

## Coding Standards

### Rust
- **No `unwrap()`/`expect()`/panics** in command, watcher, scheduler, DB, or git paths
- Use `thiserror` for error types; return `AppResult<T>` from fallible functions
- Run `cargo fmt` and `cargo clippy -D warnings` before committing
- Prefer `anyhow` only in tests/binaries; library code uses typed errors
- Document public APIs with `///` comments

### TypeScript/React
- **Strict TypeScript** (`noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`)
- **No `dangerouslySetInnerHTML`** — banned by ESLint
- Run `pnpm lint` and `pnpm exec tsc --noEmit` before committing
- Use functional components with hooks
- Prefer `zustand` for state; avoid prop drilling
- CSS: Tailwind utility classes; component styles in `tokens.css` variables

### Git Commits
Follow [Conventional Commits](https://www.conventionalcommits.org/):
```
<type>(<scope>): <description>

[optional body]

[optional footer]
```
Types: `feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `chore`, `build`, `ci`

Examples:
```
feat(git): add support for submodule status detection
fix(watcher): handle ENOSPC gracefully on Linux
docs(readme): update installation instructions for Windows
refactor(ui): extract DiffViewer line classification
```

### Pull Requests
- Fill out the PR template completely
- Link related issues (`Closes #123`)
- Ensure all CI checks pass
- Keep PRs focused; large changes should be split
- Update documentation for user-facing changes
- Add tests for new functionality

## Architecture Guidelines

### Dependency Rules
- `commands` → `git` / `watch` / `store`
- `git` and `store` **never** import Tauri types
- `git::*` functions are pure, read-only functions of path + options

### Threading
- Main thread: Tauri host, tray events, window commands only
- Git jobs: `spawn_blocking`; never share `git2::Repository` across threads
- DB: Single `Mutex<Connection>` from `spawn_blocking`
- Scheduler: Bounded channel + semaphore (max 4 concurrent), one in-flight per repo

### Security
- No shell, no fs plugin, no network crates
- All SQL parameterized
- Canonicalize paths; reject bare repos
- `git2` with `default-features = false`

## Testing Requirements

- **Rust unit tests** for all pure functions (status, diff, scan, debounce, config, retention)
- **Rust integration tests** using `tempfile` + `git2` for realistic repos
- **Frontend unit tests** for formatters, stores, status logic
- **Frontend component tests** for key components (DiffViewer, RepoCard, Settings, Popover)
- **Contract tests** for generated bindings (CI fails on drift)
- **Manual QA** on all three platforms for UI changes

## Performance Budgets

Changes must not regress:
- Cold start to tray < 500 ms
- Popover render (cached) < 150 ms
- Quick status median < 40 ms/repo (< 10k files)
- Idle CPU < 0.5% (25 repos, 10 min avg)
- Binary size < 20 MB per platform

## Documentation

- Update `README.md` for user-facing changes
- Update `docs/` for architecture/design changes
- Record ADRs for significant decisions (`docs/adr/NNNN-*.md`)
- Update `CHANGELOG.md` under "Unreleased" section

## Release Process

Maintainers only:
1. Update version in `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`
2. Update `CHANGELOG.md` with release notes
3. Create and push tag: `git tag v0.x.x && git push origin v0.x.x`
4. GitHub Actions builds and publishes release artifacts
5. Verify artifacts on clean machines
6. Publish release (draft → published)

## Questions?

Open a [discussion](https://github.com/<owner>/gitpulse/discussions) or [issue](https://github.com/<owner>/gitpulse/issues).