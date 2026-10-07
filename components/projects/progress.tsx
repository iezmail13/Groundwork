/** Ruled progress bar with the numbers in text (the bar is decoration). */
export function ProgressBar({ done, total, label }: { done: number; total: number; label?: string }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div className="flex min-w-32 items-center gap-2">
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-valuetext={`${done} of ${total} done`}
        aria-label={label}
        className="h-2 flex-1 overflow-hidden rounded-full border border-rule bg-panel"
      >
        <div className="progress-fill h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-14 text-right text-sm tabular-nums text-ink-muted">
        {done}/{total}
      </span>
    </div>
  );
}
