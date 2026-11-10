import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  Circle,
  GitMerge,
  Loader2,
} from "lucide-react";

import { cn } from "../../lib/cn";
import type { PrimaryStatus, RepoSummary } from "../../lib/bindings.generated";
import { statusBadges, statusMeta, type Tone } from "../../lib/status";
import { Badge } from "./Badge";

const TONE_TEXT: Record<Tone, string> = {
  neutral: "text-[var(--muted)]",
  success: "text-[var(--success)]",
  warning: "text-[var(--warning)]",
  danger: "text-[var(--danger)]",
  info: "text-[var(--info)]",
  accent: "text-[var(--accent)]",
};

export function StatusIcon({
  status,
  className,
}: {
  status: PrimaryStatus;
  className?: string;
}) {
  const meta = statusMeta(status);
  const shared = cn("h-3.5 w-3.5 shrink-0", TONE_TEXT[meta.tone], className);
  switch (status) {
    case "clean":
      return <Check aria-hidden className={shared} />;
    case "ahead":
      return <ArrowUp aria-hidden className={shared} />;
    case "behind":
      return <ArrowDown aria-hidden className={shared} />;
    case "diverged":
      return <GitMerge aria-hidden className={shared} />;
    case "conflicted":
    case "error":
      return <AlertTriangle aria-hidden className={shared} />;
    case "scanning":
      return <Loader2 aria-hidden className={cn(shared, "animate-spin")} />;
    default:
      return <Circle aria-hidden className={shared} />;
  }
}

export function StatusPill({ status, className }: { status: PrimaryStatus; className?: string }) {
  const meta = statusMeta(status);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-[12px] font-medium",
        TONE_TEXT[meta.tone],
        className,
      )}
      title={meta.description}
    >
      <StatusIcon status={status} />
      {meta.label}
    </span>
  );
}

export function DivergencePill({ ahead, behind }: { ahead: number; behind: number }) {
  if (ahead === 0 && behind === 0) return null;
  return (
    <span
      className="inline-flex items-center gap-1 text-[11px] tabular-nums"
      title={`${ahead} commits ahead, ${behind} commits behind upstream`}
    >
      <span className="sr-only">Divergence: </span>
      {ahead > 0 && (
        <span className="inline-flex items-center text-[var(--info)]">
          <ArrowUp aria-hidden className="h-3 w-3" />
          {ahead}
        </span>
      )}
      {behind > 0 && (
        <span className="inline-flex items-center text-[var(--warning)]">
          <ArrowDown aria-hidden className="h-3 w-3" />
          {behind}
        </span>
      )}
    </span>
  );
}

export function StatusBadges({ summary }: { summary: RepoSummary }) {
  const badges = statusBadges(summary);
  if (badges.length === 0) {
    return <Badge tone="success">Clean</Badge>;
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {badges.map((badge) => (
        <Badge key={badge.key} tone={badge.tone}>
          {badge.label}
        </Badge>
      ))}
    </span>
  );
}
