import Link from "next/link";
import type { ReactNode } from "react";

// Hand-built charts (D105). Every chart is a <figure> with a <figcaption>, a
// visually hidden data table, and visible values on its marks. Every mark is
// a link with a full label ("3 overdue tasks, open list"). Values animate to
// their new size on live updates (CSS transitions), except under reduced motion.

/** A colour from the fixed status palette or the neutral chart series (D83). */
export type Tone = "good" | "warn" | "bad" | "accent" | "neutral" | "chart2" | "chart3" | "chart4" | "chart5" | "prio-critical" | "prio-high" | "prio-medium" | "prio-low";

const TONE_VAR: Record<Tone, string> = {
  good: "var(--good)",
  warn: "var(--warn)",
  bad: "var(--bad)",
  accent: "var(--chart-1)",
  neutral: "var(--chart-3)",
  chart2: "var(--chart-2)",
  chart3: "var(--chart-3)",
  chart4: "var(--chart-4)",
  chart5: "var(--chart-5)",
  "prio-critical": "var(--prio-critical)",
  "prio-high": "var(--prio-high)",
  "prio-medium": "var(--prio-medium)",
  "prio-low": "var(--prio-low)",
};
export const toneColor = (tone: Tone) => TONE_VAR[tone];

export type Mark = {
  key: string;
  label: string;
  value: number;
  tone: Tone;
  href: string;
  /** What following the mark does, read in full: "3 overdue tasks, open list". */
  ariaLabel: string;
  /** A symbol next to the label, so colour is never the only signal. */
  symbol?: ReactNode;
};

const TRANSITION = "transition-all duration-700 ease-out motion-reduce:transition-none";

