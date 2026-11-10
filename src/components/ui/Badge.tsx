import type { ReactNode } from "react";

import { cn } from "../../lib/cn";
import { formatCount } from "../../lib/format";
import type { Tone } from "../../lib/status";

const TONES: Record<Tone, string> = {
  neutral: "border-[var(--border)] text-[var(--muted)] bg-[var(--surface-2)]",
  success:
    "border-[color-mix(in_srgb,var(--success)_35%,transparent)] text-[var(--success)] bg-[var(--surface-2)]",
  warning:
    "border-[color-mix(in_srgb,var(--warning)_40%,transparent)] text-[var(--warning)] bg-[var(--surface-2)]",
  danger:
    "border-[color-mix(in_srgb,var(--danger)_40%,transparent)] text-[var(--danger)] bg-[var(--surface-2)]",
  info: "border-[color-mix(in_srgb,var(--info)_40%,transparent)] text-[var(--info)] bg-[var(--surface-2)]",
  accent:
    "border-[color-mix(in_srgb,var(--accent)_40%,transparent)] text-[var(--accent)] bg-[var(--surface-2)]",
};

interface BadgeProps {
  tone?: Tone;
  children: ReactNode;
  className?: string;
  title?: string;
}

export function Badge({ tone = "neutral", children, className, title }: BadgeProps) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] leading-4 whitespace-nowrap",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function CountBadge({ value, tone = "neutral" }: { value: number; tone?: Tone }) {
  if (value <= 0) return null;
  return (
    <Badge tone={tone} className="min-w-5 justify-center px-1.5 tabular-nums">
      {formatCount(value)}
    </Badge>
  );
}
