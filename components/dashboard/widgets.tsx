import Link from "next/link";
import { CalendarDays, Check, Clock, Flag, ListChecks, TriangleAlert } from "lucide-react";
import { BarList, BigNumber, Donut, StackedBars, TrendLine } from "@/components/charts/charts";
import { SplitBar } from "@/components/funds/split-bar";
import { formatMoney, formatShare } from "@/lib/money";
import type { Translate } from "@/lib/terminology/t";
import { lower } from "@/lib/terminology/t";
import type { DashboardModel, Detail, ProjectDashboardModel } from "@/lib/dashboard-data";
import { DueBadge, TaskStatusBadge } from "@/components/tasks/badges";

// Dashboard widgets (D105): read-only summaries, rendered on the server from
// numbers the database already filtered for the viewer. Each has a big number
// and a chart whose every mark is a link.

export type FundSummary = {
  id: string;
  name: string;
  currency: string;
  totalCents: number;
  parts: { key: string; label: string; cents: number }[];
};

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-2 text-sm text-ink-muted">{children}</p>;
}

const BUCKET_SYMBOL = {
  overdue: <TriangleAlert aria-hidden className="size-3" />,
  soon: <Clock aria-hidden className="size-3" />,
  ontrack: <Check aria-hidden className="size-3" />,
};

export function TasksWidget({ model, t }: { model: DashboardModel["tasks"] | ProjectDashboardModel["tasks"]; t: Translate }) {
  return (
    <div className="flex flex-col gap-3">
      <BigNumber value={model.open} label={`open ${lower(t("task", model.open === 1 ? "one" : "other"))}`} />
      <Donut
        caption={`${t("task", "other")} by status`}
        marks={model.marks}
        centre={model.marks.reduce((s, m) => s + m.value, 0)}
        centreLabel="total"
      />
    </div>
  );
}

export function DeadlinesWidget({ model, t }: { model: DashboardModel["deadlines"]; t: Translate }) {
  return (
    <div className="flex flex-col gap-3">
      <BigNumber value={model.overdue} label="overdue" />
      {model.rows.length === 0 ? (
        <Empty>No open {lower(t("task", "other"))} with due dates.</Empty>
      ) : (
        <StackedBars
          caption={`Due dates by ${lower(t("project"))}: overdue, due within 3 days, on track`}
          rows={model.rows.map((r) => ({
            ...r,
            marks: r.marks.map((m) => ({ ...m, symbol: BUCKET_SYMBOL[m.key.split(":")[2] as keyof typeof BUCKET_SYMBOL] })),
          }))}
          legend={[
            { label: "Overdue", tone: "bad", symbol: BUCKET_SYMBOL.overdue },
            { label: "Due within 3 days", tone: "warn", symbol: BUCKET_SYMBOL.soon },
            { label: "On track", tone: "good", symbol: BUCKET_SYMBOL.ontrack },
          ]}
        />
      )}
    </div>
  );
}

export function DeadlineBuckets({ model }: { model: ProjectDashboardModel["deadlines"] }) {
  return (
    <div className="flex flex-col gap-3">
      <BigNumber value={model.overdue} label="overdue" />
      <BarList
        caption="Open work by due date"
        rows={model.rows.map((m) => ({ ...m, symbol: BUCKET_SYMBOL[m.key.split(":")[1] as keyof typeof BUCKET_SYMBOL] }))}
      />
    </div>
  );
}

export function PriorityWidget({ model, t }: { model: DashboardModel["priority"]; t: Translate }) {
  return (
    <div className="flex flex-col gap-3">
      <BigNumber value={model.urgent} label={`${lower(t("priority.critical"))} or ${lower(t("priority.high"))}`} />
      <BarList
        caption={`Open ${lower(t("task", "other"))} by priority`}
        rows={model.rows.map((r) => ({
          ...r,
          symbol: (
            <Flag
              aria-hidden
              className="size-3.5 shrink-0"
              style={{ color: `var(--${r.tone})`, fill: r.key.endsWith("critical") || r.key.endsWith("medium") ? `var(--${r.tone})` : "none" }}
            />
          ),
        }))}
      />
    </div>
  );
}

