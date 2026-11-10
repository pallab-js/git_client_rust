import { Search } from "lucide-react";
import { useEffect, useRef, useState, type InputHTMLAttributes, type SelectHTMLAttributes } from "react";

import { cn } from "../../lib/cn";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
}

export function Input({ label, hint, className, id, ...props }: InputProps) {
  const inputId = id ?? props.name;
  return (
    <label className="block">
      {label && (
        <span className="mb-1 block text-[12px] font-medium text-[var(--muted)]">{label}</span>
      )}
      <input
        id={inputId}
        className={cn(
          "h-8 w-full rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-2.5 text-[13px] text-[var(--text)] placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:outline-none",
          className,
        )}
        {...props}
      />
      {hint && <span className="mt-1 block text-[11px] text-[var(--muted)]">{hint}</span>}
    </label>
  );
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
}

export function Select({ label, hint, className, children, ...props }: SelectProps) {
  return (
    <label className="block">
      {label && (
        <span className="mb-1 block text-[12px] font-medium text-[var(--muted)]">{label}</span>
      )}
      <select
        className={cn(
          "h-8 w-full rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-2 text-[13px] text-[var(--text)] focus:border-[var(--accent)] focus:outline-none",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      {hint && <span className="mt-1 block text-[11px] text-[var(--muted)]">{hint}</span>}
    </label>
  );
}

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  debounceMs?: number;
  className?: string;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}

export function SearchInput({
  value,
  onChange,
  placeholder = "Search repositories",
  debounceMs = 150,
  className,
  inputRef,
}: SearchInputProps) {
  const [local, setLocal] = useState(value);
  const latestOnChange = useRef(onChange);

  useEffect(() => {
    latestOnChange.current = onChange;
  }, [onChange]);

  useEffect(() => {
    setLocal(value);
  }, [value]);

  useEffect(() => {
    if (local === value) return;
    const timer = window.setTimeout(() => latestOnChange.current(local), debounceMs);
    return () => window.clearTimeout(timer);
  }, [local, value, debounceMs]);

  return (
    <div className={cn("relative", className)}>
      <Search
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-[var(--muted)]"
      />
      <input
        ref={inputRef}
        type="search"
        value={local}
        onChange={(event) => setLocal(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-8 w-full rounded-[8px] border border-[var(--border)] bg-[var(--surface)] pr-2 pl-8 text-[13px] text-[var(--text)] placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:outline-none"
      />
    </div>
  );
}
