import { AlertTriangle, Copy, FileDiff as FileDiffIcon } from "lucide-react";
import { useState } from "react";

import type { AppError, FileDiff } from "../../lib/bindings.generated";
import { cn } from "../../lib/cn";
import { escapeUnsafeText } from "../../lib/format";
import { notify } from "../../lib/actions";
import { IconButton } from "../ui/IconButton";
import { Spinner } from "../ui/EmptyState";
import { ErrorCard } from "../ui/ErrorCard";

interface DiffViewerProps {
  path: string | null;
  staged: boolean;
  diff: FileDiff | null;
  loading: boolean;
  error: AppError | null;
  onRetry: () => void;
}

type LineKind =
  | "meta"
  | "hunk"
  | "add"
  | "del"
  | "file-add"
  | "file-del"
  | "context"
  | "note";

function classify(line: string): LineKind {
  if (line.startsWith("@@")) return "hunk";
  if (line.startsWith("+++")) return "file-add";
  if (line.startsWith("---")) return "file-del";
  if (line.startsWith("+")) return "add";
  if (line.startsWith("-")) return "del";
  if (
    line.startsWith("diff --git") ||
    line.startsWith("index ") ||
    line.startsWith("new file mode") ||
    line.startsWith("deleted file mode") ||
    line.startsWith("old mode") ||
    line.startsWith("new mode") ||
    line.startsWith("similarity index") ||
    line.startsWith("rename from") ||
    line.startsWith("rename to") ||
    line.startsWith("copy from") ||
    line.startsWith("copy to") ||
    line.startsWith("Binary files")
  ) {
    return "meta";
  }
  if (line.startsWith("\\")) return "note";
  return "context";
}

const LINE_CLASS: Record<LineKind, string> = {
  meta: "text-[var(--muted)]",
  hunk: "bg-[var(--surface-2)] text-[var(--info)]",
  add: "bg-[color-mix(in_srgb,var(--success)_12%,transparent)] text-[var(--success)]",
  del: "bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] text-[var(--danger)]",
  "file-add": "text-[var(--success)]",
  "file-del": "text-[var(--danger)]",
  context: "text-[var(--text)]",
  note: "text-[var(--muted)] italic",
};

export function DiffViewer({ path, staged, diff, loading, error, onRetry }: DiffViewerProps) {
  const [copied, setCopied] = useState(false);

  async function copyPath() {
    if (!path) return;
    try {
      await navigator.clipboard.writeText(path);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      notify("warning", "Could not copy the path", "Select the path text and copy it manually.");
    }
  }

  if (!path) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
        <FileDiffIcon aria-hidden className="h-6 w-6 text-[var(--muted)]" />
        <p className="text-[13px] font-medium text-[var(--text)]">Select a changed file</p>
        <p className="max-w-xs text-[12px] text-[var(--muted)]">
          Choose a file on the left to see its patch. Diffs are read-only.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--border)] px-3 py-2">
        <span className="mono min-w-0 flex-1 truncate text-[var(--text)]" title={path}>
          {escapeUnsafeText(path)}
        </span>
        <span className="shrink-0 rounded-full border border-[var(--border)] px-1.5 text-[10px] text-[var(--muted)]">
          {staged ? "staged" : "unstaged"}
        </span>
        {diff?.languageHint && (
          <span className="shrink-0 text-[10px] text-[var(--muted)]">{diff.languageHint}</span>
        )}
        <IconButton label={copied ? "Path copied" : "Copy file path"} size="sm" onClick={copyPath}>
          <Copy aria-hidden className="h-3.5 w-3.5" />
        </IconButton>
      </div>

      {loading && (
        <div className="flex flex-1 items-center justify-center p-8">
          <Spinner />
        </div>
      )}

      {!loading && error && (
        <div className="p-3">
          <ErrorCard error={error} onRetry={onRetry} compact />
        </div>
      )}

      {!loading && !error && diff && (
        <div className="min-h-0 flex-1 overflow-auto">
          {diff.truncated && (
            <p className="flex items-start gap-1.5 border-b border-[color-mix(in_srgb,var(--warning)_35%,transparent)] bg-[var(--surface)] px-3 py-2 text-[11px] text-[var(--warning)]">
              <AlertTriangle aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              This diff was truncated at 5,000 lines or 1 MB. Open the file in your editor for the
              full contents.
            </p>
          )}
          {diff.binary ? (
            <p className="p-4 text-[12px] text-[var(--muted)]">
              Binary file. GitPulse does not render binary contents.
            </p>
          ) : diff.patch.trim().length === 0 ? (
            <p className="p-4 text-[12px] text-[var(--muted)]">No textual changes to show.</p>
          ) : (
            <pre
              role="region"
              aria-label={`Diff for ${path}`}
              className="mono min-w-full p-2 leading-[1.5] whitespace-pre"
            >
              {diff.patch.split("\n").map((raw, index) => {
                const kind = classify(raw);
                return (
                  <span
                    key={index}
                    className={cn("flex min-w-full", LINE_CLASS[kind])}
                    data-line-kind={kind}
                  >
                    <span
                      aria-hidden
                      className="mr-2 w-9 shrink-0 pr-2 text-right text-[var(--muted)] select-none"
                    >
                      {index + 1}
                    </span>
                    <span className="flex-1 pr-2">{escapeUnsafeText(raw) || " "}</span>
                  </span>
                );
              })}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
