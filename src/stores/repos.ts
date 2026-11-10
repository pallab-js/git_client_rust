import { create } from "zustand";

import type { AppError, RepoSummary } from "../lib/bindings.generated";
import { ipc, toAppError } from "../lib/ipc";
import { statusPriority } from "../lib/status";

interface ReposState {
  repos: RepoSummary[];
  selectedId: string | null;
  loading: boolean;
  loaded: boolean;
  error: AppError | null;
  load: () => Promise<void>;
  upsert: (summary: RepoSummary) => void;
  remove: (id: string) => void;
  select: (id: string | null) => void;
  setError: (error: AppError | null) => void;
}

function mergeSummary(repos: RepoSummary[], summary: RepoSummary): RepoSummary[] {
  const index = repos.findIndex((repo) => repo.id === summary.id);
  if (index === -1) {
    return [...repos, summary].sort(compareSummaries);
  }
  const next = repos.slice();
  next[index] = summary;
  return next.sort(compareSummaries);
}

function compareSummaries(a: RepoSummary, b: RepoSummary): number {
  if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
  const priority = statusPriority(b.primaryStatus) - statusPriority(a.primaryStatus);
  if (priority !== 0) return priority;
  const aTime = a.lastCommit?.at ?? "";
  const bTime = b.lastCommit?.at ?? "";
  if (aTime !== bTime) return bTime.localeCompare(aTime);
  return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
}

export const useRepos = create<ReposState>((set, get) => ({
  repos: [],
  selectedId: null,
  loading: false,
  loaded: false,
  error: null,
  load: async () => {
    set({ loading: true, error: null });
    try {
      const repos = await ipc.listRepos();
      const selectedId = get().selectedId;
      set({
        repos,
        loading: false,
        loaded: true,
        selectedId: selectedId && repos.some((repo) => repo.id === selectedId) ? selectedId : null,
      });
    } catch (error) {
      set({ loading: false, loaded: true, error: toAppError(error) });
    }
  },
  upsert: (summary) => {
    set({ repos: mergeSummary(get().repos, summary) });
  },
  remove: (id) => {
    set({
      repos: get().repos.filter((repo) => repo.id !== id),
      selectedId: get().selectedId === id ? null : get().selectedId,
    });
  },
  select: (id) => set({ selectedId: id }),
  setError: (error) => set({ error }),
}));

export function useSelectedRepo(): RepoSummary | null {
  return useRepos((state) => state.repos.find((repo) => repo.id === state.selectedId) ?? null);
}
