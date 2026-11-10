import type { FileChange, PrimaryStatus, RepoSummary } from "./bindings.generated";

export type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "accent";

export interface StatusMeta {
  label: string;
  tone: Tone;
  description: string;
}

const STATUS_META: Record<PrimaryStatus, StatusMeta> = {
  clean: { label: "Clean", tone: "success", description: "Working tree clean" },
  ahead: { label: "Ahead", tone: "info", description: "Local commits not pushed" },
  dirty: { label: "Changes", tone: "warning", description: "Uncommitted changes" },
  behind: { label: "Behind", tone: "warning", description: "Upstream has newer commits" },
  diverged: { label: "Diverged", tone: "warning", description: "Local and upstream have diverged" },
  conflicted: { label: "Conflicts", tone: "danger", description: "Merge conflicts" },
  unavailable: { label: "Unavailable", tone: "neutral", description: "Repository is missing" },
  error: { label: "Error", tone: "danger", description: "Repository could not be read" },
  scanning: { label: "Scanning", tone: "info", description: "Reading repository" },
};

export function statusMeta(status: PrimaryStatus): StatusMeta {
  return STATUS_META[status];
}

export function statusPriority(status: PrimaryStatus): number {
  switch (status) {
    case "conflicted":
      return 5;
    case "diverged":
      return 4;
    case "behind":
      return 3;
    case "dirty":
      return 2;
    case "ahead":
      return 1;
    default:
      return 0;
  }
}

export interface StatusBadge {
  key: string;
  label: string;
  tone: Tone;
}

export function statusBadges(summary: RepoSummary): StatusBadge[] {
  const badges: StatusBadge[] = [];
  if (summary.flags.conflicted && summary.counts.conflicted > 0) {
    badges.push({
      key: "conflicted",
      label: `${summary.counts.conflicted} conflict${summary.counts.conflicted === 1 ? "" : "s"}`,
      tone: "danger",
    });
  }
  if (summary.flags.dirty) {
    const changed = summary.counts.staged + summary.counts.modified + summary.counts.untracked;
    badges.push({
      key: "dirty",
      label: `${changed} changed`,
      tone: "warning",
    });
  }
  if (summary.ahead > 0 || summary.behind > 0) {
    badges.push({
      key: "divergence",
      label: `↑${summary.ahead} ↓${summary.behind}`,
      tone: summary.ahead > 0 && summary.behind > 0 ? "warning" : "info",
    });
  }
  if (summary.flags.detached) {
    badges.push({ key: "detached", label: "Detached HEAD", tone: "info" });
  }
  if (summary.flags.unborn) {
    badges.push({ key: "unborn", label: "No commits", tone: "neutral" });
  }
  if (summary.watcher === "polling") {
    badges.push({ key: "polling", label: "Polling", tone: "neutral" });
  }
  if (summary.watcher === "unavailable" && summary.error) {
    badges.push({ key: "watcher", label: "Watcher off", tone: "neutral" });
  }
  if (summary.counts.stashed > 0) {
    badges.push({
      key: "stash",
      label: `${summary.counts.stashed} stash${summary.counts.stashed === 1 ? "" : "es"}`,
      tone: "neutral",
    });
  }
  return badges;
}

export interface ChangeGroups {
  staged: FileChange[];
  unstaged: FileChange[];
  untracked: FileChange[];
  conflicted: FileChange[];
}

export function groupChanges(changes: FileChange[]): ChangeGroups {
  const groups: ChangeGroups = {
    staged: [],
    unstaged: [],
    untracked: [],
    conflicted: [],
  };
  for (const change of changes) {
    if (change.status === "conflicted") {
      groups.conflicted.push(change);
    } else if (change.status === "untracked") {
      groups.untracked.push(change);
    } else if (change.staged) {
      groups.staged.push(change);
    } else {
      groups.unstaged.push(change);
    }
  }
  return groups;
}

export function changeStatusLetter(change: FileChange): string {
  if (change.status === "untracked") return "?";
  switch (change.status) {
    case "added":
      return "A";
    case "deleted":
      return "D";
    case "renamed":
      return "R";
    case "copied":
      return "C";
    case "typechange":
      return "T";
    case "conflicted":
      return "!";
    default:
      return "M";
  }
}

export function changeStatusLabel(change: FileChange): string {
  switch (change.status) {
    case "added":
      return "Added";
    case "deleted":
      return "Deleted";
    case "renamed":
      return "Renamed";
    case "copied":
      return "Copied";
    case "typechange":
      return "Type changed";
    case "conflicted":
      return "Conflicted";
    case "untracked":
      return "Untracked";
    default:
      return "Modified";
  }
}

export function totalChanged(summary: RepoSummary): number {
  return summary.counts.staged + summary.counts.modified + summary.counts.untracked;
}

export function changeKey(change: FileChange): string {
  return `${change.staged ? "staged" : "unstaged"}:${change.path}`;
}

export function statusSummaryText(summary: RepoSummary): string {
  const parts: string[] = [];
  if (summary.flags.conflicted) {
    parts.push(
      `${summary.counts.conflicted} merge conflict${summary.counts.conflicted === 1 ? "" : "s"}`,
    );
  }
  if (summary.flags.dirty) parts.push(`${totalChanged(summary)} changed files`);
  if (summary.behind > 0) {
    parts.push(
      `${summary.behind} commit${summary.behind === 1 ? "" : "s"} behind ${summary.upstream ?? "upstream"}`,
    );
  }
  if (summary.ahead > 0) {
    parts.push(`${summary.ahead} commit${summary.ahead === 1 ? "" : "s"} ahead`);
  }
  if (parts.length === 0) return "Working tree clean";
  return parts.join(" · ");
}