/** The hidden table every chart carries, for screen readers and copying. */
function DataTable({ caption, head, rows }: { caption: string; head: string[]; rows: (string | number)[][] }) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>
          {head.map((h) => (
            <th key={h} scope="col">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map((c, j) =>
              j === 0 ? (
                <th key={j} scope="row">
                  {c}
                </th>
              ) : (
                <td key={j}>{c}</td>
              ),
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function MarkLink({ mark, className, children, style }: { mark: Mark; className?: string; children: ReactNode; style?: React.CSSProperties }) {
  return (
    <Link href={mark.href} aria-label={mark.ariaLabel} className={className} style={style} data-mark={mark.key}>
      {children}
    </Link>
  );
}

/** A ring split into segments, with the total in the middle and a legend of links. */
export function Donut({ caption, marks, centre, centreLabel }: { caption: string; marks: Mark[]; centre: number; centreLabel: string }) {
  const total = marks.reduce((s, m) => s + m.value, 0);
  let offset = 25; // start at twelve o'clock
  return (
    <figure className="flex flex-wrap items-center gap-4">
      <figcaption className="sr-only">{caption}</figcaption>
      <svg viewBox="0 0 42 42" className="size-32 shrink-0" role="presentation">
        <circle cx="21" cy="21" r="15.915" fill="none" strokeWidth="6" style={{ stroke: "var(--panel)" }} />
        {total > 0
          ? marks.map((m) => {
              const pct = (m.value / total) * 100;
              const seg = (
                <a key={m.key} href={m.href} aria-label={m.ariaLabel} data-mark={m.key} className="focus:outline-none [&:focus-visible>circle]:stroke-[8]">
                  <circle
                    cx="21"
                    cy="21"
                    r="15.915"
                    fill="none"
                    strokeWidth="6"
                    strokeDasharray={`${pct} ${100 - pct}`}
                    strokeDashoffset={offset}
                    className={TRANSITION}
                    style={{ stroke: toneColor(m.tone) }}
                  />
                </a>
              );
              offset -= pct;
              return m.value > 0 ? seg : null;
            })
          : null}
        <text x="21" y="21" textAnchor="middle" dominantBaseline="central" className="fill-ink font-heading text-[0.55rem] font-bold" aria-hidden>
          {centre}
        </text>
        <text x="21" y="27.5" textAnchor="middle" className="fill-ink-muted text-[0.22rem]" aria-hidden>
          {centreLabel}
        </text>
      </svg>
      <ul className="flex min-w-0 flex-1 flex-col gap-1">
        {marks.map((m) => (
          <li key={m.key}>
            <MarkLink mark={m} className="flex items-center gap-2 rounded px-1 py-0.5 hover:bg-panel">
              <span aria-hidden className="size-3 shrink-0 rounded-sm" style={{ background: toneColor(m.tone) }} />
              {m.symbol}
              <span className="min-w-0 flex-1 truncate text-sm">{m.label}</span>
              <span className="font-heading font-bold tabular-nums">{m.value}</span>
            </MarkLink>
          </li>
        ))}
      </ul>
      <DataTable caption={caption} head={["Part", "Count"]} rows={marks.map((m) => [m.label, m.value])} />
    </figure>
  );
}

/** One horizontal bar per row, scaled to the largest (or to `max`). */
export function BarList({
  caption,
  rows,
  max,
  format = (v) => String(v),
  valueHead = "Count",
}: {
  caption: string;
  rows: (Mark & { note?: string })[];
  max?: number;
  format?: (value: number) => string;
  valueHead?: string;
}) {
  const top = max ?? Math.max(1, ...rows.map((r) => r.value));
  return (
    <figure className="flex flex-col gap-1">
      <figcaption className="sr-only">{caption}</figcaption>
      <ul className="flex flex-col gap-1">
        {rows.map((r) => (
          <li key={r.key}>
            <MarkLink mark={r} className="grid grid-cols-[minmax(4.5rem,9rem)_minmax(3rem,1fr)_auto] items-center gap-2 rounded px-1 py-1 hover:bg-panel">
              <span className="flex min-w-0 items-center gap-1.5 text-sm">
                {r.symbol}
                <span className="truncate">{r.label}</span>
              </span>
              <span aria-hidden className="relative h-3 rounded-sm bg-panel">
                <span
                  className={`absolute inset-y-0 left-0 rounded-sm ${TRANSITION}`}
                  style={{ width: `${Math.min(100, (r.value / top) * 100)}%`, background: toneColor(r.tone) }}
                />
              </span>
              <span className="text-right font-heading text-sm font-bold tabular-nums">
                {format(r.value)}
                {r.note ? <span className="ml-1 font-sans text-xs font-normal whitespace-nowrap text-ink-muted">{r.note}</span> : null}
              </span>
            </MarkLink>
          </li>
        ))}
      </ul>
      <DataTable caption={caption} head={["Item", valueHead]} rows={rows.map((r) => [r.label, `${format(r.value)}${r.note ? ` (${r.note})` : ""}`])} />
    </figure>
  );
}

/** One bar per row, split into parts; each part is its own link. */
export function StackedBars({
  caption,
  rows,
  legend,
}: {
  caption: string;
  rows: { key: string; label: string; marks: Mark[] }[];
  legend: { label: string; tone: Tone; symbol?: ReactNode }[];
}) {
  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="sr-only">{caption}</figcaption>
      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs" aria-hidden>
        {legend.map((l) => (
          <li key={l.label} className="inline-flex items-center gap-1">
            <span className="size-2.5 rounded-sm" style={{ background: toneColor(l.tone) }} />
            {l.symbol}
            {l.label}
          </li>
        ))}
      </ul>
      <ul className="flex flex-col gap-2">
        {rows.map((row) => {
          const total = row.marks.reduce((s, m) => s + m.value, 0);
          return (
            <li key={row.key} className="flex flex-col gap-1">
              <span className="flex items-baseline justify-between gap-2 text-sm">
                <span className="truncate font-semibold">{row.label}</span>
                <span className="font-heading text-xs font-bold tabular-nums text-ink-muted">{total}</span>
              </span>
              <span className="flex h-6 overflow-hidden rounded-sm border border-rule">
                {row.marks
                  .filter((m) => m.value > 0)
                  .map((m) => (
                    <MarkLink
                      key={m.key}
                      mark={m}
                      className={`flex items-center justify-center font-heading text-xs font-bold hover:opacity-90 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink ${TRANSITION}`}
                      style={{ width: `${(m.value / total) * 100}%`, background: toneColor(m.tone) }}
                    >
                      {/* the value sits on a canvas chip, so it reads on any segment colour */}
                      <span aria-hidden className="inline-flex items-center gap-0.5 rounded-sm bg-canvas px-1 text-ink">
                        {m.symbol}
                        {m.value}
                      </span>
                    </MarkLink>
                  ))}
              </span>
            </li>
          );
        })}
      </ul>
      <DataTable
        caption={caption}
        head={["Row", ...legend.map((l) => l.label)]}
        rows={rows.map((r) => [r.label, ...legend.map((l) => r.marks.find((m) => m.label === l.label)?.value ?? 0)])}
      />
    </figure>
  );
}

/** A line through points (0–1), with dashed threshold lines; each point is a link. */
export function TrendLine({
  caption,
  points,
  low,
  high,
  pointHead,
}: {
  caption: string;
  /** What each point is, for the hidden table's heading. */
  pointHead: string;
  points: { key: string; label: string; value: number; href: string; ariaLabel: string; tone: Tone }[];
  low: number;
  high: number;
}) {
  const W = 300;
  const H = 90;
  const x = (i: number) => (points.length <= 1 ? W / 2 : 12 + (i * (W - 24)) / (points.length - 1));
  const y = (v: number) => 8 + (1 - v) * (H - 16);
  return (
    <figure className="flex flex-col gap-1">
      <figcaption className="text-xs text-ink-muted">{caption}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-24 w-full" role="presentation" preserveAspectRatio="none">
        {[low, high].map((t) => (
          <line key={t} x1="0" x2={W} y1={y(t / 100)} y2={y(t / 100)} strokeDasharray="4 3" strokeWidth="1" style={{ stroke: "var(--rule)" }} />
        ))}
        <polyline
          fill="none"
          strokeWidth="2"
          points={points.map((p, i) => `${x(i)},${y(p.value)}`).join(" ")}
          style={{ stroke: "var(--chart-1)" }}
          vectorEffect="non-scaling-stroke"
        />
        {points.map((p, i) => (
          <a key={p.key} href={p.href} aria-label={p.ariaLabel} data-mark={p.key} className="[&:focus-visible>circle]:stroke-ink [&:focus-visible>circle]:stroke-2">
            <circle cx={x(i)} cy={y(p.value)} r="5" className={TRANSITION} style={{ fill: toneColor(p.tone) }} vectorEffect="non-scaling-stroke" />
          </a>
        ))}
      </svg>
      <DataTable caption={caption} head={[pointHead, "Rate"]} rows={points.map((p) => [p.label, `${Math.round(p.value * 100)}%`])} />
    </figure>
  );
}

/** The big number at the top of every widget. */
export function BigNumber({ value, label }: { value: number | string; label: string }) {
  return (
    <p className="flex items-baseline gap-2">
      <span className="font-heading text-3xl font-bold tabular-nums">{value}</span>
      <span className="text-sm text-ink-muted">{label}</span>
    </p>
  );
}