export function ProgressWidget({ model, t }: { model: DashboardModel["progress"]; t: Translate }) {
  if (model.rows.length === 0) return <Empty>You&apos;re not on any active {lower(t("project", "other"))}.</Empty>;
  return (
    <div className="flex flex-col gap-3">
      <BigNumber value={`${model.onTrack} of ${model.rows.length}`} label="on pace" />
      <BarList caption={`${t("project", "other")}: share of ${lower(t("task", "other"))} done`} rows={model.rows} max={100} format={(v) => `${v}%`} valueHead="Done" />
    </div>
  );
}

export function ComingUpWidget({ model, t }: { model: DashboardModel["comingUp"]; t: Translate }) {
  const columns = [...(model.overdue.length ? [{ date: "overdue", label: "Overdue", items: model.overdue }] : []), ...model.days];
  return (
    <div className="flex flex-col gap-3">
      <BigNumber value={model.count} label="in the next 7 days" />
      <figure>
        <figcaption className="sr-only">
          Due {lower(t("task", "other"))} and {lower(t("event", "other"))}, day by day for the next week
        </figcaption>
        <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
          {columns.map((d) => (
            <li key={d.date} className={`flex min-w-0 flex-col gap-1 border-t-2 pt-1 ${d.date === "overdue" ? "border-bad" : "border-rule"}`}>
              <span className={`flex items-center gap-1 font-heading text-xs font-bold ${d.date === "overdue" ? "text-bad-ink" : "text-ink-muted"}`}>
                {d.date === "overdue" ? <TriangleAlert aria-hidden className="size-3" /> : null}
                {d.label}
                <span className="font-normal">({d.items.length})</span>
              </span>
              <ul className="flex flex-col gap-0.5">
                {d.items.slice(0, 4).map((i) => (
                  <li key={i.key}>
                    <Link
                      href={i.href}
                      className={`flex items-start gap-1 rounded px-0.5 text-xs hover:bg-panel ${i.overdue ? "text-bad-ink" : ""}`}
                      aria-label={`${i.overdue ? "Overdue: " : ""}${i.title}${i.time ? `, ${i.time}` : ""}, ${i.kind === "work" ? `open the ${lower(t("task"))}` : "open the calendar"}`}
                    >
                      {i.kind === "work" ? <ListChecks aria-hidden className="mt-0.5 size-3 shrink-0" /> : <CalendarDays aria-hidden className="mt-0.5 size-3 shrink-0 text-accent" />}
                      <span className="line-clamp-2">
                        {i.time ? <span className="font-semibold">{i.time} </span> : null}
                        {i.title}
                      </span>
                    </Link>
                  </li>
                ))}
                {d.items.length > 4 ? <li className="text-xs text-ink-muted">+{d.items.length - 4} more</li> : null}
              </ul>
            </li>
          ))}
        </ol>
      </figure>
    </div>
  );
}

export function AttendanceWidget({ model, t }: { model: NonNullable<DashboardModel["attendance"]>; t: Translate }) {
  const word = lower(t("section.attendance"));
  return (
    <div className="flex flex-col gap-3">
      <BigNumber value={model.rate === null ? "—" : `${Math.round(model.rate * 100)}%`} label={`${word}, last 30 days`} />
      {model.rows.length === 0 ? (
        <Empty>No {word} taken in the last 30 days.</Empty>
      ) : (
        <>
          <BarList
            caption={`${t("participant", "other")} with the lowest ${word} (low mark ${model.low}%, high mark ${model.high}%)`}
            rows={model.rows}
            max={100}
            format={(v) => `${v}%`}
            valueHead="Rate"
          />
          {model.trend.length > 1 ? (
            <TrendLine
              caption={`${t("section.attendance")} by ${lower(t("event"))}; dashed lines at ${model.low}% and ${model.high}%`}
              points={model.trend}
              pointHead={t("event")}
              low={model.low}
              high={model.high}
            />
          ) : null}
        </>
      )}
    </div>
  );
}

