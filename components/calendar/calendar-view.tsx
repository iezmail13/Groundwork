"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { CalendarClock, CalendarPlus, CheckSquare, MapPin, Plus, Square, TriangleAlert } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/terminology/context";
import { lower } from "@/lib/terminology/t";
import { WEEKDAYS, formatDate, formatRelativeDate, monthKey } from "@/lib/dates";
import { newEventValues } from "@/lib/event-values";
import type { ProjectOption } from "@/lib/queries";
import { EventForm, type EventFormValues } from "./event-form";

export type CalendarItem =
  | {
      kind: "event";
      id: string;
      title: string;
      date: string; // first day in the viewer's zone
      endDate: string; // last day (inclusive)
      timeLabel: string; // "9:00 AM" or "All day"
      location: string | null;
      values: EventFormValues;
    }
  | {
      kind: "task";
      id: string;
      title: string;
      date: string;
      endDate: string;
      done: boolean;
      overdue: boolean;
      href: string;
    };

type Dialog =
  | { type: "create"; date: string }
  | { type: "edit"; values: EventFormValues }
  | { type: "day"; date: string }
  | null;

const MAX_PER_DAY = 3;

export function CalendarView({
  view,
  month,
  weeks,
  today,
  items,
  organizationId,
  projects,
}: {
  view: "month" | "agenda";
  month: string;
  weeks: string[][];
  today: string;
  items: CalendarItem[];
  organizationId: string;
  projects: ProjectOption[];
}) {
  const t = useT();
  const [dialog, setDialog] = useState<Dialog>(null);
  const close = useCallback(() => setDialog(null), []);
  const eventLabel = lower(t("event"));

  const itemsOn = (day: string) =>
    items
      .filter((i) => i.date <= day && i.endDate >= day)
      .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "event" ? -1 : 1));

  const openItem = (item: CalendarItem) => {
    if (item.kind === "event") setDialog({ type: "edit", values: item.values });
  };

  const header = (
    <div className="flex justify-end">
      <Button onClick={() => setDialog({ type: "create", date: monthKey(today) === month ? today : `${month}-01` })} aria-haspopup="dialog">
        <CalendarPlus aria-hidden className="size-4" />
        New {eventLabel}
      </Button>
    </div>
  );

  return (
    <>
      {view === "month" ? (
        <div className="flex flex-col gap-3">
          {header}
          <MonthGrid
            month={month}
            weeks={weeks}
            today={today}
            itemsOn={itemsOn}
            onAdd={(date) => setDialog({ type: "create", date })}
            onOpen={openItem}
            onMore={(date) => setDialog({ type: "day", date })}
            addLabel={`Add ${eventLabel}`}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {header}
          <Agenda month={month} weeks={weeks} today={today} itemsOn={itemsOn} onOpen={openItem} />
        </div>
      )}

      <Modal
        open={dialog?.type === "create" || dialog?.type === "edit"}
        onClose={close}
        title={dialog?.type === "edit" ? `Edit ${eventLabel}` : `New ${eventLabel}`}
      >
        {dialog?.type === "create" ? (
          <EventForm organizationId={organizationId} projects={projects} event={newEventValues(dialog.date)} onDone={close} />
        ) : dialog?.type === "edit" ? (
          <EventForm organizationId={organizationId} projects={projects} event={dialog.values} onDone={close} />
        ) : null}
      </Modal>

      <Modal open={dialog?.type === "day"} onClose={close} title={dialog?.type === "day" ? formatDate(dialog.date, { weekday: "long", month: "long", day: "numeric" }) : ""}>
        {dialog?.type === "day" ? (
          <div className="flex flex-col gap-3">
            <ItemList items={itemsOn(dialog.date)} onOpen={openItem} />
            <Button variant="secondary" onClick={() => setDialog({ type: "create", date: dialog.date })}>
              <Plus aria-hidden className="size-4" />
              Add {eventLabel}
            </Button>
          </div>
        ) : null}
      </Modal>
    </>
  );
}

