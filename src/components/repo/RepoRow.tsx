import { Pin } from "lucide-react";

import type { RepoSummary } from "../../lib/bindings.generated";
import { cn } from "../../lib/cn";
import { escapeUnsafeText, shortenPath } from "../../lib/format";
import { statusBadges, statusMeta } from "../../lib/status";
import { Badge } from "../ui/Badge";
import { StatusIcon } from "../ui/Status";

interface RepoRowProps {
  summary: RepoSummary;
  selected?: boolean;
  onSelect: (id: string) => void;
  compact?: boolean;
  pinned?: boolean;
}

export function RepoRow({ summary, selected, onSelect, compact, pinned }: RepoRowProps) {
  const meta = statusMeta(summary.primaryStatus);
  const badges = statusBadges(summary).slice(0, 2);
  const name = escapeUnsafeText(summary.name);

  return (
    <button
      type="button"
      onClick={() => onSelect(summary.id)}
      aria-current={selected ? "page" : undefined}
      className={cn(
        "group flex w-full items-center gap-2 rounded-[8px] border border-transparent px-2 text-left transition-colors",
        compact ? "py-1.5" : "py-2",
        selected
          ? "border-[var(--border)] bg-[var(--surface-2)]"
          : "hover:bg-[var(--surface-2)]",
      )}
      title={`${summary.name} — ${meta.description}`}
    >
      <StatusIcon status={summary.primaryStatus} className="h-4 w-4" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[13px] font-medium text-[var(--text)]">{name}</span>
          {pinned && <Pin aria-label="Pinned" className="h-3 w-3 shrink-0 text-[var(--muted)]" />}
          {badges.length > 0 && (
            <span className="ml-auto flex shrink-0 gap-1">
              {badges.map((badge) => (
                <Badge key={badge.key} tone={badge.tone}>
                  {badge.label}
                </Badge>
              ))}
            </span>
          )}
        </span>
        {!compact && (
          <span className="mt-0.5 flex items-center gap-2 text-[11px] text-[var(--muted)]">
            <span className="truncate">{summary.branch ?? "detached"}</span>
            <span className="truncate">{shortenPath(summary.path, 30)}</span>
          </span>
        )}
      </span>
    </button>
  );
}
