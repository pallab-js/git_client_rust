# GitPulse - UX Specification

**Version:** 0.1.0
**Date:** 2026-11-09

---

## 1. Principles

- **Dense but calm**: Information density for developers, not marketing.
- **Status triple-encoded**: Color + icon + text, never color alone.
- **Cached-first**: Render instantly from SQLite cache, refresh in background.
- **One primary action per surface**: Clear hierarchy.
- **Keyboard-complete**: No hover-only actions.
- **Respect system preferences**: Reduced motion, system theme.
- **Honest freshness**: Show fetch age and watcher mode where they affect trust.

---

## 2. Information Architecture

```
GitPulse
├─ Dashboard: sidebar (search, repo list, add) + overview pane
├─ Repo detail: header, changes (staged/unstaged/untracked/conflicted), diff viewer, tabs: Commits · Branches · Activity*
├─ Settings: General · Repositories · Notifications · Data & history · About
└─ Tray: popover (macOS/Windows) | native menu (Linux)
```
* Activity is stretch.

---

## 3. Surfaces

| Surface | Spec |
|---------|------|
| Main window | 1080×720 default; min 900×600; native decorations; created on demand, destroyed on close |
| Popover (mac/Win) | 380×520; undecorated; always on top; skip taskbar; hides on blur; positioned from tray icon rect and clamped to the monitor work area |
| Linux tray | Menu only (see TECH.md Capability Matrix) |
| Settings | Full-window route |
| Onboarding | Empty state inside Dashboard (no blocking wizard); Add and Scan actions; scan shows a checklist of candidates |
| Toasts | Bottom-right (main) / top (popover); auto-dismiss 4 s; errors persist; stack limit 3 |

**Platform notes:**
- **macOS**: template tray icon + optional title count; menu on right-click, popover on left-click (`show_menu_on_left_click(false)`).
- **Windows**: pre-rendered icon variants swapped at runtime plus tooltip; generate HiDPI variants at build time.
- **Linux**: avoid transparency/rounded-window effects; README must note the GNOME AppIndicator extension requirement.

---

## 4. Wireframes (Reference)

### DASHBOARD
```
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
```

### POPOVER (mac/Win)                     REPO DETAIL
```
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

---

## 5. Design Tokens

Defined in `src/styles/tokens.css` as CSS variables, with light and dark sets.

| Token | Dark | Light |
|-------|------|-------|
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

Spacing on a 4 px grid. Radii 8 px (controls), 12 px (cards). System UI font stack; 13 px base, 12 px in popover, 12 px monospace for SHAs/paths/diffs. Motion 120–180 ms ease-out, disabled under `prefers-reduced-motion`.

**Contrast task:** verify every text token pair ≥ 4.5:1 and non-text status colors ≥ 3:1; fix tokens if they fail.

---

## 6. Component Inventory

`Button` (primary, ghost, danger, icon) · `IconButton` (requires `aria-label`) · `Input`/`SearchInput` (150 ms debounce) · `Toggle` (accessible switch) · `Select` (native, styled) · `Badge`/`CountBadge` (caps at `99+`) · `StatusDot` (icon + color + tooltip) · `DivergencePill` (`↑2 ↓3`, with screen-reader text) · `RepoCard`/`RepoRow` · `ChangeRow` (status letter, path, line stats) · `DiffViewer` (hunk headers, +/- coloring, truncation banner, copy path, **text nodes only**) · `CommitList` · `BranchList` · `EmptyState` · `ErrorCard` (message, details disclosure, retry) · `Toast` · `ConfirmDialog` (destructive actions only) · `TrayPopover` (focus trap, Esc handling) · `ScanResultsChecklist`.

---

## 7. Keyboard

**P0:** complete Tab order, Enter to open, Esc to close/back, arrow-key selection in lists.
**P1 shortcuts:** `⌘/Ctrl+K` search · `⌘/Ctrl+R` refresh all · `⌘/Ctrl+,` settings · `⌘/Ctrl+O` add repo · `⌘/Ctrl+D` open dashboard from popover.

---

## 8. Accessibility

- Visible focus rings
- `aria-label` on icon-only buttons
- Popover traps focus and restores it on close
- Status via text + icon + color
- Skip-to-content link
- Reduced motion honored
- Polite live region announcing repo status transitions, **rate-limited** so storms of changes don't flood screen readers

---

## 9. Copy

Errors state what happened and what to do next; codes only under "Details". Staleness explicit.

Examples:
- "web is 7 commits behind origin/main (last fetch 3 h ago)"
- "app has 3 merge conflicts"
- "Repository moved or deleted. Locate it or remove it."
- "This folder is not a Git repository."

---

*This UX.md is derived from the implementation specification in `GITPULSE_IMPLEMENTATION_SPEC.md`.*