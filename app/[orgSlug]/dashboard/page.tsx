import Link from "next/link";
import type { Metadata } from "next";
import { BellRing } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Dashboard } from "@/components/dashboard/dashboard";
import type { DashboardData, TaskLite } from "@/components/dashboard/widgets";
import { getMembers, getOrgContext } from "@/lib/org";
import { getActivity, getEvents, getProjectProgress, TASK_SELECT, type TaskRow } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";
import { addDays, dueState, eventStartDate, formatRelativeDate, formatTime } from "@/lib/dates";
import { normalizeLayout } from "@/lib/dashboard-layout";
import { activityHref, describeActivity, timeAgo } from "@/lib/activity";
import { lower } from "@/lib/terminology/t";

export async function generateMetadata({ params }: PageProps<"/[orgSlug]/dashboard">): Promise<Metadata> {
  const { t } = await getOrgContext((await params).orgSlug);
  return { title: t("section.dashboard") };
}

export default async function DashboardPage({ params }: PageProps<"/[orgSlug]/dashboard">) {
  const { orgSlug } = await params;
  const ctx = await getOrgContext(orgSlug);
  const { t, org, base, today, tz } = ctx;
  const supabase = await createClient();
  const now = new Date();

  const [{ data: openTasks, error }, { data: projects }, progress, events, activity, members, { data: pinned }, { data: layoutRow }, { data: profile }] =
    await Promise.all([
      supabase.from("tasks").select(TASK_SELECT).eq("organization_id", org.id).neq("status", "done").order("due_date", { nullsFirst: false }).limit(1000),
      supabase.from("projects").select("id, name, color").eq("organization_id", org.id).eq("status", "active").order("name"),
      getProjectProgress(org.id),
      getEvents(org.id, now.toISOString(), new Date(now.getTime() + 14 * 86400000).toISOString()),
      getActivity(org.id, 10),
      getMembers(org.id),
      supabase.from("documents").select("id, name, mime_type, size_bytes").eq("organization_id", org.id).eq("pinned", true).order("name").limit(8),
      supabase.from("dashboard_layouts").select("layout").eq("membership_id", ctx.membershipId).maybeSingle(),
      supabase.from("profiles").select("full_name").eq("id", ctx.userId).maybeSingle(),
    ]);
  if (error) throw error;

  const tasks = (openTasks ?? []) as TaskRow[];
  const lite = (x: TaskRow): TaskLite => ({
    id: x.id,
    title: x.title,
    status: x.status,
    due_date: x.due_date,
    project: x.project ? { name: x.project.name, color: x.project.color } : null,
    href: `${base}/tasks/${x.id}`,
  });
  const weekEnd = addDays(today, 7);
  const memberName = new Map(members.map((m) => [m.id, m.name]));

  const data: DashboardData = {
    organizationId: org.id,
    base,
    today,
    overdue: tasks.filter((x) => x.due_date && x.due_date < today).map(lite),
    dueSoon: tasks.filter((x) => x.due_date && x.due_date >= today && x.due_date <= weekEnd).map(lite),
    myTasks: tasks.filter((x) => x.assignee_membership_id === ctx.membershipId).map(lite),
    projects: (projects ?? []).map((p) => ({ ...p, ...(progress.get(p.id) ?? { done: 0, total: 0 }) })),
    events: events.slice(0, 6).map((e) => ({
      id: e.id,
      title: e.title,
      day: formatRelativeDate(eventStartDate(e.starts_at, e.all_day, tz), today),
      time: e.all_day ? "All day" : formatTime(e.starts_at, tz),
      location: e.location,
    })),
    activity: activity.map((a) => ({
      id: a.id,
      actor: a.actor_membership_id ? (memberName.get(a.actor_membership_id) ?? "Someone") : "Someone",
      sentence: describeActivity(a, t),
      label: a.metadata.label ?? null,
      href: activityHref(a, base),
      ago: timeAgo(a.created_at, now.getTime()),
    })),
    pinned: (pinned ?? []).map((d) => ({ id: d.id, name: d.name, mime: d.mime_type, size: d.size_bytes })),
    projectOptions: (projects ?? []).map((p) => ({ id: p.id, name: p.name })),
  };

  // In-app reminders: the viewer's own overdue and due-soon work.
  const mine = tasks.filter((x) => x.assignee_membership_id === ctx.membershipId);
  const myOverdue = mine.filter((x) => dueState(x.due_date, x.status, today) === "overdue").length;
  const mySoon = mine.filter((x) => dueState(x.due_date, x.status, today) === "due_soon").length;
  const firstName = profile?.full_name?.split(" ")[0];
  const taskWord = (n: number) => lower(n === 1 ? t("task") : t("task", "other"));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("section.dashboard")} description={firstName ? `Welcome back, ${firstName}.` : `Here's where ${org.name} stands today.`} />

      {myOverdue + mySoon > 0 ? (
        <section aria-labelledby="reminders" className="flex flex-wrap items-center gap-x-4 gap-y-2 border-y border-ink py-3">
          <h2 id="reminders" className="flex items-center gap-2 font-heading font-bold">
            <BellRing aria-hidden className="size-5" />
            Reminders
          </h2>
          {myOverdue ? (
            <Link href={`${base}/tasks?view=list&assignee=me&due=overdue`} className="font-semibold underline underline-offset-4">
              {myOverdue} of your {taskWord(myOverdue)} {myOverdue === 1 ? "is" : "are"} overdue
            </Link>
          ) : null}
          {mySoon ? (
            <Link href={`${base}/tasks?view=list&assignee=me&due=week`} className="underline underline-offset-4">
              {mySoon} due in the next two days
            </Link>
          ) : null}
        </section>
      ) : null}

      <Dashboard data={data} initialLayout={normalizeLayout(layoutRow?.layout)} />
    </div>
  );
}
