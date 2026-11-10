import { Activity, FolderSearch, Lock, MonitorSmartphone, Plus } from "lucide-react";

import { pickAndAddRepo, pickAndScan } from "../lib/actions";
import { Button } from "../components/ui/Button";

export function Onboarding() {
  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col justify-center p-8">
      <div className="rounded-[12px] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow)]">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-[var(--accent)] text-white">
            <Activity aria-hidden className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-[18px] font-semibold text-[var(--text)]">
              Welcome to GitPulse
            </h1>
            <p className="text-[13px] text-[var(--muted)]">
              A calm, read-only view of your local repositories.
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Button variant="primary" className="h-10 justify-start" onClick={() => void pickAndAddRepo()}>
            <Plus aria-hidden className="h-4 w-4" />
            Add a repository
          </Button>
          <Button
            variant="ghost"
            className="h-10 justify-start"
            onClick={() => void pickAndScan()}
          >
            <FolderSearch aria-hidden className="h-4 w-4" />
            Scan a folder
          </Button>
        </div>

        <ul className="mt-6 space-y-2.5 text-[12px] text-[var(--muted)]">
          <li className="flex items-start gap-2">
            <Lock aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--success)]" />
            GitPulse never stages, commits, fetches, pulls, or pushes. Your repositories stay
            untouched.
          </li>
          <li className="flex items-start gap-2">
            <MonitorSmartphone
              aria-hidden
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--info)]"
            />
            Everything stays on this machine. No telemetry, no network requests, no account.
          </li>
          <li className="flex items-start gap-2">
            <Activity aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
            Live working-tree status, ahead/behind counts, and merge-conflict warnings from the
            tray or dashboard.
          </li>
        </ul>
      </div>

      <p className="mt-4 text-center text-[11px] text-[var(--muted)]">
        Folder scanning looks three levels deep and skips heavy build folders.
      </p>
    </div>
  );
}
