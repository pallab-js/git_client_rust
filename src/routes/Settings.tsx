import {
  ArrowLeft,
  Database,
  FolderSearch,
  Info,
  Pin,
  PinOff,
  Plus,
  SlidersHorizontal,
  Bell,
  Trash2,
  Download,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { open } from "@tauri-apps/plugin-dialog";

import type { Settings as SettingsModel, Theme } from "../lib/bindings.generated";
import {
  exportDiagnosticsAction,
  notify,
  notifyError,
  pickAndAddRepo,
  pickAndScan,
} from "../lib/actions";
import { cn } from "../lib/cn";
import { escapeUnsafeText, relativeTime, shortenPath } from "../lib/format";
import { ipc } from "../lib/ipc";
import { openDashboard } from "../lib/router";
import { useRepos } from "../stores/repos";
import { defaultNotifications, useSettings } from "../stores/settings";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { Spinner } from "../components/ui/EmptyState";
import { Select, Input } from "../components/ui/Field";
import { IconButton } from "../components/ui/IconButton";
import { Toggle } from "../components/ui/Toggle";

const SECTIONS = [
  { id: "general", label: "General", icon: SlidersHorizontal },
  { id: "repositories", label: "Repositories", icon: Database },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "data", label: "Data & history", icon: Download },
  { id: "about", label: "About", icon: Info },
];

