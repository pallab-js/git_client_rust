import type { UnlistenFn } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";

import { notifyError } from "./lib/actions";
import { subscribeAppEvents, unsubscribeAll } from "./lib/events";
import { ipc } from "./lib/ipc";
import { navigate, parseRoute, type Route } from "./lib/router";
import { detectSurface } from "./lib/surface";
import { useRepos } from "./stores/repos";
import { useSettings } from "./stores/settings";
import { useUi } from "./stores/ui";
import { AppShell } from "./components/layout/AppShell";
import { TrayPopover } from "./components/tray/TrayPopover";
import { Dashboard } from "./routes/Dashboard";
import { Onboarding } from "./routes/Onboarding";
import { RepoDetail } from "./routes/RepoDetail";
import { Settings } from "./routes/Settings";

export function App() {
  const [surface] = useState(detectSurface);
  if (surface === "popover") {
    return <TrayPopover />;
  }
  return <MainApp />;
}

function MainApp() {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));
  const loadRepos = useRepos((state) => state.load);
  const select = useRepos((state) => state.select);
  const selectedId = useRepos((state) => state.selectedId);
  const loadSettings = useSettings((state) => state.load);

  useEffect(() => {
    if (!window.location.hash) {
      window.history.replaceState(null, "", "#/dashboard");
    }
    const onHashChange = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    void loadRepos();
    void loadSettings();
  }, [loadRepos, loadSettings]);

  useEffect(() => {
    if (route.name === "repo") {
      select(route.id);
    }
  }, [route, select]);

  useEffect(() => {
    let active = true;
    let unlisten: UnlistenFn[] = [];

    void subscribeAppEvents({
      onRepoUpdated: (summary) => {
        useRepos.getState().upsert(summary);
      },
      onRepoRemoved: (id) => {
        useRepos.getState().remove(id);
        const current = parseRoute(window.location.hash);
        if (current.name === "repo" && current.id === id) {
          navigate("dashboard");
        }
      },
      onRepoSelect: (id) => {
        useRepos.getState().select(id);
        navigate(`repo/${id}`);
      },
      onScanProgress: (progress) => {
        useUi.getState().setScanProgress(progress);
      },
      onScanCompleted: (completed) => {
        useUi.getState().setScanResults(completed);
      },
      onAppError: (error) => {
        notifyError(error, "GitPulse ran into a problem");
      },
    })
      .then((listeners) => {
        if (active) {
          unlisten = listeners;
        } else {
          unsubscribeAll(listeners);
        }
      })
      .catch((error: unknown) => {
        notifyError(error, "Could not subscribe to app events");
      });

    return () => {
      active = false;
      unsubscribeAll(unlisten);
    };
  }, []);

  useEffect(() => {
    let active = true;
    let lastRefresh = 0;

    async function consumePendingNavigation() {
      if (!active) return;
      const now = Date.now();
      if (now - lastRefresh > 15_000) {
        lastRefresh = now;
        void ipc.refreshAll().catch(() => undefined);
      }

      let backendSelection: string | null;
      try {
        backendSelection = await ipc.takePendingSelection();
      } catch {
        backendSelection = null;
      }
      if (!active) return;

      const storedSelection = window.localStorage.getItem("gitpulse:select");
      window.localStorage.removeItem("gitpulse:select");
      const selection = backendSelection ?? storedSelection;
      if (selection) {
        useRepos.getState().select(selection);
        navigate(`repo/${selection}`);
      }

      const storedRoute = window.localStorage.getItem("gitpulse:navigate");
      window.localStorage.removeItem("gitpulse:navigate");
      if (storedRoute) {
        navigate(storedRoute);
      }
    }

    void consumePendingNavigation();
    const onFocus = () => void consumePendingNavigation();
    window.addEventListener("focus", onFocus);
    return () => {
      active = false;
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  useEffect(() => {
    const base = "GitPulse";
    if (route.name === "repo") {
      const repo = useRepos.getState().repos.find((item) => item.id === route.id);
      document.title = repo ? `${repo.name} · ${base}` : base;
    } else if (route.name === "settings") {
      document.title = `Settings · ${base}`;
    } else {
      document.title = base;
    }
  }, [route]);

  let content;
  switch (route.name) {
    case "repo":
      content = <RepoDetail id={route.id} />;
      break;
    case "settings":
      content = <Settings />;
      break;
    case "onboarding":
      content = <Onboarding />;
      break;
    default:
      content = <Dashboard />;
  }

  return (
    <AppShell selectedId={selectedId} showSidebar={route.name !== "settings"}>
      {content}
    </AppShell>
  );
}
