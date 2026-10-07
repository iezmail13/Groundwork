import type { ComponentProps, ReactNode } from "react";

export const inputClass =
  "w-full rounded-md border border-rule bg-canvas px-3 py-2 text-ink placeholder:text-ink-muted hover:border-ink-muted focus-visible:border-ink focus-visible:outline-2 focus-visible:outline-offset-0 aria-[invalid=true]:border-ink aria-[invalid=true]:border-2";

export function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
  className = "",
}: {
  label: ReactNode;
  htmlFor: string;
  error?: string[] | string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const message = Array.isArray(error) ? error[0] : error;
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={htmlFor} className="font-heading text-sm font-semibold">
        {label}
      </label>
      {children}
      {hint && !message ? (
        <p id={`${htmlFor}-hint`} className="text-sm text-ink-muted">
          {hint}
        </p>
      ) : null}
      {message ? (
        <p id={`${htmlFor}-error`} className="text-sm font-semibold" role="alert">
          <span aria-hidden>! </span>
          {message}
        </p>
      ) : null}
    </div>
  );
}

export function Input({ className = "", invalid, ...props }: ComponentProps<"input"> & { invalid?: boolean }) {
  return (
    <input
      className={`${inputClass} ${className}`}
      aria-invalid={invalid || undefined}
      aria-describedby={invalid ? `${props.id}-error` : undefined}
      {...props}
    />
  );
}

export function Textarea({ className = "", invalid, ...props }: ComponentProps<"textarea"> & { invalid?: boolean }) {
  return (
    <textarea
      className={`${inputClass} min-h-24 ${className}`}
      aria-invalid={invalid || undefined}
      aria-describedby={invalid ? `${props.id}-error` : undefined}
      {...props}
    />
  );
}

export function Select({ className = "", invalid, ...props }: ComponentProps<"select"> & { invalid?: boolean }) {
  return (
    <select
      className={`${inputClass} appearance-auto ${className}`}
      aria-invalid={invalid || undefined}
      aria-describedby={invalid ? `${props.id}-error` : undefined}
      {...props}
    />
  );
}