export function Settings() {
  const settings = useSettings((state) => state.settings);
  const loading = useSettings((state) => state.loading);
  const load = useSettings((state) => state.load);
  const updateSettings = useSettings((state) => state.update);
  const repos = useRepos((state) => state.repos);
  const upsert = useRepos((state) => state.upsert);
  const remove = useRepos((state) => state.remove);
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!settings) void load();
  }, [settings, load]);

  async function save(update: Parameters<typeof updateSettings>[0], message?: string) {
    setBusy(true);
    try {
      await updateSettings(update);
      if (message) notify("success", message);
    } catch (error) {
      notifyError(error, "Could not save this setting");
      void load();
    } finally {
      setBusy(false);
    }
  }

  if (!settings) {
    return (
      <div className="flex h-full items-center justify-center">
        {loading ? <Spinner /> : <p className="text-[13px] text-[var(--muted)]">Settings unavailable.</p>}
      </div>
    );
  }

  const notifications = settings.notifications ?? defaultNotifications();
  const removing = repos.find((repo) => repo.id === removeId) ?? null;

  async function togglePin(id: string, pinned: boolean) {
    try {
      await ipc.setRepoPinned(id, pinned);
      const repo = repos.find((item) => item.id === id);
      if (repo) upsert({ ...repo, pinned });
    } catch (error) {
      notifyError(error, "Could not update the pin");
    }
  }

  async function changeWatchMode(id: string, mode: "auto" | "polling") {
    try {
      const summary = await ipc.setRepoWatchMode(id, mode);
      upsert(summary);
    } catch (error) {
      notifyError(error, "Could not change the watch mode");
    }
  }

  async function locateRepo(id: string) {
    try {
      const selected = await open({ directory: true, multiple: false, title: "Locate repository" });
      if (typeof selected !== "string") return;
      const summary = await ipc.locateRepo(id, selected);
      upsert(summary);
      notify("success", "Repository relocated");
    } catch (error) {
      notifyError(error, "Could not relocate this repository");
    }
  }

  async function doRemove() {
    if (!removeId) return;
    const id = removeId;
    setRemoveId(null);
    try {
      await ipc.removeRepo(id);
      remove(id);
      notify("success", "Repository removed", "Your files were not changed.");
    } catch (error) {
      notifyError(error, "Could not remove this repository");
    }
  }

  return (
    <div className="mx-auto max-w-5xl p-4">
      <div className="flex items-center gap-3">
        <IconButton label="Back to dashboard" onClick={openDashboard}>
          <ArrowLeft aria-hidden className="h-4 w-4" />
        </IconButton>
        <div>
          <h1 className="text-[18px] font-semibold tracking-tight text-[var(--text)]">Settings</h1>
          <p className="text-[12px] text-[var(--muted)]">
            Changes apply immediately and are stored locally.
          </p>
        </div>
        {busy && <Spinner className="ml-1 h-3.5 w-3.5" />}
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-[180px_minmax(0,1fr)]">
        <nav aria-label="Settings sections" className="flex gap-1 overflow-x-auto md:flex-col">
          {SECTIONS.map((section) => {
            const Icon = section.icon;
            return (
              <button
                key={section.id}
                type="button"
                onClick={() => {
                  document.getElementById(`settings-${section.id}`)?.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
                  });
                }}
                className="inline-flex shrink-0 items-center gap-2 rounded-[8px] px-2.5 py-1.5 text-left text-[12px] text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
              >
                <Icon aria-hidden className="h-3.5 w-3.5" />
                {section.label}
              </button>
            );
          })}
        </nav>

        <div className="space-y-4">
          <Section id="general" title="General" description="Appearance, startup, and background behavior.">
            <div className="grid gap-3 sm:grid-cols-2">
              <Select
                label="Theme"
                value={settings.theme}
                onChange={(event) => void save({ theme: event.target.value as Theme })}
              >
                <option value="system">System</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </Select>
              <Select
                label="Tray badge basis"
                value={settings.trayBadgeBasis}
                onChange={(event) =>
                  void save({ trayBadgeBasis: event.target.value as SettingsModel["trayBadgeBasis"] })
                }
                hint="What the tray count represents."
              >
                <option value="attention">Needs attention</option>
                <option value="dirty">Dirty repositories</option>
                <option value="conflicted">Conflicted repositories</option>
              </Select>
            </div>
            <Toggle
              checked={settings.startMinimized}
              onChange={(checked) => void save({ startMinimized: checked })}
              label="Start minimized"
              description="Launch into the tray instead of opening the dashboard."
            />
            <Toggle
              checked={settings.launchAtLogin}
              onChange={(checked) => void save({ launchAtLogin: checked })}
              label="Launch at login"
              description="GitPulse starts with your computer and stays in the tray."
            />
            <Toggle
              checked={settings.keepPopoverWarm}
              onChange={(checked) => void save({ keepPopoverWarm: checked })}
              label="Keep popover ready"
              description="Keeps the tray popover loaded for faster opening. Uses a small amount of memory."
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <Select
                label="Show dock icon"
                value={settings.showDockIcon}
                onChange={(event) =>
                  void save({ showDockIcon: event.target.value as SettingsModel["showDockIcon"] })
                }
                hint="macOS only."
              >
                <option value="whenWindowOpen">When a window is open</option>
                <option value="always">Always</option>
                <option value="never">Never</option>
              </Select>
              <Select
                label="Watcher mode"
                value={settings.watchMode}
                onChange={(event) =>
                  void save({ watchMode: event.target.value as SettingsModel["watchMode"] })
                }
                hint="Polling is a fallback for unreliable file events."
              >
                <option value="auto">Automatic</option>
                <option value="polling">Polling</option>
              </Select>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <NumberField
                label="Reconcile interval"
                suffix="seconds"
                value={settings.reconcileIntervalSec}
                min={5}
                max={300}
                onCommit={(value) => void save({ reconcileIntervalSec: value })}
              />
              <NumberField
                label="Idle poll interval"
                suffix="seconds"
                value={settings.idlePollIntervalSec}
                min={30}
                max={3600}
                onCommit={(value) => void save({ idlePollIntervalSec: value })}
              />
              <NumberField
                label="Linux watch directory cap"
                suffix="dirs / repo"
                value={settings.linuxWatchDirCap}
                min={100}
                max={10000}
                onCommit={(value) => void save({ linuxWatchDirCap: value })}
              />
            </div>
          </Section>

          <Section
            id="repositories"
            title="Repositories"
            description="Manage what GitPulse monitors. GitPulse never changes your repositories."
            action={
              <div className="flex gap-1.5">
                <Button size="sm" variant="primary" onClick={() => void pickAndAddRepo()}>
                  <Plus aria-hidden className="h-3.5 w-3.5" />
                  Add
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void pickAndScan()}>
                  <FolderSearch aria-hidden className="h-3.5 w-3.5" />
                  Scan
                </Button>
              </div>
            }
          >
            {repos.length === 0 ? (
              <p className="py-4 text-[12px] text-[var(--muted)]">
                No repositories yet. Add a folder to get started.
              </p>
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {repos.map((repo) => (
                  <li key={repo.id} className="flex flex-wrap items-center gap-2 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-[13px] font-medium text-[var(--text)]">
                          {escapeUnsafeText(repo.name)}
                        </span>
                        {repo.pinned && <Badge tone="neutral">Pinned</Badge>}
                        {repo.primaryStatus === "unavailable" && (
                          <Badge tone="danger">Unavailable</Badge>
                        )}
                      </div>
                      <p className="mono truncate text-[11px] text-[var(--muted)]" title={repo.path}>
                        {shortenPath(repo.path, 64)}
                      </p>
                      <p className="text-[11px] text-[var(--muted)]">
                        {repo.branch ?? "detached"} · updated {relativeTime(repo.updatedAt)}
                      </p>
                    </div>
                    <Select
                      aria-label={`Watch mode for ${repo.name}`}
                      value={repo.watcher === "polling" ? "polling" : "auto"}
                      onChange={(event) =>
                        void changeWatchMode(repo.id, event.target.value as "auto" | "polling")
                      }
                      className="h-7 w-[104px]"
                    >
                      <option value="auto">Auto</option>
                      <option value="polling">Polling</option>
                    </Select>
                    {repo.primaryStatus === "unavailable" && (
                      <Button size="sm" variant="ghost" onClick={() => void locateRepo(repo.id)}>
                        Locate
                      </Button>
                    )}
                    <IconButton
                      label={repo.pinned ? `Unpin ${repo.name}` : `Pin ${repo.name}`}
                      size="sm"
                      onClick={() => void togglePin(repo.id, !repo.pinned)}
                    >
                      {repo.pinned ? (
                        <PinOff aria-hidden className="h-3.5 w-3.5" />
                      ) : (
                        <Pin aria-hidden className="h-3.5 w-3.5" />
                      )}
                    </IconButton>
                    <IconButton
                      label={`Remove ${repo.name}`}
                      size="sm"
                      onClick={() => setRemoveId(repo.id)}
                    >
                      <Trash2 aria-hidden className="h-3.5 w-3.5" />
                    </IconButton>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section
            id="notifications"
            title="Notifications"
            description="Optional, transition-driven, and rate-limited per repository."
          >
            <Toggle
              checked={notifications.enabled}
              onChange={(checked) =>
                void save({ notifications: { ...notifications, enabled: checked } })
              }
              label="Enable notifications"
              description="Off by default. GitPulse only notifies on meaningful transitions."
            />
            <Toggle
              checked={notifications.conflicts}
              onChange={(checked) =>
                void save({ notifications: { ...notifications, conflicts: checked } })
              }
              label="Merge conflicts"
              description="Notify when a repository gains merge conflicts."
              disabled={!notifications.enabled}
            />
            <div className="grid gap-3 sm:grid-cols-3">
              <NumberField
                label="Notify when behind"
                suffix="commits"
                value={notifications.behindThreshold}
                min={1}
                max={10000}
                onCommit={(value) =>
                  void save({ notifications: { ...notifications, behindThreshold: value } })
                }
                disabled={!notifications.enabled}
              />
              <NumberField
                label="Notify when changed files reach"
                suffix="files"
                value={notifications.dirtyThreshold}
                min={1}
                max={100000}
                onCommit={(value) =>
                  void save({ notifications: { ...notifications, dirtyThreshold: value } })
                }
                disabled={!notifications.enabled}
              />
              <NumberField
                label="Rate limit"
                suffix="minutes"
                value={notifications.rateLimitMinutes}
                min={1}
                max={1440}
                onCommit={(value) =>
                  void save({ notifications: { ...notifications, rateLimitMinutes: value } })
                }
                disabled={!notifications.enabled}
              />
            </div>
          </Section>

          <Section
            id="data"
            title="Data & history"
            description="History is stored in a local SQLite database and pruned automatically."
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <NumberField
                label="Keep history for"
                suffix="days"
                value={settings.retentionDays}
                min={1}
                max={365}
                onCommit={(value) => void save({ retentionDays: value })}
              />
              <NumberField
                label="Snapshots per repository"
                suffix="max"
                value={settings.snapshotCapPerRepo}
                min={50}
                max={5000}
                onCommit={(value) => void save({ snapshotCapPerRepo: value })}
              />
            </div>
            <PatternsField
              patterns={settings.ignoredPatterns}
              onCommit={(patterns) => void save({ ignoredPatterns: patterns })}
            />
            <div className="rounded-[8px] border border-[var(--border)] bg-[var(--surface-2)] p-3">
              <p className="text-[12px] text-[var(--text)]">Diagnostics export</p>
              <p className="mt-0.5 text-[11px] text-[var(--muted)]">
                Includes app version, platform, settings, repository paths, and status. It does not
                include file contents or commit messages. You choose where to save it.
              </p>
              <Button
                size="sm"
                variant="ghost"
                className="mt-2"
                onClick={() => void exportDiagnosticsAction()}
              >
                <Download aria-hidden className="h-3.5 w-3.5" />
                Export diagnostics…
              </Button>
            </div>
          </Section>

          <Section id="about" title="About" description="GitPulse 0.1.0">
            <dl className="grid gap-2 text-[12px] sm:grid-cols-2">
              <AboutRow label="Version" value="0.1.0" />
              <AboutRow label="Bundle ID" value="io.github.pallabpc.gitpulse" />
              <AboutRow label="Local-first" value="No network requests, no telemetry, no account." />
              <AboutRow label="Read-only" value="Never stages, commits, fetches, pulls, or pushes." />
            </dl>
            <div className="rounded-[8px] border border-[var(--border)] p-3 text-[12px] text-[var(--muted)]">
              <p className="font-medium text-[var(--text)]">Keyboard shortcuts</p>
              <ul className="mt-1 space-y-0.5">
                <li>Search repositories: ⌘/Ctrl+K</li>
                <li>Refresh all: ⌘/Ctrl+R</li>
                <li>Add repository: ⌘/Ctrl+O</li>
                <li>Settings: ⌘/Ctrl+,</li>
                <li>Open dashboard from popover: ⌘/Ctrl+D</li>
              </ul>
            </div>
            <p className="text-[11px] text-[var(--muted)]">
              MIT licensed. Repository content is treated as untrusted text and never executed.
            </p>
          </Section>
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(removing)}
        title="Remove this repository?"
        message={`${removing?.name ?? "This repository"} will be removed from GitPulse. Nothing in the repository itself will be changed.`}
        confirmLabel="Remove"
        danger
        onConfirm={() => void doRemove()}
        onCancel={() => setRemoveId(null)}
      />
    </div>
  );
}

function Section({
  id,
  title,
  description,
  action,
  children,
}: {
  id: string;
  title: string;
  description: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      id={`settings-${id}`}
      aria-labelledby={`settings-${id}-title`}
      className="scroll-mt-4 rounded-[12px] border border-[var(--border)] bg-[var(--surface)] p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id={`settings-${id}-title`} className="text-[14px] font-semibold text-[var(--text)]">
            {title}
          </h2>
          <p className="mt-0.5 text-[12px] text-[var(--muted)]">{description}</p>
        </div>
        {action}
      </div>
      <div className="mt-2 divide-y divide-[var(--border)]">{children}</div>
    </section>
  );
}

function AboutRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold tracking-[0.08em] text-[var(--muted)] uppercase">
        {label}
      </dt>
      <dd className="mt-0.5 text-[var(--text)]">{value}</dd>
    </div>
  );
}

