import type { ButtonHTMLAttributes } from "react";

import { cn } from "../../lib/cn";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  size?: "sm" | "md";
}

export function IconButton({ label, className, size = "md", ...props }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex items-center justify-center rounded-[8px] border border-transparent text-[var(--muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-40",
        size === "sm" ? "h-7 w-7" : "h-8 w-8",
        className,
      )}
      {...props}
    />
  );
}
