import type { ButtonHTMLAttributes, Ref } from "react";

import { cn } from "../../lib/cn";

type Variant = "primary" | "ghost" | "danger" | "subtle";
type Size = "sm" | "md";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  ref?: Ref<HTMLButtonElement>;
}

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-[var(--accent)] text-white hover:brightness-110 border border-transparent shadow-sm",
  ghost:
    "bg-transparent text-[var(--text)] border border-[var(--border)] hover:bg-[var(--surface-2)]",
  danger:
    "bg-[var(--danger)] text-white hover:brightness-110 border border-transparent",
  subtle:
    "bg-[var(--surface-2)] text-[var(--text)] border border-transparent hover:bg-[var(--border)]",
};

const SIZES: Record<Size, string> = {
  sm: "h-7 px-2.5 text-[12px] gap-1.5 rounded-[6px]",
  md: "h-8 px-3 text-[13px] gap-2 rounded-[8px]",
};

export function Button({
  variant = "ghost",
  size = "md",
  className,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    />
  );
}
