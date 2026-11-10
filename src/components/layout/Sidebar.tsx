import { FolderSearch, Plus } from "lucide-react";

import { pickAndAddRepo, pickAndScan } from "../../lib/actions";
import { useRepos } from "../../stores/repos";
import { useUi } from "../../stores/ui";
import { RepoRow } from "../repo/RepoRow";
import { Button } from "../ui/Button";
import { SearchInput } from "../ui/Field";
import { Spinner } from "../ui/EmptyState";

export function Sidebar({ selectedId }: { selectedId?: string | null }) {
  const repos = useRepos((state) => state.repos);
  const loading = useRepos((state) => state.loading);
  const loaded = useRepos((state) => state.loaded);
  const select = useRepos((state) => state.select);
  const search = useUi((state) => state.search);
  const setSearch = useUi((state) => state.setSearch);
  const scan = useUi((state) => state.scan);

  const filtered = repos.filter((repo) => {
    if (!search.trim()) return true;
    const needle = search.toLowerCase();
    return (
      repo.name.toLowerCase().includes(needle) || repo.path.toLowerCase().includes(needle)
    );
  });

  return (
    <aside className="flex w-[260px] shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)]">
      <div className="p-2.5">
        <SearchInput value={search} onChange={setSearch} placeholder="Search repos" />
      </div>
      <div className="flex items-center justify-between px-3 pb-1">
        <span className="text-[10px] font-semibold tracking-[0.08em] text-[var(--muted)] uppercase">
          Repos {repos.length > 0 ? repos.length : ""}
        </span>
        {loading && <Spinner className="h-3 w-3" />}
      </div>
      <nav aria-label="Repositories" className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
        {filtered.map((repo) => (
          <RepoRow
            key={repo.id}
            summary={repo}
            selected={selectedId === repo.id}
            pinned={repo.pinned}
            onSelect={(id) => {
              select(id);
              window.location.hash = `#/repo/${id}`;
            }}
          />
        ))}
        {loaded && repos.length > 0 && filtered.length === 0 && (
          <p className="px-3 py-4 text-[12px] text-[var(--muted)]">No repositories match.</p>
        )}
        {loaded && repos.length === 0 && (
          <p className="px-3 py-4 text-[12px] text-[var(--muted)]">
            No repositories yet. Add one to get started.
          </p>
        )}
      </nav>
      {scan && (
        <div className="border-t border-[var(--border)] px-3 py-2 text-[11px] text-[var(--muted)]">
          <div className="flex items-center gap-1.5">
            <Spinner className="h-3 w-3" />
            Scanning… {scan.found} found
          </div>
          <p className="mt-0.5 truncate" title={scan.currentPath}>
            {scan.currentPath}
          </p>
        </div>
      )}
      <div className="flex gap-1.5 border-t border-[var(--border)] p-2">
        <Button variant="primary" size="sm" className="flex-1" onClick={() => void pickAndAddRepo()}>
          <Plus aria-hidden className="h-3.5 w-3.5" />
          Add repo
        </Button>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Scan a folder for repositories"
          title="Scan a folder for repositories"
          onClick={() => void pickAndScan()}
        >
          <FolderSearch aria-hidden className="h-3.5 w-3.5" />
        </Button>
      </div>
    </aside>
  );
}
