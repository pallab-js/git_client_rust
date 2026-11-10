import { FolderSearch, Plus, RefreshCw, ShieldCheck } from "lucide-react";

import { pickAndAddRepo, refreshAllAction } from "../lib/actions";
import { ipc } from "../lib/ipc";
import { useRepos } from "../stores/repos";
import { useUi } from "../stores/ui";
import { Onboarding } from "./Onboarding";
import { RepoCard } from "../components/repo/RepoCard";
import { ScanResultsChecklist } from "../components/repo/ScanResultsChecklist";
import { Button } from "../components/ui/Button";
import { EmptyState, Spinner } from "../components/ui/EmptyState";

export function Dashboard() {
  const repos = useRepos((state) => state.repos);
  const loading = useRepos((state) => state.loading);
  const loaded = useRepos((state) => state.loaded);
  const select = useRepos((state) => state.select);
  const search = useUi((state) => state.search);
  const scan = useUi((state) => state.scan);

  if (!loaded && loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (loaded && repos.length === 0) {
    return <Onboarding />;
  }

  const filtered = repos.filter((repo) => {
    if (!search.trim()) return true;
    const needle = search.toLowerCase();
    return repo.name.toLowerCase().includes(needle) || repo.path.toLowerCase().includes(needle);
  });

  const attention = repos.filter(
    (repo) => repo.flags.conflicted || repo.flags.dirty || repo.behind > 0,
  ).length;
  const conflicts = repos.filter((repo) => repo.flags.conflicted).length;
  const clean = repos.filter((repo) => repo.primaryStatus === "clean").length;

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-semibold tracking-tight text-[var(--text)]">
            Repository overview
          </h1>
          <p className="mt-1 text-[13px] text-[var(--muted)]">
            {repos.length} monitored · {attention} need attention · {clean} clean
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => void refreshAllAction()}>
            <RefreshCw aria-hidden className="h-3.5 w-3.5" />
            Refresh all
          </Button>
          <Button variant="primary" size="sm" onClick={() => void pickAndAddRepo()}>
            <Plus aria-hidden className="h-3.5 w-3.5" />
            Add repo
          </Button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <SummaryTile label="Attention" value={attention} tone="warning" />
        <SummaryTile label="Conflicts" value={conflicts} tone="danger" />
        <SummaryTile label="Clean" value={clean} tone="success" />
      </div>

      {scan && (
        <div className="mt-4 flex items-center gap-3 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5">
          <Spinner className="h-3.5 w-3.5" />
          <div className="min-w-0 flex-1">
            <p className="text-[12px] text-[var(--text)]">
              Scanning for repositories · {scan.found} found
            </p>
            <p className="truncate text-[11px] text-[var(--muted)]">{scan.currentPath}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              void ipc.cancelScan(scan.scanId);
              useUi.getState().clearScan();
            }}
          >
            Cancel
          </Button>
        </div>
      )}

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {filtered.map((repo) => (
          <RepoCard
            key={repo.id}
            summary={repo}
            onSelect={() => {
              select(repo.id);
              window.location.hash = `#/repo/${repo.id}`;
            }}
          />
        ))}
      </div>

      {filtered.length === 0 && repos.length > 0 && (
        <EmptyState
          icon={<FolderSearch className="h-6 w-6" />}
          title="No repositories match"
          description="Try a different search, or add another repository."
          action={
            <Button variant="ghost" onClick={() => useUi.getState().setSearch("")}>
              Clear search
            </Button>
          }
        />
      )}
      <ScanResultsChecklist />
    </div>
  );
}

function SummaryTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "warning" | "danger" | "success";
}) {
  const color =
    tone === "danger"
      ? "text-[var(--danger)]"
      : tone === "warning"
        ? "text-[var(--warning)]"
        : "text-[var(--success)]";
  return (
    <div className="rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5">
      <p className="text-[10px] font-semibold tracking-[0.08em] text-[var(--muted)] uppercase">
        {label}
      </p>
      <p className={`mt-0.5 text-[22px] leading-7 font-semibold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}

export function OnboardingHint() {
  return (
    <p className="flex items-center gap-1.5 text-[11px] text-[var(--muted)]">
      <ShieldCheck aria-hidden className="h-3.5 w-3.5" />
      Read-only, local-first. GitPulse never stages, commits, or fetches.
    </p>
  );
}
