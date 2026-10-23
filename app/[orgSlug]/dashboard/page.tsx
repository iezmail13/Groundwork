import Link from "next/link";
import type { Metadata } from "next";
import { BellRing, CalendarRange, ChartNoAxesColumn, ClipboardCheck, Clock, Flag, ListChecks, PiggyBank, Users } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Dashboard, type WidgetSlot } from "@/components/dashboard/dashboard";
import {
  AttendanceWidget,
  ComingUpWidget,
  DeadlinesWidget,
  DetailPanel,
  FundingWidget,
  PriorityWidget,
  ProgressWidget,
  TasksWidget,
  WorkloadWidget,
} from "@/components/dashboard/widgets";
import { LiveRefresh } from "@/components/dashboard/live-refresh";
import { getOrgContext } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";
import { dueState } from "@/lib/dates";
import { normalizeLayout } from "@/lib/dashboard-layout";
import { buildMainDashboard, type Scope } from "@/lib/dashboard-data";
import { lower } from "@/lib/terminology/t";
import type { TaskRow } from "@/lib/queries";

export async function generateMetadata({ params }: PageProps<"/[orgSlug]/dashboard">): Promise<Metadata> {
  const { t } = await getOrgContext((await params).orgSlug);
  return { title: t("section.dashboard") };
}

/**
 * The dashboard (D105): read-only summaries filtered by permission in the
 * database. Every chart mark links to an editable view, or to a read-only
 * "View details" panel for people who can't act there. People who oversee
 * others switch between "My work" and "All work" (D112).
 */
export default async function DashboardPage({ params, searchParams }: PageProps<"/[orgSlug]/dashboard">) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const ctx = await getOrgContext(orgSlug);
  const { t, org, base, today } = ctx;
  const scope: Scope = sp.scope === "all" ? "all" : "mine";
  const detailKey = typeof sp.detail === "string" ? sp.detail : null;
  const supabase = await createClient();

  const [model, { data: layoutRow }, { data: profile }, { data: projects }, { data: myRows }] = await Promise.all([
    buildMainDashboard(ctx, scope, detailKey),
    supabase.from("dashboard_layouts").select("layout").eq("membership_id", ctx.membershipId).maybeSingle(),
    supabase.from("profiles").select("full_name").eq("id", ctx.userId).maybeSingle(),
    supabase.from("projects").select("id").eq("organization_id", org.id),
    supabase.from("task_assignees").select("task:tasks(status, due_date)").eq("membership_id", ctx.membershipId).is("done_at", null),
  ]);

  const icon = (I: typeof Clock) => <I aria-hidden className="size-4" />;
  const plural = t("task", "other");
  const widgets: WidgetSlot[] = [
    { id: "tasks", title: model.scope === "mine" ? `My ${lower(plural)}` : plural, icon: icon(ListChecks), content: <TasksWidget model={model.tasks} t={t} /> },
    { id: "deadlines", title: "Deadlines", icon: icon(Clock), content: <DeadlinesWidget model={model.deadlines} t={t} /> },
    { id: "priority", title: "Priority", icon: icon(Flag), content: <PriorityWidget model={model.priority} t={t} /> },
    { id: "progress", title: `${t("project")} progress`, icon: icon(ChartNoAxesColumn), content: <ProgressWidget model={model.progress} t={t} /> },
    { id: "coming_up", title: "Coming up", icon: icon(CalendarRange), content: <ComingUpWidget model={model.comingUp} t={t} /> },
    ...(model.attendance
      ? [{ id: "attendance" as const, title: t("section.attendance"), icon: icon(ClipboardCheck), content: <AttendanceWidget model={model.attendance} t={t} /> }]
      : []),
    ...(model.workload ? [{ id: "workload" as const, title: "Workload", icon: icon(Users), content: <WorkloadWidget model={model.workload} t={t} /> }] : []),
    ...(model.funds ? [{ id: "funding" as const, title: "Funding", icon: icon(PiggyBank), content: <FundingWidget funds={model.funds} base={base} /> }] : []),
  ];

  // In-app reminders: the viewer's own overdue and due-soon work.
  const mine = (myRows ?? []).map((r) => r.task).filter((x): x is Pick<TaskRow, "status" | "due_date"> => Boolean(x));
  const myOverdue = mine.filter((x) => dueState(x.due_date, x.status, today) === "overdue").length;
  const mySoon = mine.filter((x) => dueState(x.due_date, x.status, today) === "due_soon").length;
  const firstName = profile?.full_name?.split(" ")[0];
  const taskWord = (n: number) => lower(n === 1 ? t("task") : t("task", "other"));
  const scopeHref = (s: Scope) => `${base}/dashboard${s === "all" ? "?scope=all" : ""}`;
  // signals for every program the viewer can see, and for work outside any program
  const topics = [`org:${org.id}:changes`, ...(projects ?? []).map((p) => `project:${p.id}:changes`)];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("section.dashboard")}
        description={firstName ? `Welcome back, ${firstName}.` : `Here's where ${org.name} stands today.`}
        actions={
          model.canOversee ? (
            <nav aria-label="Dashboard scope" className="flex rounded-md border border-rule">
              {(["mine", "all"] as const).map((s) => (
                <Link
                  key={s}
                  href={scopeHref(s)}
                  aria-current={model.scope === s ? "page" : undefined}
                  className={`px-3 py-1.5 font-heading text-sm font-semibold ${model.scope === s ? "bg-accent text-on-accent" : "hover:bg-panel"}`}
                >
                  {s === "mine" ? "My work" : "All work"}
                </Link>
              ))}
            </nav>
          ) : undefined
        }
      />

      {myOverdue + mySoon > 0 ? (
        <section aria-labelledby="reminders" className="flex flex-wrap items-center gap-x-4 gap-y-2 border-y border-ink py-3">
          <h2 id="reminders" className="flex items-center gap-2 font-heading font-bold">
            <BellRing aria-hidden className="size-5" />
            Reminders
          </h2>
          {myOverdue ? (
            <Link href={`${base}/tasks?view=list&assignee=me&due=overdue`} className="font-semibold text-accent underline underline-offset-4">
              {myOverdue} of your {taskWord(myOverdue)} {myOverdue === 1 ? "is" : "are"} overdue
            </Link>
          ) : null}
          {mySoon ? (
            <Link href={`${base}/tasks?view=list&assignee=me&due=week`} className="text-accent underline underline-offset-4">
              {mySoon} due in the next two days
            </Link>
          ) : null}
        </section>
      ) : null}

      {model.detail ? <DetailPanel detail={model.detail} closeHref={scopeHref(model.scope)} today={today} t={t} /> : null}

      <Dashboard organizationId={org.id} widgets={widgets} initialLayout={normalizeLayout(layoutRow?.layout)} />
      <LiveRefresh topics={topics} />
    </div>
  );
}
