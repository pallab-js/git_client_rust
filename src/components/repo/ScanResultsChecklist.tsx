import { FolderSearch, X } from "lucide-react";
import { useEffect, useState } from "react";

import { addScannedPaths } from "../../lib/actions";
import { escapeUnsafeText, shortenPath } from "../../lib/format";
import { useRepos } from "../../stores/repos";
import { useUi } from "../../stores/ui";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";

export function ScanResultsChecklist() {
  const results = useUi((state) => state.scanResults);
  const open = useUi((state) => state.scanOpen);
  const close = useUi((state) => state.closeScanResults);
  const clear = useUi((state) => state.clearScan);
  const repos = useRepos((state) => state.repos);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!results) {
      setChecked(new Set());
      return;
    }
    setChecked(new Set(results.candidates.map((candidate) => candidate.path)));
  }, [results]);

  if (!open || !results) return null;

  const existing = new Set(repos.map((repo) => repo.path));
  const available = results.candidates.filter((candidate) => !existing.has(candidate.path));
  const selected = available.filter((candidate) => checked.has(candidate.path));

  function toggle(path: string) {
    setChecked((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  async function addSelected() {
    setBusy(true);
    try {
      await addScannedPaths(selected.map((candidate) => candidate.path));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="scan-results-title"
        className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-[12px] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)]"
      >
        <div className="flex items-start gap-3 border-b border-[var(--border)] p-4">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-[var(--surface-2)] text-[var(--accent)]">
            <FolderSearch aria-hidden className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="scan-results-title" className="text-[14px] font-semibold text-[var(--text)]">
              Repositories found
            </h2>
            <p className="text-[12px] text-[var(--muted)]">
              {results.candidates.length} found · {existing.size > 0 ? `${available.length} available to add` : "choose what to monitor"}
            </p>
          </div>
          <IconButton label="Close scan results" onClick={close}>
            <X aria-hidden className="h-4 w-4" />
          </IconButton>
        </div>

        {results.truncated && (
          <p className="border-b border-[color-mix(in_srgb,var(--warning)_35%,transparent)] px-4 py-2 text-[11px] text-[var(--warning)]">
            The scan reached its 500-repository cap. Narrow the folder or scan a subfolder for more.
          </p>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {results.candidates.length === 0 ? (
            <p className="p-6 text-center text-[12px] text-[var(--muted)]">
              No Git repositories were found in this folder.
            </p>
          ) : (
            <ul className="space-y-px">
              {results.candidates.map((candidate) => {
                const already = existing.has(candidate.path);
                const isChecked = checked.has(candidate.path);
                return (
                  <li key={candidate.path}>
                    <label className="flex cursor-pointer items-center gap-2 rounded-[7px] px-2 py-1.5 hover:bg-[var(--surface-2)]">
                      <input
                        type="checkbox"
                        checked={isChecked && !already}
                        disabled={already || busy}
                        onChange={() => toggle(candidate.path)}
                        className="h-3.5 w-3.5 shrink-0 accent-[var(--accent)]"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-[12px] text-[var(--text)]">
                            {escapeUnsafeText(candidate.name)}
                          </span>
                          {already && <Badge tone="neutral">Already added</Badge>}
                        </span>
                        <span
                          className="mono block truncate text-[11px] text-[var(--muted)]"
                          title={candidate.path}
                        >
                          {shortenPath(candidate.path, 64)}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-[var(--border)] p-3">
          {available.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                setChecked(
                  selected.length === available.length
                    ? new Set()
                    : new Set(available.map((candidate) => candidate.path)),
                )
              }
              disabled={busy}
            >
              {selected.length === available.length ? "Clear all" : "Select all"}
            </Button>
          )}
          <span className="text-[11px] text-[var(--muted)]">
            {selected.length} selected
          </span>
          <div className="ml-auto flex gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={clear}
              disabled={busy}
            >
              Dismiss
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={() => void addSelected()}
              disabled={busy || selected.length === 0}
            >
              {busy ? "Adding…" : `Add ${selected.length || ""}`.trim()}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
