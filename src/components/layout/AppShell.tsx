import type { ReactNode } from "react";

import { ToastHost } from "../ui/Toast";
import { Header } from "./Header";
import { LiveRegion } from "./LiveRegion";
import { Sidebar } from "./Sidebar";

interface AppShellProps {
  children: ReactNode;
  selectedId?: string | null;
  showSidebar?: boolean;
}

export function AppShell({ children, selectedId, showSidebar = true }: AppShellProps) {
  return (
    <div className="flex h-full flex-col bg-[var(--bg)]">
      <a
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          const main = document.getElementById("main-content");
          main?.scrollIntoView({ block: "start" });
          main?.focus();
        }}
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-[var(--surface)] focus:px-3 focus:py-1.5"
      >
        Skip to content
      </a>
      <Header showSidebar={showSidebar} />
      <div className="flex min-h-0 flex-1">
        {showSidebar && <Sidebar selectedId={selectedId} />}
        <main
          id="main-content"
          tabIndex={-1}
          className="min-w-0 flex-1 overflow-y-auto focus:outline-none"
        >
          {children}
        </main>
      </div>
      <ToastHost surface="main" />
      <LiveRegion />
    </div>
  );
}