export function WorkloadWidget({ model, t }: { model: NonNullable<DashboardModel["workload"]>; t: Translate }) {
  return (
    <div className="flex flex-col gap-3">
      <BigNumber value={model.total} label={`open ${lower(t("task", "other"))} across your team`} />
      {model.rows.length === 0 ? <Empty>Nobody is ranked below you yet.</Empty> : <BarList caption={`Open ${lower(t("task", "other"))} per person`} rows={model.rows} />}
    </div>
  );
}

export function FundingWidget({ funds, base }: { funds: FundSummary[]; base: string }) {
  if (funds.length === 0) {
    return (
      <Empty>
        No funds yet.{" "}
        <Link href={`${base}/funds`} className="text-accent underline underline-offset-4">
          Add one
        </Link>{" "}
        to see where its money goes.
      </Empty>
    );
  }
  const total = funds.reduce((s, f) => s + f.totalCents, 0);
  const sameCurrency = funds.every((f) => f.currency === funds[0]!.currency);
  return (
    <div className="flex flex-col gap-3">
      <BigNumber value={sameCurrency ? formatMoney(total, funds[0]!.currency, true) : funds.length} label={sameCurrency ? "across your funds" : "funds"} />
      <ul className="flex flex-col gap-4">
        {funds.slice(0, 5).map((f) => {
          const allocated = f.parts.reduce((sum, p) => sum + p.cents, 0);
          return (
            <li key={f.id} className="flex flex-col gap-1.5">
              <p className="flex flex-wrap items-baseline justify-between gap-x-3">
                <Link href={`${base}/funds/${f.id}`} className="truncate font-semibold hover:underline" aria-label={`${f.name}: ${formatShare(allocated, f.totalCents)} allocated, open the fund`}>
                  {f.name}
                </Link>
                <span className="text-sm tabular-nums">
                  <span className="font-heading font-bold">{formatShare(allocated, f.totalCents)}</span> of {formatMoney(f.totalCents, f.currency, true)} allocated
                </span>
              </p>
              <SplitBar size="sm" legend={false} caption={f.name} currency={f.currency} totalCents={f.totalCents} parts={f.parts} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** The read-only panel a mark opens for people who can't act on it there. */
export function DetailPanel({ detail, closeHref, today, t }: { detail: Detail; closeHref: string; today: string; t: Translate }) {
  return (
    <section id="details" aria-labelledby="details-heading" className="flex flex-col gap-3 rounded-lg border border-ink p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="details-heading" tabIndex={-1} className="font-heading text-lg font-bold focus:outline-none">
          View details: {detail.title}
        </h2>
        <Link href={closeHref} className="text-sm font-semibold text-accent underline underline-offset-4">
          Close details
        </Link>
      </div>
      <p className="text-sm text-ink-muted">Read-only. Open one to see it in full.</p>
      {detail.items.length === 0 ? (
        <Empty>Nothing here right now.</Empty>
      ) : (
        <ul className="divide-y divide-rule border-y border-rule">
          {detail.items.map((x) => (
            <li key={x.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
              <Link href={x.href} className="min-w-0 flex-1 font-semibold hover:underline">
                {x.title}
              </Link>
              {x.project ? <span className="text-sm text-ink-muted">{x.project}</span> : null}
              <TaskStatusBadge status={x.status} label={t(`status.${x.status}`)} />
              <DueBadge dueDate={x.due} status={x.status} today={today} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}


/** A fixed (not rearrangeable) card for a project's own dashboard. */
export function DashboardCard({
  title,
  icon,
  className = "",
  children,
}: {
  title: string;
  icon: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  const id = `card-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <li className={className}>
      <section aria-labelledby={id} className="flex h-full flex-col rounded-lg border border-rule bg-canvas">
        <h3 id={id} className="flex items-center gap-2 border-b border-rule px-4 py-2.5 font-heading text-base font-bold">
          {icon}
          {title}
        </h3>
        <div className="flex-1 px-4 py-3">{children}</div>
      </section>
    </li>
  );
}
