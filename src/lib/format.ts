export function escapeUnsafeText(value: string | null | undefined): string {
  if (!value) return "";
  let output = "";
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (
      code <= 0x1f ||
      (code >= 0x7f && code <= 0x9f) ||
      (code >= 0x200e && code <= 0x200f) ||
      (code >= 0x202a && code <= 0x202e) ||
      (code >= 0x2066 && code <= 0x2069)
    ) {
      output += `\\u${code.toString(16).padStart(4, "0")}`;
    } else {
      output += character;
    }
  }
  return output;
}

export function shortenPath(path: string, maxLength = 42): string {
  const escaped = escapeUnsafeText(path)
    .replace(/^\/Users\/[^/]+/u, "~")
    .replace(/^\/home\/[^/]+/u, "~");
  if (escaped.length <= maxLength) return escaped;
  const parts = escaped.split("/");
  if (parts.length <= 2) {
    return `…${escaped.slice(-(maxLength - 1))}`;
  }
  const tail = parts.slice(-2).join("/");
  if (tail.length + 2 <= maxLength) return `…/${tail}`;
  return `…${escaped.slice(-(maxLength - 1))}`;
}

export function relativeTime(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "never";
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return "unknown";
  const seconds = Math.max(0, Math.round((now - time) / 1000));
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.round(months / 12)}y ago`;
}

export function formatCount(value: number): string {
  return value > 99 ? "99+" : String(value);
}

export function plural(count: number, singular: string, pluralForm?: string): string {
  return count === 1 ? singular : (pluralForm ?? `${singular}s`);
}

export function shortSha(sha: string | null | undefined): string {
  return sha ? sha.slice(0, 7) : "";
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function lastCommitTime(summary: {
  lastCommit: { at: string } | null;
}): string {
  return summary.lastCommit?.at ?? "";
}
