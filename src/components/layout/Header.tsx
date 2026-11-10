import { Activity, RefreshCw, Search, Settings } from "lucide-react";
import { useEffect } from "react";

import { pickAndAddRepo, refreshAllAction } from "../../lib/actions";
import { openDashboard, openSettings } from "../../lib/router";
import { IconButton } from "../ui/IconButton";

function isMac(): boolean {
  return typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent);
}

export function Header({ showSidebar }: { showSidebar: boolean }) {
  const modifier = isMac() ? "⌘" : "Ctrl";

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      if (!mod) return;
      const key = event.key.toLowerCase();
      if (key === "k") {
        const input = document.querySelector<HTMLInputElement>('input[type="search"]');
        if (input) {
          event.preventDefault();
          input.focus();
          input.select();
        }
      } else if (key === "r") {
        event.preventDefault();
        void refreshAllAction();
      } else if (key === ",") {
        event.preventDefault();
        openSettings();
      } else if (key === "o") {
        event.preventDefault();
        void pickAndAddRepo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-[var(--border)] bg-[var(--surface)] px-3">
      <button
        type="button"
        onClick={openDashboard}
        className="flex items-center gap-2 rounded-[8px] px-1.5 py-1 text-left hover:bg-[var(--surface-2)]"
        aria-label="GitPulse dashboard"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-[7px] bg-[var(--accent)] text-white">
          <Activity aria-hidden className="h-4 w-4" />
        </span>
        <span className="text-[14px] font-semibold tracking-tight text-[var(--text)]">GitPulse</span>
      </button>

      {showSidebar && (
        <button
          type="button"
          onClick={() => {
            document.querySelector<HTMLInputElement>('input[type="search"]')?.focus();
          }}
          className="ml-2 hidden h-7 items-center gap-2 rounded-[7px] border border-[var(--border)] bg-[var(--surface-2)] px-2.5 text-[12px] text-[var(--muted)] hover:text-[var(--text)] sm:flex"
          aria-label={`Search repositories (${modifier}K)`}
        >
          <Search aria-hidden className="h-3.5 w-3.5" />
          <span>Search</span>
          <kbd className="ml-3 rounded border border-[var(--border)] bg-[var(--surface)] px-1 font-sans text-[10px]">
            {modifier}K
          </kbd>
        </button>
      )}

      <div className="ml-auto flex items-center gap-1">
        <button
          type="button"
          onClick={() => void refreshAllAction()}
          className="hidden h-8 items-center gap-1.5 rounded-[8px] border border-[var(--border)] px-2.5 text-[12px] text-[var(--text)] hover:bg-[var(--surface-2)] sm:flex"
          aria-label={`Refresh all repositories (${modifier}R)`}
        >
          <RefreshCw aria-hidden className="h-3.5 w-3.5" />
          Refresh
        </button>
        <IconButton
          label="Refresh all repositories"
          className="sm:hidden"
          onClick={() => void refreshAllAction()}
        >
          <RefreshCw aria-hidden className="h-4 w-4" />
        </IconButton>
        <IconButton label={`Settings (${modifier},)`} onClick={openSettings}>
          <Settings aria-hidden className="h-4 w-4" />
        </IconButton>
      </div>
    </header>
  );
}
