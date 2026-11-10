import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";

import { cn } from "../../lib/cn";
import { useUi, type ToastTone } from "../../stores/ui";
import { IconButton } from "./IconButton";

const TONE_CLASSES: Record<ToastTone, string> = {
  info: "border-[var(--border)] text-[var(--info)]",
  success: "border-[color-mix(in_srgb,var(--success)_40%,transparent)] text-[var(--success)]",
  warning: "border-[color-mix(in_srgb,var(--warning)_40%,transparent)] text-[var(--warning)]",
  danger: "border-[color-mix(in_srgb,var(--danger)_40%,transparent)] text-[var(--danger)]",
};

function ToastIcon({ tone }: { tone: ToastTone }) {
  switch (tone) {
    case "success":
      return <CheckCircle2 aria-hidden className="h-4 w-4" />;
    case "warning":
    case "danger":
      return <AlertTriangle aria-hidden className="h-4 w-4" />;
    default:
      return <Info aria-hidden className="h-4 w-4" />;
  }
}

export function ToastHost({ surface = "main" }: { surface?: "main" | "popover" }) {
  const toasts = useUi((state) => state.toasts);
  const dismiss = useUi((state) => state.dismissToast);

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className={cn(
        "pointer-events-none fixed z-50 flex w-[min(360px,calc(100vw-24px))] flex-col gap-2",
        surface === "main" ? "right-4 bottom-4" : "top-2 right-2 left-2 w-auto",
      )}
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            "pointer-events-auto flex items-start gap-2.5 rounded-[10px] border bg-[var(--surface)] p-3 shadow-[var(--shadow)]",
            TONE_CLASSES[toast.tone],
          )}
        >
          <span className="mt-0.5 shrink-0">
            <ToastIcon tone={toast.tone} />
          </span>
          <div className="min-w-0 flex-1 text-[var(--text)]">
            <p className="text-[12px] font-semibold">{toast.title}</p>
            {toast.message && (
              <p className="mt-0.5 text-[12px] text-[var(--muted)]">{toast.message}</p>
            )}
          </div>
          <IconButton label="Dismiss notification" size="sm" onClick={() => dismiss(toast.id)}>
            <X aria-hidden className="h-3.5 w-3.5" />
          </IconButton>
        </div>
      ))}
    </div>
  );
}
