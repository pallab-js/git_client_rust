import type { FileChange } from "../../lib/bindings.generated";
import { changeKey, groupChanges } from "../../lib/status";
import { ChangeRow } from "./ChangeRow";

interface ChangeListProps {
  changes: FileChange[];
  selectedKey: string | null;
  onSelect: (change: FileChange) => void;
}

export function ChangeList({ changes, selectedKey, onSelect }: ChangeListProps) {
  if (changes.length === 0) {
    return (
      <p className="px-2 py-6 text-center text-[12px] text-[var(--muted)]">
        No working-tree changes.
      </p>
    );
  }

  const groups = groupChanges(changes);
  const sections: Array<{ key: string; label: string; items: FileChange[] }> = [
    { key: "conflicted", label: "Conflicts", items: groups.conflicted },
    { key: "staged", label: "Staged", items: groups.staged },
    { key: "unstaged", label: "Unstaged", items: groups.unstaged },
    { key: "untracked", label: "Untracked", items: groups.untracked },
  ];

  return (
    <div className="space-y-3">
      {sections
        .filter((section) => section.items.length > 0)
        .map((section) => (
          <section key={section.key} aria-labelledby={`changes-${section.key}`}>
            <h3
              id={`changes-${section.key}`}
              className="flex items-center gap-2 px-2 pb-1 text-[10px] font-semibold tracking-[0.08em] text-[var(--muted)] uppercase"
            >
              {section.label}
              <span className="rounded-full bg-[var(--surface-2)] px-1.5 text-[10px] tabular-nums">
                {section.items.length}
              </span>
            </h3>
            <div className="space-y-px">
              {section.items.map((change) => {
                const key = changeKey(change);
                return (
                  <ChangeRow
                    key={key}
                    change={change}
                    selected={selectedKey === key}
                    onSelect={onSelect}
                  />
                );
              })}
            </div>
          </section>
        ))}
    </div>
  );
}
