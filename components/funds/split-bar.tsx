import { formatMoney, formatShare } from "@/lib/money";

// Each part of a fund gets a fill from the navy and bone scales that differs
// in shade AND pattern from its neighbours, so parts can be told apart
// without colour, and every part is named with its amount in the legend.
const NAVY = "var(--navy-900)";
const mix = (pct: number) => `color-mix(in oklab, ${NAVY} ${pct}%, var(--bone-50))`;
export const PART_FILLS = [
  NAVY,
  `repeating-linear-gradient(45deg, ${NAVY} 0 3px, ${mix(55)} 3px 7px)`,
  mix(55),
  `repeating-linear-gradient(-45deg, ${mix(80)} 0 2px, var(--bone-50) 2px 6px)`,
  mix(30),
  `radial-gradient(${NAVY} 1.4px, ${mix(14)} 1.6px) 0 0 / 6px 6px`,
  mix(75),
  `repeating-linear-gradient(90deg, ${mix(65)} 0 2px, var(--bone-100) 2px 5px)`,
];
export const fillFor = (i: number) => PART_FILLS[i % PART_FILLS.length]!;

export type Part = { key: string; label: string; cents: number; project?: string | null };

/**
 * One fund as a single bar split into its parts, with the unallocated rest
 * as an outlined gap. `legend` lists every part with its amount and share.
 */
export function SplitBar({
  parts,
  totalCents,
  currency,
  caption,
  legend = true,
  size = "md",
}: {
  parts: Part[];
  totalCents: number;
  currency: string;
  caption: string;
  legend?: boolean;
  size?: "sm" | "md";
}) {
  const allocated = parts.reduce((s, p) => s + p.cents, 0);
  const rest = Math.max(0, totalCents - allocated);
  const pct = (c: number) => (totalCents > 0 ? (c / totalCents) * 100 : 0);
  const summary = `${caption}: ${parts.map((p) => `${p.label} ${formatMoney(p.cents, currency, true)} (${formatShare(p.cents, totalCents)})`).join(", ")}${
    rest ? `, unallocated ${formatMoney(rest, currency, true)} (${formatShare(rest, totalCents)})` : ""
  }`;
  return (
    <figure className="flex flex-col gap-3">
      <figcaption className="sr-only">{summary}</figcaption>
      <div
        aria-hidden
        className={`flex w-full overflow-hidden rounded-sm border border-ink ${size === "sm" ? "h-4" : "h-9"}`}
      >
        {parts.map((p, i) => (
          <span
            key={p.key}
            className="h-full border-r-2 border-canvas last:border-r-0"
            style={{ width: `${pct(p.cents)}%`, background: fillFor(i) }}
            title={`${p.label}: ${formatMoney(p.cents, currency)}`}
          />
        ))}
        {rest ? <span className="h-full bg-canvas" style={{ width: `${pct(rest)}%` }} title={`Unallocated: ${formatMoney(rest, currency)}`} /> : null}
      </div>
      {legend ? (
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-ink font-heading text-sm">
              <th scope="col" className="py-2 pr-4 font-semibold">
                Part
              </th>
              <th scope="col" className="py-2 pr-4 text-right font-semibold">
                Amount
              </th>
              <th scope="col" className="py-2 text-right font-semibold">
                Share
              </th>
            </tr>
          </thead>
          <tbody>
            {parts.map((p, i) => (
              <tr key={p.key} className="border-b border-rule">
                <th scope="row" className="py-2 pr-4 font-semibold">
                  <span className="flex items-center gap-2.5">
                    <span aria-hidden className="inline-block size-4 shrink-0 rounded-sm border border-ink" style={{ background: fillFor(i) }} />
                    <span>
                      {p.label}
                      {p.project ? <span className="block text-sm font-normal text-ink-muted">{p.project}</span> : null}
                    </span>
                  </span>
                </th>
                <td className="py-2 pr-4 text-right tabular-nums">{formatMoney(p.cents, currency)}</td>
                <td className="py-2 text-right font-heading font-bold tabular-nums">{formatShare(p.cents, totalCents)}</td>
              </tr>
            ))}
            <tr className="border-b border-rule">
              <th scope="row" className="py-2 pr-4 font-normal italic">
                <span className="flex items-center gap-2.5">
                  <span aria-hidden className="inline-block size-4 shrink-0 rounded-sm border border-dashed border-ink bg-canvas" />
                  Unallocated
                </span>
              </th>
              <td className="py-2 pr-4 text-right tabular-nums">{formatMoney(rest, currency)}</td>
              <td className="py-2 text-right font-heading font-bold tabular-nums">{formatShare(rest, totalCents)}</td>
            </tr>
          </tbody>
        </table>
      ) : null}
    </figure>
  );
}
