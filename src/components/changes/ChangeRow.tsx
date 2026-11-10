import type { FileChange } from "../../lib/bindings.generated";
import { cn } from "../../lib/cn";
import { escapeUnsafeText } from "../../lib/format";
import { changeStatusLabel, changeStatusLetter } from "../../lib/status";

interface ChangeRowProps {
  change: FileChange;
  selected: boolean;
  onSelect: (change: FileChange) => void;
}

function letterClass(change: FileChange): string {
  switch (change.status) {
    case "conflicted":
      return "text-[var(--danger)]";
    case "added":
    case "untracked":
      return "text-[var(--success)]";
    case "deleted":
      return "text-[var(--danger)]";
    case "renamed":
    case "copied":
      return "text-[var(--info)]";
    default:
      return "text-[var(--warning)]";
  }
}

export function ChangeRow({ change, selected, onSelect }: ChangeRowProps) {
  const path = escapeUnsafeText(change.path);
  const oldPath = change.oldPath ? escapeUnsafeText(change.oldPath) : null;
  return (
    <button
      type="button"
      onClick={() => onSelect(change)}
      aria-current={selected ? "true" : undefined}
      title={`${changeStatusLabel(change)}: ${change.path}`}
      className={cn(
        "flex w-full items-center gap-2 rounded-[6px] px-2 py-1 text-left transition-colors",
        selected ? "bg-[var(--surface-2)]" : "hover:bg-[var(--surface-2)]",
      )}
    >
      <span
        aria-hidden
        className={cn("mono w-3 shrink-0 text-center font-semibold", letterClass(change))}
      >
        {changeStatusLetter(change)}
      </span>
      <span className="sr-only">{changeStatusLabel(change)}</span>
      <span className="mono min-w-0 flex-1 truncate text-[var(--text)]">
        {oldPath ? `${oldPath} → ${path}` : path}
      </span>
      <span className="mono shrink-0 tabular-nums">
        {change.binary ? (
          <span className="text-[var(--muted)]">binary</span>
        ) : (
          <>
            {change.insertions != null && change.insertions > 0 && (
              <span className="text-[var(--success)]">+{change.insertions}</span>
            )}
            {change.insertions != null && change.deletions != null && " "}
            {change.deletions != null && change.deletions > 0 && (
              <span className="text-[var(--danger)]">−{change.deletions}</span>
            )}
            {change.insertions == null && change.deletions == null && (
              <span className="text-[var(--muted)]">·</span>
            )}
          </>
        )}
      </span>
    </button>
  );
}