function MonthGrid({
  month,
  weeks,
  today,
  itemsOn,
  onAdd,
  onOpen,
  onMore,
  addLabel,
}: {
  month: string;
  weeks: string[][];
  today: string;
  itemsOn: (day: string) => CalendarItem[];
  onAdd: (date: string) => void;
  onOpen: (item: CalendarItem) => void;
  onMore: (date: string) => void;
  addLabel: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] table-fixed border-collapse">
        <caption className="sr-only">{formatDate(`${month}-01`, { month: "long", year: "numeric" })}</caption>
        <thead>
          <tr>
            {WEEKDAYS.map((d) => (
              <th key={d} scope="col" className="border-b border-ink py-2 text-left font-heading text-xs font-bold tracking-wide uppercase">
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => (
            <tr key={week[0]}>
              {week.map((day) => {
                const inMonth = monthKey(day) === month;
                const isToday = day === today;
                const dayItems = itemsOn(day);
                const shown = dayItems.slice(0, MAX_PER_DAY);
                const hidden = dayItems.length - shown.length;
                const longLabel = formatDate(day, { weekday: "long", month: "long", day: "numeric" });
                return (
                  <td
                    key={day}
                    aria-current={isToday ? "date" : undefined}
                    className={`group h-32 border border-rule p-1.5 align-top ${inMonth ? "" : "bg-panel/60"} ${isToday ? "bg-tint" : ""}`}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`inline-flex size-7 items-center justify-center rounded-full font-heading text-sm ${
                          isToday ? "bg-primary font-bold text-on-primary" : inMonth ? "font-semibold" : "text-ink-muted"
                        }`}
                      >
                        <span aria-hidden>{Number(day.slice(8))}</span>
                        <span className="sr-only">
                          {longLabel}
                          {isToday ? ", today" : ""}
                        </span>
                      </span>
                      {isToday ? <span className="font-heading text-xs font-bold">Today</span> : null}
                      <button
                        type="button"
                        onClick={() => onAdd(day)}
                        className="inline-flex size-6 items-center justify-center rounded text-ink-muted opacity-0 group-hover:opacity-100 hover:bg-panel hover:text-ink focus-visible:opacity-100"
                        aria-label={`${addLabel} on ${longLabel}`}
                      >
                        <Plus aria-hidden className="size-4" />
                      </button>
                    </div>
                    <ul className="mt-1 flex flex-col gap-0.5">
                      {shown.map((item) => (
                        <li key={`${item.kind}-${item.id}`}>
                          <ItemChip item={item} onOpen={onOpen} />
                        </li>
                      ))}
                    </ul>
                    {hidden > 0 ? (
                      <button
                        type="button"
                        onClick={() => onMore(day)}
                        className="mt-0.5 rounded px-1 text-xs font-semibold hover:underline"
                      >
                        +{hidden} more<span className="sr-only"> on {longLabel}</span>
                      </button>
                    ) : null}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ItemChip({ item, onOpen }: { item: CalendarItem; onOpen: (item: CalendarItem) => void }) {
  const t = useT();
  if (item.kind === "task") {
    return (
      <Link
        href={item.href}
        className={`flex items-center gap-1 truncate rounded px-1 py-0.5 text-xs hover:bg-panel ${
          item.overdue ? "bg-primary font-semibold text-on-primary hover:bg-primary" : ""
        } ${item.done ? "text-ink-muted line-through" : ""}`}
        title={item.title}
      >
        {item.overdue ? (
          <TriangleAlert aria-hidden className="size-3 shrink-0" />
        ) : item.done ? (
          <CheckSquare aria-hidden className="size-3 shrink-0" />
        ) : (
          <Square aria-hidden className="size-3 shrink-0" />
        )}
        <span className="sr-only">{item.overdue ? `Overdue ${lower(t("task"))}: ` : `${t("task")} due: `}</span>
        <span className="truncate">{item.title}</span>
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className="flex w-full items-center gap-1 truncate rounded border-l-2 border-ink bg-panel px-1 py-0.5 text-left text-xs hover:border-l-4"
      title={`${item.timeLabel} ${item.title}`}
    >
      <span className="shrink-0 font-semibold tabular-nums">{item.timeLabel}</span>
      <span className="truncate">{item.title}</span>
    </button>
  );
}

function Agenda({
  month,
  weeks,
  today,
  itemsOn,
  onOpen,
}: {
  month: string;
  weeks: string[][];
  today: string;
  itemsOn: (day: string) => CalendarItem[];
  onOpen: (item: CalendarItem) => void;
}) {
  const t = useT();
  const days = weeks.flat().filter((d) => monthKey(d) === month);
  const withItems = days.map((d) => ({ day: d, items: itemsOn(d) })).filter((d) => d.items.length > 0);

  if (withItems.length === 0) {
    return (
      <div className="border-y border-dashed border-rule py-10 text-center">
        <CalendarClock aria-hidden className="mx-auto size-7 text-ink-muted" />
        <p className="mt-2 font-heading text-lg font-bold">Nothing scheduled this month</p>
        <p className="text-ink-muted">
          {t("event", "other")} and {lower(t("task", "other"))} with due dates appear here.
        </p>
      </div>
    );
  }

  return (
    <ol className="flex flex-col">
      {withItems.map(({ day, items }) => (
        <li key={day} className="grid gap-2 border-b border-rule py-3 sm:grid-cols-[180px_1fr]" aria-current={day === today ? "date" : undefined}>
          <h2 className="font-heading font-bold">
            {day === today ? (
              <span className="mr-2 rounded-full bg-primary px-2 py-0.5 text-xs text-on-primary">Today</span>
            ) : null}
            {formatDate(day, { weekday: "short", month: "short", day: "numeric" })}
            {day !== today ? <span className="block text-sm font-normal text-ink-muted">{formatRelativeDate(day, today)}</span> : null}
          </h2>
          <ItemList items={items} onOpen={onOpen} />
        </li>
      ))}
    </ol>
  );
}

function ItemList({ items, onOpen }: { items: CalendarItem[]; onOpen: (item: CalendarItem) => void }) {
  const t = useT();
  if (items.length === 0) return <p className="text-ink-muted">Nothing scheduled.</p>;
  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((item) =>
        item.kind === "event" ? (
          <li key={`e-${item.id}`}>
            <button
              type="button"
              onClick={() => onOpen(item)}
              className="flex w-full flex-wrap items-baseline gap-x-3 rounded-md border border-rule px-3 py-2 text-left hover:border-ink"
            >
              <span className="w-20 shrink-0 font-heading text-sm font-semibold tabular-nums">{item.timeLabel}</span>
              <span className="font-semibold">{item.title}</span>
              {item.location ? (
                <span className="inline-flex items-center gap-1 text-sm text-ink-muted">
                  <MapPin aria-hidden className="size-3.5" />
                  {item.location}
                </span>
              ) : null}
            </button>
          </li>
        ) : (
          <li key={`t-${item.id}`}>
            <Link
              href={item.href}
              className="flex flex-wrap items-center gap-x-3 rounded-md border border-dashed border-rule px-3 py-2 hover:border-ink"
            >
              <span className="inline-flex w-20 shrink-0 items-center gap-1 font-heading text-sm">
                {item.done ? <CheckSquare aria-hidden className="size-4" /> : <Square aria-hidden className="size-4" />}
                {t("task")}
              </span>
              <span className={item.done ? "text-ink-muted line-through" : "font-semibold"}>{item.title}</span>
              {item.overdue ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 font-heading text-xs font-semibold text-on-primary">
                  <TriangleAlert aria-hidden className="size-3" />
                  Overdue
                </span>
              ) : null}
            </Link>
          </li>
        ),
      )}
    </ul>
  );
}
