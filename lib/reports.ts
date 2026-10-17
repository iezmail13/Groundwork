import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getMembers, type OrgContext } from "@/lib/org";
import { TASK_SELECT, type TaskRow } from "@/lib/queries";
import { addDays, zonedTimeToUtc } from "@/lib/dates";
import { assigneeIds } from "@/lib/task-filters";
import { lower } from "@/lib/terminology/t";
import { canManageOrg } from "@/lib/roles";
import { getBudgets, getSpending } from "@/lib/spending";
import { BUDGET_LABEL, BUDGET_TONE } from "@/lib/budget";
import { formatMoney } from "@/lib/money";
import { getAttendancePrograms, getMarksInRange, getParticipantNames } from "@/lib/participants";
import { attendanceRate, emptyTally, addMark, formatRate } from "@/lib/attendance-report";
import type { Report, ReportSection, ReportTemplate, ReportTone } from "@/lib/report-model";

// Reports (D109). Each template reads through the viewer's own access (RLS,
// can_view_task and the rest), so a report never holds more than they can see.

export type ReportParams = { template: ReportTemplate; projectId: string | null; from: string; to: string };

const PRIORITIES = ["critical", "high", "medium", "low"] as const;

/** The templates this person may generate. */
export async function availableTemplates(ctx: OrgContext): Promise<ReportTemplate[]> {
  const list: ReportTemplate[] = ["progress", "resources"];
  if (canManageOrg(ctx.role)) list.push("costs");
  if ((await getAttendancePrograms(ctx.org.id)).length > 0) list.push("attendance");
  return list;
}

export function templateName(template: ReportTemplate, t: OrgContext["t"]): string {
  switch (template) {
    case "progress":
      return `${t("task")} progress`;
    case "resources":
      return "People and workload";
    case "costs":
      return "Costs against budget";
    case "attendance":
      return t("section.attendance");
  }
}

