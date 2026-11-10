import { AlertTriangle, RotateCw } from "lucide-react";

import type { AppError } from "../../lib/bindings.generated";
import { Button } from "./Button";

interface ErrorCardProps {
  error: AppError;
  onRetry?: () => void;
  compact?: boolean;
}

export function ErrorCard({ error, onRetry, compact }: ErrorCardProps) {
  return (
    <div
      className={
        compact
          ? "rounded-[8px] border border-[color-mix(in_srgb,var(--danger)_35%,transparent)] bg-[var(--surface)] p-3"
          : "rounded-[12px] border border-[color-mix(in_srgb,var(--danger)_35%,transparent)] bg-[var(--surface)] p-4"
      }
      role="alert"
    >
      <div className="flex items-start gap-2.5">
        <AlertTriangle aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-[var(--danger)]" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-[var(--text)]">{error.message}</p>
          {error.details && (
            <details className="mt-1.5">
              <summary className="cursor-pointer text-[11px] text-[var(--muted)]">Details</summary>
              <p className="mono mt-1 break-words whitespace-pre-wrap text-[var(--muted)]">
                [{error.code}] {error.details}
              </p>
            </details>
          )}
          {onRetry && error.retryable && (
            <Button size="sm" variant="ghost" className="mt-2" onClick={onRetry}>
              <RotateCw aria-hidden className="h-3.5 w-3.5" />
              Retry
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
