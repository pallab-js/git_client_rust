import { AlertTriangle, GitBranch } from "lucide-react";

import type { RepoSummary } from "../../lib/bindings.generated";
import { cn } from "../../lib/cn";
import { escapeUnsafeText, relativeTime, shortenPath } from "../../lib/format";
import { statusSummaryText } from "../../lib/status";
import { Badge } from "../ui/Badge";
import { DivergencePill, StatusBadges, StatusPill } from "../ui/Status";

export function RepoCard({ summary, onSelect }: { summary: RepoSummary; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "group flex w-full flex-col gap-3 rounded-[12px] border bg-[var(--surface)] p-4 text-left transition-colors hover:border-[var(--accent)]",
        summary.flags.conflicted
          ? "border-[color-mix(in_srgb,var(--danger)_45%,var(--border))]"
          : "border-[var(--border)]",
      )}
      aria-label={`Open ${summary.name}`}
    >
      <div className="flex w-full items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-[14px] font-semibold text-[var(--text)]">
              {escapeUnsafeText(summary.name)}
            </h3>
            {summary.pinned && <Badge tone="neutral">Pinned</Badge>}
          </div>
          <p className="mt-0.5 truncate text-[11px] text-[var(--muted)]" title={summary.path}>
            {shortenPath(summary.path, 52)}
          </p>
        </div>
        <StatusPill status={summary.primaryStatus} />
      </div>

      <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[var(--muted)]">
        <span className="inline-flex items-center gap-1">
          <GitBranch aria-hidden className="h-3.5 w-3.5" />
          <span className="text-[var(--text)]">{summary.branch ?? "detached HEAD"}</span>
        </span>
        <DivergencePill ahead={summary.ahead} behind={summary.behind} />
        {summary.upstream && <span className="truncate">→ {summary.upstream}</span>}
        {summary.watcher === "polling" && <Badge tone="neutral">Polling</Badge>}
      </div>

      <StatusBadges summary={summary} />

      <div className="flex w-full items-center justify-between gap-2 border-t border-[var(--border)] pt-2.5 text-[11px] text-[var(--muted)]">
        <span className="truncate">
          {summary.lastCommit ? (
            <>
              <span className="text-[var(--text)]">{summary.lastCommit.summary || "No message"}</span>
              {" · "}
              {relativeTime(summary.lastCommit.at)}
            </>
          ) : (
            statusSummaryText(summary)
          )}
        </span>
        {summary.lastFetchAt && <span>fetched {relativeTime(summary.lastFetchAt)}</span>}
      </div>

      {summary.error && (
        <p className="flex items-start gap-1.5 text-[11px] text-[var(--danger)]">
          <AlertTriangle aria-hidden className="mt-0.5 h-3 w-3 shrink-0" />
          <span>{summary.error.message}</span>
        </p>
      )}
    </button>
  );
}
