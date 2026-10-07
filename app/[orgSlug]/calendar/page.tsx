import Link from "next/link";
import type { Metadata } from "next";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { CalendarView, type CalendarItem } from "@/components/calendar/calendar-view";
import { buttonClass } from "@/components/ui/button";
import { getOrgContext } from "@/lib/org";
import { getEvents, getProjectOptions } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";
import {
  addDays,
  eventEndDate,
  eventStartDate,
  formatMonth,
  formatTime,
  isMonthKey,
  monthGrid,
  monthKey,
  shiftMonth,
} from "@/lib/dates";
import { toEventFormValues } from "@/lib/event-values";

export async function generateMetadata({ params }: PageProps<"/[orgSlug]/calendar">): Promise<Metadata> {
  const { t } = await getOrgContext((await params).orgSlug);
  return { title: t("section.calendar") };
}

export default async function CalendarPage({ params, searchParams }: PageProps<"/[orgSlug]/calendar">) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const ctx = await getOrgContext(orgSlug);
  const { t, org, base, today, tz } = ctx;
  const view = sp.view === "agenda" ? "agenda" : "month";
  const month = typeof sp.month === "string" && isMonthKey(sp.month) ? sp.month : monthKey(today);
  const weeks = monthGrid(month);
  const first = weeks[0]![0]!;
  const last = weeks.at(-1)!.at(-1)!;

  const supabase = await createClient();
  const [events, { data: tasks, error }, projects] = await Promise.all([
    // pad a day either side; items are placed by date in the viewer's zone below
    getEvents(org.id, `${addDays(first, -1)}T00:00:00Z`, `${addDays(last, 2)}T00:00:00Z`),
    supabase
      .from("tasks")
      .select("id, title, status, due_date")
      .eq("organization_id", org.id)
      .gte("due_date", first)
      .lte("due_date", last),
    getProjectOptions(org.id),
  ]);
  if (error) throw error;

  const items: CalendarItem[] = [
    ...events.map((e) => {
      const date = eventStartDate(e.starts_at, e.all_day, tz);
      return {
        kind: "event" as const,
        id: e.id,
        title: e.title,
        date,
        endDate: eventEndDate(e.ends_at, e.all_day, tz),
        timeLabel: e.all_day ? "All day" : formatTime(e.starts_at, tz),
        location: e.location,
        values: toEventFormValues(e, tz, ctx.isAdmin || e.created_by === ctx.userId),
      };
    }),
    ...(tasks ?? []).map((task) => ({
      kind: "task" as const,
      id: task.id,
      title: task.title,
      date: task.due_date!,
      endDate: task.due_date!,
      done: task.status === "done",
      overdue: task.status !== "done" && task.due_date! < today,
      href: `${base}/tasks/${task.id}`,
    })),
  ];

  const href = (m: string, v = view) => `${base}/calendar?${new URLSearchParams({ ...(v === "agenda" ? { view: v } : {}), month: m })}`;
  const isCurrentMonth = month === monthKey(today);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t("section.calendar")}
        tabsLabel="Calendar views"
        tabs={[
          { label: "Month", href: href(month, "month"), active: view === "month" },
          { label: "Agenda", href: href(month, "agenda"), active: view === "agenda" },
        ]}
      />
      <nav aria-label="Change month" className="flex flex-wrap items-center gap-2">
        <Link href={href(shiftMonth(month, -1))} className={buttonClass("secondary", "sm")} aria-label="Previous month">
          <ChevronLeft aria-hidden className="size-4" />
        </Link>
        <Link href={href(shiftMonth(month, 1))} className={buttonClass("secondary", "sm")} aria-label="Next month">
          <ChevronRight aria-hidden className="size-4" />
        </Link>
        <h2 className="font-heading text-xl font-bold" aria-live="polite">
          {formatMonth(month)}
        </h2>
        {!isCurrentMonth ? (
          <Link href={href(monthKey(today))} className={buttonClass("ghost", "sm")}>
            Today
          </Link>
        ) : null}
      </nav>
      <CalendarView
        view={view}
        month={month}
        weeks={weeks}
        today={today}
        items={items}
        organizationId={org.id}
        projects={projects}
      />
    </div>
  );
}
