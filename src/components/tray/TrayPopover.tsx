import { Activity, ArrowRight, RefreshCw, Settings as SettingsIcon } from "lucide-react";
import { useEffect, useRef } from "react";

import { openMainRepo, openMainRoute, refreshAllAction } from "../../lib/actions";
import { formatCount } from "../../lib/format";
import { ipc } from "../../lib/ipc";
import { hideCurrentWindow } from "../../lib/surface";
import { useRepos } from "../../stores/repos";
import { useUi } from "../../stores/ui";
import { RepoRow } from "../repo/RepoRow";
import { Button } from "../ui/Button";
import { Spinner } from "../ui/EmptyState";
import { IconButton } from "../ui/IconButton";
import { ToastHost } from "../ui/Toast";

export function TrayPopover() {
  const repos = useRepos((state) => state.repos);
  const loading = useRepos((state) => state.loading);
  const loaded = useRepos((state) => state.loaded);
  const load = useRepos((state) => state.load);
  const select = useRepos((state) => state.select);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const focusable = () =>
      Array.from(
        container.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.offsetParent !== null);

    focusable()[0]?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        void hideCurrentWindow();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "d") {
        event.preventDefault();
        void dashboard();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "r") {
        event.preventDefault();
        void refreshAllAction();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const attention = repos.filter(
    (repo) => repo.flags.conflicted || repo.flags.dirty || repo.behind > 0,
  );
  const polling = repos.some((repo) => repo.watcher === "polling");
  const { addToast } = useUi.getState();

  async function dashboard() {
    await openMainRoute("dashboard");
    await hideCurrentWindow();
  }

  async function openRepo(id: string) {
    select(id);
    await openMainRepo(id);
    await hideCurrentWindow();
  }

  async function openSettings() {
    await openMainRoute("settings");
    await hideCurrentWindow();
  }

  async function refresh() {
    try {
      await ipc.refreshAll();
      addToast({ tone: "info", title: "Refreshing all repositories" });
    } catch (error) {
      addToast({
        tone: "danger",
        title: "Could not refresh repositories",
        message: error instanceof Error ? error.message : "Try again in a moment.",
        sticky: true,
      });
    }
  }

  return (
    <div
      ref={containerRef}
      className="flex h-full flex-col border border-[var(--border)] bg-[var(--bg)]"
    >
      <header
        data-tauri-drag-region
        className="drag-region flex h-10 shrink-0 items-center gap-2 border-b border-[var(--border)] bg-[var(--surface)] px-2.5"
      >
        <span className="flex h-5 w-5 items-center justify-center rounded-[6px] bg-[var(--accent)] text-white">
          <Activity aria-hidden className="h-3.5 w-3.5" />
        </span>
        <span className="text-[12px] font-semibold tracking-tight text-[var(--text)]">GitPulse</span>
        <span className="text-[11px] text-[var(--muted)]">
          {repos.length === 0
            ? "No repositories"
            : attention.length === 0
              ? "All clean"
              : `${formatCount(attention.length)} need attention`}
        </span>
        <div className="no-drag ml-auto flex items-center gap-0.5">
          <IconButton label="Refresh all repositories" size="sm" onClick={() => void refresh()}>
            <RefreshCw aria-hidden className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton label="Open settings" size="sm" onClick={() => void openSettings()}>
            <SettingsIcon aria-hidden className="h-3.5 w-3.5" />
          </IconButton>
        </div>
      </header>

      {polling && (
        <p className="shrink-0 border-b border-[var(--border)] px-3 py-1 text-[10px] text-[var(--muted)]">
          Some repositories are using polling mode.
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {loading && repos.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <Spinner />
          </div>
        ) : repos.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
            <p className="text-[12px] text-[var(--text)]">No repositories yet</p>
            <p className="text-[11px] text-[var(--muted)]">
              Open the dashboard to add or scan a folder.
            </p>
            <Button size="sm" variant="primary" onClick={() => void dashboard()}>
              Open GitPulse
            </Button>
          </div>
        ) : (
          <div className="space-y-px">
            {repos.map((repo) => (
              <RepoRow
                key={repo.id}
                summary={repo}
                pinned={repo.pinned}
                compact
                onSelect={(id) => void openRepo(id)}
              />
            ))}
          </div>
        )}
      </div>

      <footer className="shrink-0 border-t border-[var(--border)] bg-[var(--surface)] p-2">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-between"
          onClick={() => void dashboard()}
        >
          <span className="flex items-center gap-1.5">
            Open dashboard
            <ArrowRight aria-hidden className="h-3.5 w-3.5" />
          </span>
          <kbd className="rounded border border-[var(--border)] px-1 font-sans text-[10px] text-[var(--muted)]">
            ⌘D
          </kbd>
        </Button>
      </footer>

      <ToastHost surface="popover" />
    </div>
  );
}
