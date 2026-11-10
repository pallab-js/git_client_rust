export type Route =
  | { name: "dashboard" }
  | { name: "repo"; id: string }
  | { name: "settings" }
  | { name: "onboarding" };

export function parseRoute(hash: string): Route {
  const clean = hash.replace(/^#\/?/, "");
  if (clean.startsWith("repo/")) {
    const id = clean.slice("repo/".length);
    if (id) return { name: "repo", id };
  }
  if (clean === "settings") return { name: "settings" };
  if (clean === "onboarding") return { name: "onboarding" };
  return { name: "dashboard" };
}

export function routeKey(route: Route): string {
  return route.name === "repo" ? `repo/${route.id}` : route.name;
}

export function navigate(path: string): void {
  const target = path.startsWith("#") ? path : `#/${path.replace(/^\//, "")}`;
  if (window.location.hash !== target) {
    window.location.hash = target;
  }
}

export function openRepo(id: string): void {
  navigate(`repo/${id}`);
}

export function openSettings(): void {
  navigate("settings");
}

export function openDashboard(): void {
  navigate("dashboard");
}
