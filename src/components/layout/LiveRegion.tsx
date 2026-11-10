import { useEffect, useRef } from "react";

import { statusMeta } from "../../lib/status";
import { useRepos } from "../../stores/repos";
import { useUi } from "../../stores/ui";

export function LiveRegion() {
  const repos = useRepos((state) => state.repos);
  const message = useUi((state) => state.liveMessage);
  const setMessage = useUi((state) => state.setLiveMessage);
  const previous = useRef(new Map<string, string>());
  const lastAnnouncement = useRef(0);

  useEffect(() => {
    const now = Date.now();
    if (now - lastAnnouncement.current < 2000) return;
    for (const repo of repos) {
      const before = previous.current.get(repo.id);
      previous.current.set(repo.id, repo.primaryStatus);
      if (before && before !== repo.primaryStatus && repo.primaryStatus !== "scanning") {
        lastAnnouncement.current = now;
        setMessage(`${repo.name} is now ${statusMeta(repo.primaryStatus).label.toLowerCase()}.`);
        break;
      }
    }
  }, [repos, setMessage]);

  return (
    <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
      {message}
    </div>
  );
}
