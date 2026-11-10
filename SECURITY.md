# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.1.x   | ✅        |

Only the latest minor release receives security updates.

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, email **security@gitpulse.example.com** (replace with actual contact) with:

- A description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested mitigations

We will acknowledge receipt within 48 hours and provide a timeline for a fix. We aim to release patches for critical vulnerabilities within 7 days.

## Threat Model

GitPulse is a **local-first, read-only** Git repository monitor. The threat model assumes:

### Trust Boundaries
1. **User's machine** — Trusted. The app runs with the user's privileges.
2. **Repository content** — **Untrusted**. File paths, branch names, commit messages, diffs, and config files may contain malicious content.
3. **Network** — **Not used in v1**. Zero network I/O by design.
4. **External tools** — Editor/terminal launched via `opener` plugin; paths validated.

### Attack Vectors Considered

| Vector | Mitigation |
|--------|------------|
| XSS via repo content (branch names, commits, paths, diffs) | All untrusted content rendered as React text nodes; `dangerouslySetInnerHTML` banned by ESLint; control/bidi chars escaped |
| Path traversal | Canonicalization via `dunce`; reject paths outside repo workdir; validate in `launcher.rs` and diff reader |
| Symlink attacks | `notify` watchers ignore symlinks; `scan` never follows symlinks; `open_repo` validates workdir |
| SQL injection | Parameterized queries only (`rusqlite` prepared statements) |
| Shell injection | No shell plugin; `launcher.rs` uses argv arrays only; allowlisted editor CLIs |
| Malicious Git config | `git2` opens repos read-only; `update_index(false)`; no hooks executed |
| Binary diff DoS | Patch capped at 5,000 lines / 1 MB; untracked files read max 256 KB; binary detection via NUL byte |
| Resource exhaustion | Watcher caps (Linux: 2000 dirs/repo); debounce (300 ms/2 s); scheduler semaphore (max 4 concurrent); circuit breaker on event storms |
| Config corruption | Atomic writes (temp + rename); backup on corruption; schema versioning |

### Out of Scope (v1)
- Network-based attacks (no network I/O)
- Auto-updater supply chain (no auto-updater)
- Plugin system (no plugins beyond allowlisted Tauri plugins)
- Multi-user/shared machine isolation (single-user app)

## Security Checklist (Release Gate)

Before each release, verify:

- [ ] `capabilities/default.json` contains only: core window, dialog, notification, opener, autostart
- [ ] No `shell`/`fs` plugin in `Cargo.toml` or `package.json`
- [ ] CSP set: `default-src 'self'; img-src 'self' asset: data:; script-src 'self'`
- [ ] ESLint rule bans `dangerouslySetInnerHTML`
- [ ] `launcher.rs` is the only place using `std::process::Command`; argv arrays only
- [ ] All SQL parameterized
- [ ] Malicious-content fixtures pass (HTML in names/messages, bidi chars, symlink loops)
- [ ] No network crates reachable (`cargo tree` review); `git2` has `default-features = false`

## Disclosure Timeline

1. **Day 0** — Vulnerability reported privately
2. **Day 1-2** — Acknowledgment and initial assessment
3. **Day 3-7** — Fix developed and tested
4. **Day 7** — Patch released (critical) or scheduled (non-critical)
5. **Day 7+** — Public disclosure after fix is available

## Security-Related Configuration

Users can harden their setup:
- **Disable notifications** (default) to reduce attack surface
- **Set watch mode to polling** if filesystem watchers are a concern
- **Configure ignored patterns** to skip sensitive directories
- **Do not set a custom editor** unless trusted (uses allowlist + argv)

## Contact

For security questions or concerns, email **security@gitpulse.example.com**.

*PGP key available on request.*