function NumberField({
  label,
  suffix,
  value,
  min,
  max,
  onCommit,
  disabled,
}: {
  label: string;
  suffix: string;
  value: number;
  min: number;
  max: number;
  onCommit: (value: number) => void;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  function commit() {
    const parsed = Number.parseInt(draft, 10);
    if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
      setDraft(String(value));
      notify("warning", "That value is out of range", `${label} must be between ${min} and ${max}.`);
      return;
    }
    if (parsed !== value) onCommit(parsed);
  }

  return (
    <Input
      label={label}
      hint={`${min}–${max} ${suffix}`}
      type="number"
      min={min}
      max={max}
      value={draft}
      disabled={disabled}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.currentTarget.blur();
        }
      }}
      className={cn(disabled && "opacity-60")}
    />
  );
}

function PatternsField({
  patterns,
  onCommit,
}: {
  patterns: string[];
  onCommit: (patterns: string[]) => void;
}) {
  const [draft, setDraft] = useState(patterns.join("\n"));

  useEffect(() => {
    setDraft(patterns.join("\n"));
  }, [patterns]);

  function commit() {
    const next = draft
      .split(/[\n,]/u)
      .map((pattern) => pattern.trim())
      .filter(Boolean);
    if (next.some((pattern) => pattern.startsWith("/") || pattern.includes(".."))) {
      notify("warning", "Ignore patterns cannot be absolute or contain '..'");
      setDraft(patterns.join("\n"));
      return;
    }
    if (next.join("\n") !== patterns.join("\n")) onCommit(next);
  }

  return (
    <label className="block py-2">
      <span className="mb-1 block text-[12px] font-medium text-[var(--muted)]">
        Ignored folders & patterns
      </span>
      <textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        rows={4}
        spellCheck={false}
        className="mono w-full rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 text-[var(--text)] focus:border-[var(--accent)] focus:outline-none"
      />
      <span className="mt-1 block text-[11px] text-[var(--muted)]">
        One pattern per line or comma-separated. Used when walking folders and scanning.
      </span>
    </label>
  );
}
