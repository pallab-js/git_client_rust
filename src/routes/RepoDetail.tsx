import {
  Activity as ActivityIcon,
  ArrowLeft,
  FolderOpen,
  GitBranch,
  GitCommit,
  Pin,
  PinOff,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import type {
  ActivityEntry,
  AppError,
  BranchEntry,
  CommitEntry,
  FileChange,
  FileDiff,
} from "../lib/bindings.generated";
import { notify, notifyError } from "../lib/actions";
import { cn } from "../lib/cn";
import { pickDirectory } from "../lib/dialog";
import { escapeUnsafeText, relativeTime, shortSha } from "../lib/format";
import { ipc } from "../lib/ipc";
import { openDashboard } from "../lib/router";
import { totalChanged, changeKey } from "../lib/status";
import { useRepos } from "../stores/repos";
import { ChangeList } from "../components/changes/ChangeList";
import { DiffViewer } from "../components/changes/DiffViewer";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { EmptyState, Spinner } from "../components/ui/EmptyState";
import { ErrorCard } from "../components/ui/ErrorCard";
import { IconButton } from "../components/ui/IconButton";
import { DivergencePill, StatusBadges } from "../components/ui/Status";

type Tab = "commits" | "branches" | "activity";

const TABS: Array<{ id: Tab; label: string; icon: typeof GitCommit }> = [
  { id: "commits", label: "Commits", icon: GitCommit },
  { id: "branches", label: "Branches", icon: GitBranch },
  { id: "activity", label: "Activity", icon: ActivityIcon },
];

export function RepoDetail({ id }: { id: string }) {
  const summary = useRepos((state) => state.repos.find((repo) => repo.id === id) ?? null);
  const loaded = useRepos((state) => state.loaded);
  const upsert = useRepos((state) => state.upsert);
  const remove = useRepos((state) => state.remove);

  const [tab, setTab] = useState<Tab>("commits");
  const [changes, setChanges] = useState<FileChange[]>([]);
  const [changesLoading, setChangesLoading] = useState(false);
  const [changesError, setChangesError] = useState<AppError | null>(null);
  const [selected, setSelected] = useState<FileChange | null>(null);
  const [diff, setDiff] = useState<FileDiff | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState<AppError | null>(null);
  const [commits, setCommits] = useState<CommitEntry[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [commitsLoading, setCommitsLoading] = useState(false);
  const [commitsError, setCommitsError] = useState<AppError | null>(null);
  const [branches, setBranches] = useState<BranchEntry[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [branchesError, setBranchesError] = useState<AppError | null>(null);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityError, setActivityError] = useState<AppError | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [busy, setBusy] = useState(false);

  const revision = summary?.revision ?? 0;

  useEffect(() => {
    let cancelled = false;
    setChangesLoading(true);
    setChangesError(null);
    ipc
      .getRepoChanges(id)
      .then((list) => {
        if (cancelled) return;
        setChanges(list);
        setSelected((current) => {
          if (current && list.some((item) => changeKey(item) === changeKey(current))) {
            return current;
          }
          return list[0] ?? null;
        });
      })
      .catch((error: unknown) => {
        if (!cancelled) setChangesError(toError(error));
      })
      .finally(() => {
        if (!cancelled) setChangesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, revision]);

  useEffect(() => {
    if (!selected) {
      setDiff(null);
      setDiffError(null);
      return;
    }
    let cancelled = false;
    setDiffLoading(true);
    setDiffError(null);
    ipc
      .getFileDiff(id, selected.path, selected.staged)
      .then((value) => {
        if (!cancelled) setDiff(value);
      })
      .catch((error: unknown) => {
        if (!cancelled) setDiffError(toError(error));
      })
      .finally(() => {
        if (!cancelled) setDiffLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, selected, revision]);

  useEffect(() => {
    if (tab !== "commits") return;
    let cancelled = false;
    setCommitsLoading(true);
    setCommitsError(null);
    ipc
      .getRepoCommits(id, null, 20)
      .then((page) => {
        if (cancelled) return;
        setCommits(page.items);
        setNextCursor(page.nextCursor);
      })
      .catch((error: unknown) => {
        if (!cancelled) setCommitsError(toError(error));
      })
      .finally(() => {
        if (!cancelled) setCommitsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, revision, tab]);

  useEffect(() => {
    if (tab !== "branches") return;
    let cancelled = false;
    setBranchesLoading(true);
    setBranchesError(null);
    ipc
      .getRepoBranches(id)
      .then((list) => {
        if (!cancelled) setBranches(list);
      })
      .catch((error: unknown) => {
        if (!cancelled) setBranchesError(toError(error));
      })
      .finally(() => {
        if (!cancelled) setBranchesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, revision, tab]);

  useEffect(() => {
    if (tab !== "activity") return;
    let cancelled = false;
    setActivityLoading(true);
    setActivityError(null);
    ipc
      .getActivity(id, 100)
      .then((list) => {
        if (!cancelled) setActivity(list);
      })
      .catch((error: unknown) => {
        if (!cancelled) setActivityError(toError(error));
      })
      .finally(() => {
        if (!cancelled) setActivityLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, revision, tab]);

  const reloadDiff = useCallback(() => {
    if (!selected) return;
    setDiffLoading(true);
    setDiffError(null);
    ipc
      .getFileDiff(id, selected.path, selected.staged)
      .then(setDiff)
      .catch((error: unknown) => setDiffError(toError(error)))
      .finally(() => setDiffLoading(false));
  }, [id, selected]);

  if (!summary) {
    if (!loaded) {
      return (
        <div className="flex h-full items-center justify-center">
          <Spinner />
        </div>
      );
    }
    return (
      <EmptyState
        title="Repository not found"
        description="This repository is no longer in your list."
        action={
          <Button variant="primary" onClick={openDashboard}>
            Back to dashboard
          </Button>
        }
      />
    );
  }

  async function refresh() {
    setBusy(true);
    try {
      const next = await ipc.refreshRepo(id, "full");
      upsert(next);
    } catch (error) {
      notifyError(error, "Could not refresh this repository");
    } finally {
      setBusy(false);
    }
  }

  async function openEditor() {
    try {
      await ipc.openInEditor(id);
    } catch (error) {
      notifyError(error, "Could not open your editor");
    }
  }

  async function reveal() {
    try {
      await ipc.revealRepo(id);
    } catch (error) {
      notifyError(error, "Could not reveal this folder");
    }
  }

  async function togglePin() {
    const target = summary ? !summary.pinned : false;
    try {
      await ipc.setRepoPinned(id, target);
      if (summary) upsert({ ...summary, pinned: target });
      notify("success", target ? "Repository pinned" : "Repository unpinned");
    } catch (error) {
      notifyError(error, "Could not update the pin");
    }
  }

  async function locate() {
    try {
      const selectedPath = await pickDirectory(`Locate ${summary?.name ?? "repository"}`);
      if (!selectedPath) return;
      const next = await ipc.locateRepo(id, selectedPath);
      upsert(next);
      notify("success", "Repository relocated", next.path);
    } catch (error) {
      notifyError(error, "Could not relocate this repository");
    }
  }

  async function doRemove() {
    setConfirmRemove(false);
    try {
      await ipc.removeRepo(id);
      remove(id);
      notify("success", "Repository removed", "Your files were not changed.");
      openDashboard();
    } catch (error) {
      notifyError(error, "Could not remove this repository");
    }
  }

  async function loadMoreCommits() {
    if (!nextCursor) return;
    setCommitsLoading(true);
    try {
      const page = await ipc.getRepoCommits(id, nextCursor, 20);
      setCommits((current) => [...current, ...page.items]);
      setNextCursor(page.nextCursor);
    } catch (error) {
      notifyError(error, "Could not load more commits");
    } finally {
      setCommitsLoading(false);
    }
  }

  const selectedKey = selected ? changeKey(selected) : null;
  const changed = totalChanged(summary);

  return (
    <div className="mx-auto max-w-6xl p-4">
      <div className="flex flex-wrap items-start gap-3">
        <IconButton label="Back to dashboard" onClick={openDashboard}>
          <ArrowLeft aria-hidden className="h-4 w-4" />
        </IconButton>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-[18px] font-semibold tracking-tight text-[var(--text)]">
              {escapeUnsafeText(summary.name)}
            </h1>
            {summary.pinned && <Badge tone="neutral">Pinned</Badge>}
            <StatusBadges summary={summary} />
            {summary.branch && (
              <span className="inline-flex items-center gap-1 text-[12px] text-[var(--muted)]">
                <GitBranch aria-hidden className="h-3.5 w-3.5" />
                <span className="mono text-[var(--text)]">{summary.branch}</span>
              </span>
            )}
            <DivergencePill ahead={summary.ahead} behind={summary.behind} />
            {summary.watcher === "polling" && <Badge tone="neutral">Polling</Badge>}
          </div>
          <p className="mono mt-0.5 truncate text-[11px] text-[var(--muted)]" title={summary.path}>
            {summary.path}
          </p>
          <p className="mt-0.5 text-[11px] text-[var(--muted)]">
            {changed > 0 ? `${changed} changed file${changed === 1 ? "" : "s"}` : "Clean tree"}
            {" · "}
            updated {relativeTime(summary.updatedAt)}
            {summary.lastFetchAt ? ` · last fetch ${relativeTime(summary.lastFetchAt)}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button variant="primary" size="sm" onClick={() => void openEditor()}>
            Open editor
          </Button>
          <IconButton label="Reveal repository folder" onClick={() => void reveal()}>
            <FolderOpen aria-hidden className="h-4 w-4" />
          </IconButton>
          <IconButton
            label={summary.pinned ? "Unpin repository" : "Pin repository"}
            onClick={() => void togglePin()}
          >
            {summary.pinned ? (
              <PinOff aria-hidden className="h-4 w-4" />
            ) : (
              <Pin aria-hidden className="h-4 w-4" />
            )}
          </IconButton>
          <IconButton label="Refresh repository" onClick={() => void refresh()} disabled={busy}>
            <RefreshCw aria-hidden className={cn("h-4 w-4", busy && "animate-spin")} />
          </IconButton>
          <IconButton label="Remove repository" onClick={() => setConfirmRemove(true)}>
            <Trash2 aria-hidden className="h-4 w-4" />
          </IconButton>
        </div>
      </div>

      {summary.error && (
        <div className="mt-3">
          <ErrorCard error={summary.error} onRetry={() => void refresh()} />
          {(summary.primaryStatus === "unavailable" || summary.primaryStatus === "error") && (
            <div className="mt-2 flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => void locate()}>
                Locate folder…
              </Button>
              <Button size="sm" variant="danger" onClick={() => setConfirmRemove(true)}>
                Remove repository
              </Button>
            </div>
          )}
        </div>
      )}

      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(280px,340px)_minmax(0,1fr)]">
        <section
          aria-label="Working-tree changes"
          className="min-h-[220px] max-h-[440px] overflow-y-auto rounded-[10px] border border-[var(--border)] bg-[var(--surface)] p-1.5"
        >
          {changesLoading && changes.length === 0 ? (
            <div className="flex h-40 items-center justify-center">
              <Spinner />
            </div>
          ) : changesError ? (
            <div className="p-2">
              <ErrorCard
                error={changesError}
                compact
                onRetry={() => {
                  setChangesError(null);
                  setChangesLoading(true);
                  ipc
                    .getRepoChanges(id)
                    .then(setChanges)
                    .catch((error: unknown) => setChangesError(toError(error)))
                    .finally(() => setChangesLoading(false));
                }}
              />
            </div>
          ) : (
            <ChangeList changes={changes} selectedKey={selectedKey} onSelect={setSelected} />
          )}
        </section>

        <section
          aria-label="File diff"
          className="min-h-[320px] max-h-[440px] overflow-hidden rounded-[10px] border border-[var(--border)] bg-[var(--surface)]"
        >
          <DiffViewer
            path={selected?.path ?? null}
            staged={selected?.staged ?? false}
            diff={diff}
            loading={diffLoading}
            error={diffError}
            onRetry={reloadDiff}
          />
        </section>
      </div>

      <div className="mt-5">
        <div
          role="tablist"
          aria-label="Repository history"
          className="flex items-center gap-1 border-b border-[var(--border)]"
        >
          {TABS.map((item, index) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                id={`tab-${item.id}`}
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                aria-controls={`panel-${item.id}`}
                tabIndex={tab === item.id ? 0 : -1}
                onClick={() => setTab(item.id)}
                onKeyDown={(event) => {
                  if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
                  event.preventDefault();
                  const direction = event.key === "ArrowRight" ? 1 : -1;
                  const next = TABS[(index + direction + TABS.length) % TABS.length];
                  setTab(next.id);
                  window.requestAnimationFrame(() => {
                    document.getElementById(`tab-${next.id}`)?.focus();
                  });
                }}
                className={cn(
                  "inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-[12px] font-medium transition-colors",
                  tab === item.id
                    ? "border-[var(--accent)] text-[var(--text)]"
                    : "border-transparent text-[var(--muted)] hover:text-[var(--text)]",
                )}
              >
                <Icon aria-hidden className="h-3.5 w-3.5" />
                {item.label}
              </button>
            );
          })}
        </div>

        <div
          id={`panel-${tab}`}
          role="tabpanel"
          aria-labelledby={`tab-${tab}`}
          className="mt-2 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] p-2"
        >
          {tab === "commits" && (
            <CommitsPanel
              commits={commits}
              loading={commitsLoading}
              error={commitsError}
              hasMore={Boolean(nextCursor)}
              onLoadMore={() => void loadMoreCommits()}
            />
          )}
          {tab === "branches" && (
            <BranchesPanel branches={branches} loading={branchesLoading} error={branchesError} />
          )}
          {tab === "activity" && (
            <ActivityPanel entries={activity} loading={activityLoading} error={activityError} />
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmRemove}
        title="Remove this repository?"
        message={`${summary.name} will be removed from GitPulse. Nothing in the repository itself will be changed.`}
        confirmLabel="Remove"
        danger
        onConfirm={() => void doRemove()}
        onCancel={() => setConfirmRemove(false)}
      />
    </div>
  );
}

function CommitsPanel({
  commits,
  loading,
  error,
  hasMore,
  onLoadMore,
}: {
  commits: CommitEntry[];
  loading: boolean;
  error: AppError | null;
  hasMore: boolean;
  onLoadMore: () => void;
}) {
  if (loading && commits.length === 0) {
    return (
      <div className="flex h-24 items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (error) {
    return <ErrorCard error={error} compact />;
  }
  if (commits.length === 0) {
    return <p className="px-2 py-6 text-center text-[12px] text-[var(--muted)]">No commits yet.</p>;
  }
  return (
    <div>
      <ul className="divide-y divide-[var(--border)]">
        {commits.map((commit) => (
          <li key={commit.sha} className="flex items-start gap-3 px-2 py-2">
            <span className="mono shrink-0 rounded bg-[var(--surface-2)] px-1.5 py-0.5 text-[11px] text-[var(--muted)]">
              {shortSha(commit.sha)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12px] text-[var(--text)]">
                {escapeUnsafeText(commit.summary) || "No message"}
              </span>
              <span className="mt-0.5 block truncate text-[11px] text-[var(--muted)]">
                {escapeUnsafeText(commit.author)} · {relativeTime(commit.at)}
              </span>
            </span>
          </li>
        ))}
      </ul>
      {hasMore && (
        <div className="flex justify-center pt-2">
          <Button size="sm" variant="ghost" onClick={onLoadMore} disabled={loading}>
            {loading ? "Loading…" : "Load more commits"}
          </Button>
        </div>
      )}
    </div>
  );
}

function BranchesPanel({
  branches,
  loading,
  error,
}: {
  branches: BranchEntry[];
  loading: boolean;
  error: AppError | null;
}) {
  if (loading && branches.length === 0) {
    return (
      <div className="flex h-24 items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (error) return <ErrorCard error={error} compact />;
  if (branches.length === 0) {
    return (
      <p className="px-2 py-6 text-center text-[12px] text-[var(--muted)]">No local branches.</p>
    );
  }
  return (
    <ul className="divide-y divide-[var(--border)]">
      {branches.map((branch) => (
        <li key={branch.name} className="flex flex-wrap items-center gap-2 px-2 py-2">
          <GitBranch aria-hidden className="h-3.5 w-3.5 text-[var(--muted)]" />
          <span className="mono text-[12px] text-[var(--text)]">
            {escapeUnsafeText(branch.name)}
          </span>
          {branch.isHead && <Badge tone="info">HEAD</Badge>}
          {branch.upstream && (
            <span className="truncate text-[11px] text-[var(--muted)]">→ {branch.upstream}</span>
          )}
          <span className="ml-auto flex items-center gap-2">
            <DivergencePill ahead={branch.ahead} behind={branch.behind} />
            <span className="text-[11px] text-[var(--muted)]">
              {relativeTime(branch.lastCommitAt)}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function ActivityPanel({
  entries,
  loading,
  error,
}: {
  entries: ActivityEntry[];
  loading: boolean;
  error: AppError | null;
}) {
  if (loading && entries.length === 0) {
    return (
      <div className="flex h-24 items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (error) return <ErrorCard error={error} compact />;
  if (entries.length === 0) {
    return (
      <p className="px-2 py-6 text-center text-[12px] text-[var(--muted)]">
        No recorded transitions yet.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-[var(--border)]">
      {entries.map((entry) => (
        <li key={entry.id} className="flex items-start gap-3 px-2 py-2">
          <Badge tone="neutral">{entry.kind}</Badge>
          <span className="mono min-w-0 flex-1 truncate text-[11px] text-[var(--muted)]">
            {escapeUnsafeText(JSON.stringify(entry.payload))}
          </span>
          <span className="shrink-0 text-[11px] text-[var(--muted)]">
            {relativeTime(entry.createdAt)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function toError(error: unknown): AppError {
  if (error && typeof error === "object") {
    const candidate = error as Partial<AppError>;
    if (typeof candidate.code === "string" && typeof candidate.message === "string") {
      return {
        code: candidate.code as AppError["code"],
        message: candidate.message,
        details: candidate.details ?? null,
        retryable: candidate.retryable ?? false,
      };
    }
  }
  return {
    code: "UNKNOWN",
    message: typeof error === "string" && error ? error : "Something went wrong.",
    details: null,
    retryable: false,
  };
}
