import { formatRate } from "@/lib/attendance-report";

export type RateBar = { key: string; label: string; rate: number | null; detail: string };

/**
 * A horizontal bar per row, comparing attendance rates. Each bar carries its
 * value as text, so the chart reads without seeing it; rows with no counted
 * sessions show a dash instead of a bar.
 */
export function RateBars({ rows, caption }: { rows: RateBar[]; caption: string }) {
  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="font-heading text-sm font-semibold">{caption}</figcaption>
      <ul className="flex flex-col divide-y divide-rule border-y border-rule">
        {rows.map((r) => (
          <li key={r.key} className="grid grid-cols-[minmax(7rem,12rem)_1fr_3.5rem] items-center gap-3 py-2">
            <span className="truncate font-semibold" title={r.label}>
              {r.label}
            </span>
            <span className="relative h-4 rounded-sm border border-rule bg-panel" aria-hidden>
              {r.rate !== null ? (
                <span className="absolute inset-y-0 left-0 rounded-sm bg-accent" style={{ width: `${Math.round(r.rate * 100)}%` }} />
              ) : null}
            </span>
            <span className="text-right font-heading font-bold tabular-nums">
              {formatRate(r.rate)}
              <span className="sr-only">, {r.detail}</span>
            </span>
          </li>
        ))}
      </ul>
    </figure>
  );
}