async function visibleTasks(ctx: OrgContext, projectId: string | null): Promise<TaskRow[]> {
  const supabase = await createClient();
  let q = supabase.from("tasks").select(TASK_SELECT).eq("organization_id", ctx.org.id).limit(5000);
  if (projectId) q = q.eq("project_id", projectId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as TaskRow[];
}

const inRange = (iso: string | null, from: string, to: string) => Boolean(iso) && iso!.slice(0, 10) >= from && iso!.slice(0, 10) <= to;

export async function buildReport(ctx: OrgContext, params: ReportParams, scopeName: string): Promise<Report | null> {
  const base: Omit<Report, "sections" | "title"> = {
    template: params.template,
    scope: `${scopeName}, ${params.from} to ${params.to}`,
    from: params.from,
    to: params.to,
    generatedAt: new Date().toISOString(),
    organization: ctx.org.name,
  };
  const title = templateName(params.template, ctx.t);
  switch (params.template) {
    case "progress":
      return { ...base, title, sections: await progressSections(ctx, params) };
    case "resources":
      return { ...base, title, sections: await resourceSections(ctx, params) };
    case "costs":
      if (!canManageOrg(ctx.role)) return null;
      return { ...base, title, sections: await costSections(ctx, params) };
    case "attendance": {
      const sections = await attendanceSections(ctx, params);
      return sections ? { ...base, title, sections } : null;
    }
  }
}

async function progressSections(ctx: OrgContext, { projectId, from, to }: ReportParams): Promise<ReportSection[]> {
  const { t, today } = ctx;
  const tasks = await visibleTasks(ctx, projectId);
  const open = tasks.filter((x) => x.status !== "done");
  const overdue = open.filter((x) => x.due_date && x.due_date < today);
  const doneInRange = tasks.filter((x) => x.status === "done" && inRange(x.completed_at, from, to));
  const soon = open.filter((x) => x.due_date && x.due_date >= today && x.due_date <= addDays(today, 7));
  const plural = lower(t("task", "other"));

  const byProgram = new Map<string, TaskRow[]>();
  for (const x of tasks) {
    const key = x.project?.name ?? `No ${lower(t("project"))}`;
    byProgram.set(key, [...(byProgram.get(key) ?? []), x]);
  }

  return [
    {
      heading: "At a glance",
      summary:
        overdue.length === 0
          ? `Nothing is overdue. ${doneInRange.length} ${plural} finished in this period.`
          : `${overdue.length} open ${overdue.length === 1 ? lower(t("task")) : plural} ${overdue.length === 1 ? "is" : "are"} overdue; ${doneInRange.length} finished in this period.`,
      stats: [
        { label: `Open ${plural}`, value: String(open.length) },
        { label: "Overdue", value: String(overdue.length), tone: overdue.length ? "bad" : "good" },
        { label: "Due in the next 7 days", value: String(soon.length), tone: soon.length ? "warn" : null },
        { label: "Finished in this period", value: String(doneInRange.length), tone: "good" },
      ],
    },
    {
      heading: "By priority",
      table: {
        caption: `Open, overdue and finished ${plural} by priority`,
        head: ["Priority", "Open", "Overdue", "Finished in this period"],
        numeric: [1, 2, 3],
        rows: PRIORITIES.map((p) => [
          t(`priority.${p}`),
          open.filter((x) => x.priority === p).length,
          overdue.filter((x) => x.priority === p).length,
          doneInRange.filter((x) => x.priority === p).length,
        ]),
        empty: "",
      },
    },
    {
      heading: `By ${lower(t("project"))}`,
      table: {
        caption: `${t("task", "other")} by ${lower(t("project"))}`,
        head: [t("project"), "Open", "Overdue", "Finished in this period", "Share done"],
        numeric: [1, 2, 3, 4],
        rows: [...byProgram.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([name, list]) => {
            const done = list.filter((x) => x.status === "done").length;
            return [
              name,
              list.filter((x) => x.status !== "done").length,
              list.filter((x) => x.status !== "done" && x.due_date && x.due_date < today).length,
              list.filter((x) => x.status === "done" && inRange(x.completed_at, from, to)).length,
              `${Math.round((done / Math.max(1, list.length)) * 100)}%`,
            ];
          }),
        tones: [...byProgram.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([, list]) => (list.some((x) => x.status !== "done" && x.due_date && x.due_date < today) ? "bad" : "good") as ReportTone),
        empty: `No ${plural} yet.`,
      },
    },
    {
      heading: "Overdue",
      table: {
        caption: `Overdue ${plural}, most overdue first`,
        head: [t("task"), t("project"), "Due", "Days late"],
        numeric: [3],
        rows: [...overdue]
          .sort((a, b) => a.due_date!.localeCompare(b.due_date!))
          .map((x) => [x.title, x.project?.name ?? "", x.due_date!, Math.round((Date.parse(today) - Date.parse(x.due_date!)) / 86_400_000)]),
        tones: overdue.map(() => "bad" as ReportTone),
        empty: "Nothing is overdue.",
      },
    },
  ];
}

async function resourceSections(ctx: OrgContext, { projectId, from, to }: ReportParams): Promise<ReportSection[]> {
  const { t, today } = ctx;
  const [tasks, members] = await Promise.all([visibleTasks(ctx, projectId), getMembers(ctx.org.id)]);
  const plural = lower(t("task", "other"));
  const rows = members
    .map((m) => {
      const mine = tasks.filter((x) => assigneeIds(x).includes(m.id));
      const open = mine.filter((x) => x.status !== "done");
      return {
        name: m.name,
        open: open.length,
        overdue: open.filter((x) => x.due_date && x.due_date < today).length,
        soon: open.filter((x) => x.due_date && x.due_date >= today && x.due_date <= addDays(today, 7)).length,
        done: mine.filter((x) => x.status === "done" && inRange(x.completed_at, from, to)).length,
      };
    })
    .filter((r) => r.open + r.done > 0)
    .sort((a, b) => b.open - a.open || a.name.localeCompare(b.name));
  const unassigned = tasks.filter((x) => x.status !== "done" && assigneeIds(x).length === 0).length;
  const busiest = rows[0];
  return [
    {
      heading: "At a glance",
      summary: busiest
        ? `${busiest.name} carries the most open work (${busiest.open}). ${rows.filter((r) => r.overdue > 0).length} ${rows.filter((r) => r.overdue > 0).length === 1 ? "person has" : "people have"} overdue ${plural}.`
        : `Nobody has open ${plural} you can see.`,
      stats: [
        { label: "People with work", value: String(rows.length) },
        { label: "With overdue work", value: String(rows.filter((r) => r.overdue > 0).length), tone: rows.some((r) => r.overdue > 0) ? "bad" : "good" },
        { label: `Open ${plural} nobody is on`, value: String(unassigned), tone: unassigned ? "warn" : null },
      ],
    },
    {
      heading: "Workload by person",
      summary: `Only ${plural} you can see are counted.`,
      table: {
        caption: `Open, overdue, due-soon and finished ${plural} for each person`,
        head: ["Person", "Open", "Overdue", "Due in 7 days", "Finished in this period"],
        numeric: [1, 2, 3, 4],
        rows: rows.map((r) => [r.name, r.open, r.overdue, r.soon, r.done]),
        tones: rows.map((r) => (r.overdue > 0 ? "bad" : r.soon > 0 ? "warn" : "good") as ReportTone),
        empty: `Nobody has ${plural} in this period.`,
      },
    },
  ];
}

async function costSections(ctx: OrgContext, { projectId, from, to }: ReportParams): Promise<ReportSection[]> {
  const [budgets, spending] = await Promise.all([getBudgets(ctx), getSpending(ctx, { status: "approved", from, to, limit: 5000 })]);
  const entries = projectId ? spending.filter((e) => e.projectId === projectId) : spending;
  const sameCurrency = budgets.every((b) => b.currency === budgets[0]?.currency);
  const cur = budgets[0]?.currency ?? "CAD";
  const byCategory = new Map<string, number>();
  for (const e of entries) byCategory.set(`${e.category}|${e.currency}`, (byCategory.get(`${e.category}|${e.currency}`) ?? 0) + e.amountCents);
  return [
    {
      heading: "At a glance",
      summary: "Approved spending only. Your official books stay in your accounting software.",
      stats: sameCurrency
        ? [
            { label: "Total budget", value: formatMoney(budgets.reduce((s, b) => s + b.totalCents, 0), cur) },
            { label: "Spent to date", value: formatMoney(budgets.reduce((s, b) => s + b.spentCents, 0), cur) },
            { label: "Spent in this period", value: formatMoney(entries.reduce((s, e) => s + e.amountCents, 0), cur) },
            { label: "Waiting for approval", value: formatMoney(budgets.reduce((s, b) => s + b.pendingCents, 0), cur), tone: "warn" },
          ]
        : [{ label: "Funds", value: String(budgets.length) }],
    },
    {
      heading: "Budget against actual",
      table: {
        caption: "Each fund's total, approved spending and status",
        head: ["Fund", "Budget", "Spent", "Waiting", "Left", "Spend by", "Status"],
        numeric: [1, 2, 3, 4],
        rows: budgets.map((b) => [
          b.name,
          formatMoney(b.totalCents, b.currency),
          formatMoney(b.spentCents, b.currency),
          formatMoney(b.pendingCents, b.currency),
          formatMoney(b.totalCents - b.spentCents, b.currency),
          b.spendBy ?? "",
          BUDGET_LABEL[b.status],
        ]),
        tones: budgets.map((b) => BUDGET_TONE[b.status]),
        empty: "No funds yet.",
      },
    },
    {
      heading: "Spending by category",
      table: {
        caption: "Approved spending in this period by category",
        head: ["Category", "Amount"],
        numeric: [1],
        rows: [...byCategory.entries()].sort(([, a], [, b]) => b - a).map(([k, cents]) => [k.split("|")[0]!, formatMoney(cents, k.split("|")[1]!)]),
        empty: "No approved spending in this period.",
      },
    },
    {
      heading: "Approved spending",
      table: {
        caption: "Each approved entry in this period",
        head: ["Date", "Fund", ctx.t("project"), "Category", "Note", "Amount"],
        numeric: [5],
        rows: [...entries]
          .sort((a, b) => a.spentOn.localeCompare(b.spentOn))
          .map((e) => [e.spentOn, e.fundName ?? "", e.projectName ?? "", e.category, e.note ?? "", formatMoney(e.amountCents, e.currency)]),
        empty: "No approved spending in this period.",
      },
    },
  ];
}

async function attendanceSections(ctx: OrgContext, { projectId, from, to }: ReportParams): Promise<ReportSection[] | null> {
  const { t, tz, org } = ctx;
  const programs = await getAttendancePrograms(org.id);
  if (programs.length === 0) return null;
  const programId = projectId && programs.some((p) => p.id === projectId) ? projectId : undefined;
  const [marks, names] = await Promise.all([
    getMarksInRange(org.id, zonedTimeToUtc(from, "00:00", tz).toISOString(), zonedTimeToUtc(addDays(to, 1), "00:00", tz).toISOString(), programId),
    getParticipantNames(org.id),
  ]);
  const low = (org as { low_attendance_percent?: number }).low_attendance_percent ?? 50;
  const sessions = new Set(marks.map((m) => m.event?.id).filter(Boolean)).size;
  const tallies = new Map<string, ReturnType<typeof emptyTally>>();
  for (const m of marks) {
    if (!m.participant_id) continue;
    tallies.set(m.participant_id, addMark(tallies.get(m.participant_id) ?? emptyTally(), m.status));
  }
  const removed = `Removed ${lower(t("participant"))}`;
  const rows = [...tallies.entries()]
    .map(([id, tally]) => ({ name: names.get(id) ?? removed, tally, rate: attendanceRate(tally) }))
    .sort((a, b) => (a.rate ?? 2) - (b.rate ?? 2) || a.name.localeCompare(b.name));
  const below = rows.filter((r) => r.rate !== null && r.rate * 100 < low);
  const overall = attendanceRate(rows.reduce((s, r) => ({ present: s.present + r.tally.present, late: s.late + r.tally.late, absent: s.absent + r.tally.absent, excused: s.excused + r.tally.excused, total: s.total + r.tally.total }), emptyTally()));
  return [
    {
      heading: "At a glance",
      summary: `${below.length} ${below.length === 1 ? lower(t("participant")) : lower(t("participant", "other"))} below the low mark of ${low}%.`,
      stats: [
        { label: t("event", "other"), value: String(sessions) },
        { label: t("participant", "other"), value: String(rows.length) },
        { label: "Overall rate", value: formatRate(overall) },
        { label: `Below ${low}%`, value: String(below.length), tone: below.length ? "bad" : "good" },
      ],
    },
    {
      heading: `Each ${lower(t("participant"))}`,
      table: {
        caption: `${t("section.attendance")} for each ${lower(t("participant"))}, lowest rate first`,
        head: [t("participant"), t("attendance.present"), t("attendance.late"), t("attendance.absent"), t("attendance.excused"), "Rate"],
        numeric: [1, 2, 3, 4, 5],
        rows: rows.map((r) => [r.name, r.tally.present, r.tally.late, r.tally.absent, r.tally.excused, formatRate(r.rate)]),
        tones: rows.map((r) => (r.rate === null ? null : r.rate * 100 < low ? "bad" : "good") as ReportTone),
        empty: `No ${lower(t("section.attendance"))} recorded in this period.`,
      },
    },
  ];
}
