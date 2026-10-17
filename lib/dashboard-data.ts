import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getMembers, type getOrgContext } from "@/lib/org";
import { getEvents, TASK_SELECT, type EventRow, type TaskPriority, type TaskRow } from "@/lib/queries";
import { getAttendancePrograms, getMarksInRange, getParticipantNames, type Mark as AttendanceMark } from "@/lib/participants";
import { getFunds } from "@/lib/funds";
import { getBudgets } from "@/lib/spending";
import { addDays, dateInZone, eventStartDate, formatRelativeDate, formatTime } from "@/lib/dates";
import { canEdit, type EditTarget, type Viewer } from "@/lib/can-edit";
import { isAssignee, PRIORITIES, taskPart } from "@/lib/task-filters";
import { rankOf } from "@/lib/roles";
import { lower } from "@/lib/terminology/t";
import type { Mark, Tone } from "@/components/charts/charts";
import type { FundSummary } from "@/components/dashboard/widgets";

// Dashboard numbers (D105). Every query goes through RLS (can_view_task and
// the attendance and fund rules), so nothing the viewer can't see is loaded,
// counted or sent to the browser. Marks link to an editable view when the
// viewer can act there (canEdit), otherwise to a read-only "View details" panel.

type Ctx = Awaited<ReturnType<typeof getOrgContext>>;
export type Scope = "mine" | "all";

export type DetailItem = { id: string; title: string; href: string; project: string | null; due: string | null; status: TaskRow["status"] };
export type Detail = { title: string; items: DetailItem[] };

export type DayColumn = {
  date: string;
  label: string;
  items: { key: string; title: string; href: string; kind: "work" | "calendar"; time: string | null; overdue: boolean }[];
};

export type DashboardModel = {
  scope: Scope;
  canOversee: boolean;
  tasks: { open: number; marks: Mark[] };
  deadlines: { overdue: number; rows: { key: string; label: string; marks: Mark[] }[] };
  priority: { urgent: number; rows: Mark[] };
  progress: { onTrack: number; rows: (Mark & { note: string })[] };
  comingUp: { count: number; overdue: DayColumn["items"]; days: DayColumn[] };
  attendance: null | {
    rate: number | null;
    low: number;
    high: number;
    rows: (Mark & { note: string })[];
    trend: { key: string; label: string; value: number; href: string; ariaLabel: string; tone: Tone }[];
  };
  workload: null | { total: number; rows: Mark[] };
  funds: FundSummary[] | null;
  detail: Detail | null;
};

const BUCKETS = [
  { key: "overdue", label: "Overdue", tone: "bad" as Tone },
  { key: "soon", label: "Due within 3 days", tone: "warn" as Tone },
  { key: "ontrack", label: "On track", tone: "good" as Tone },
] as const;
type Bucket = (typeof BUCKETS)[number]["key"];

function bucketOf(due: string, today: string): Bucket {
  if (due < today) return "overdue";
  return due <= addDays(today, 3) ? "soon" : "ontrack";
}

export function rateTone(rate: number | null, low: number, high: number): Tone {
  if (rate === null) return "neutral";
  const pct = rate * 100;
  return pct < low ? "bad" : pct < high ? "warn" : "good";
}

/** The short word shown next to a rate (the full phrase goes in its label). */
export function rateBand(rate: number | null, low: number, high: number): string {
  if (rate === null) return "—";
  const pct = rate * 100;
  return pct < low ? "Poor" : pct < high ? "Fair" : "Good";
}

export function rateWord(rate: number | null, low: number, high: number): string {
  if (rate === null) return "nothing counted yet";
  const pct = rate * 100;
  return pct < low ? "below the low mark" : pct < high ? "below the high mark" : "on target";
}

/** Everything a dashboard loads, through the viewer's own access. */
export async function loadDashboardInputs(ctx: Ctx) {
  const supabase = await createClient();
  const now = new Date();
  const [{ data: tasks, error }, { data: projects }, { data: ranks }, { data: mine }, events, members] = await Promise.all([
    supabase.from("tasks").select(TASK_SELECT).eq("organization_id", ctx.org.id).limit(5000),
    supabase.from("projects").select("id, name, color, status").eq("organization_id", ctx.org.id).order("name"),
    supabase.rpc("my_project_ranks", { org_id: ctx.org.id }),
    supabase.from("project_members").select("project_id").eq("membership_id", ctx.membershipId),
    getEvents(ctx.org.id, now.toISOString(), new Date(now.getTime() + 8 * 86400000).toISOString()),
    getMembers(ctx.org.id),
  ]);
  if (error) throw error;
  const projectRanks = new Map((ranks ?? []).map((r) => [r.project_id, r.rank]));
  const viewer: Viewer = { role: ctx.role, projectRanks };
  const owner = ctx.role === "owner";
  const myProjects = new Set(
    owner ? (projects ?? []).filter((p) => p.status === "active").map((p) => p.id) : (mine ?? []).map((m) => m.project_id),
  );
  return { tasks: (tasks ?? []) as TaskRow[], projects: projects ?? [], viewer, myProjects, events, members, projectRanks };
}

type Inputs = Awaited<ReturnType<typeof loadDashboardInputs>>;

function isOpenFor(task: TaskRow, membershipId: string) {
  return task.status !== "done" && !taskPart(task, membershipId)?.mineDone;
}

/** The viewer oversees others: a manager or owner, or an admin or lead of some program. */
export function oversees(inputs: Pick<Inputs, "viewer">) {
  return rankOf(inputs.viewer.role) >= rankOf("manager") || [...inputs.viewer.projectRanks.values()].some((r) => r >= 2);
}

/** "Mine" is work assigned to the viewer; "everything I oversee" adds the programs they run (all of it for managers and owners). */
function scopeTasks(inputs: Inputs, ctx: Ctx, scope: Scope): TaskRow[] {
  if (scope === "mine") return inputs.tasks.filter((x) => isAssignee(x, ctx.membershipId));
  if (rankOf(ctx.role) >= rankOf("manager")) return inputs.tasks;
  return inputs.tasks.filter((x) => isAssignee(x, ctx.membershipId) || (x.project_id && (inputs.projectRanks.get(x.project_id) ?? 0) >= 2));
}

export async function buildMainDashboard(ctx: Ctx, scope: Scope, detailKey: string | null): Promise<DashboardModel> {
  const inputs = await loadDashboardInputs(ctx);
  const { t, base, today, tz, membershipId } = ctx;
  const canOversee = oversees(inputs);
  const effective: Scope = canOversee ? scope : "mine";
  const scoped = scopeTasks(inputs, ctx, effective);
  const open = scoped.filter((x) => isOpenFor(x, membershipId));
  const taskWord = (n: number) => lower(t("task", n === 1 ? "one" : "other"));
  const projectName = new Map(inputs.projects.map((p) => [p.id, p.name]));
  const noProject = `No ${lower(t("project"))}`;
  const mineQuery = effective === "mine" ? "&assignee=me" : "";
  const dashboard = `${base}/dashboard${effective === "all" ? "?scope=all&" : "?"}`;
  const detailHref = (key: string) => `${dashboard}detail=${encodeURIComponent(key)}#details`;
  const editable = (target: EditTarget) => effective === "mine" || canEdit(target, inputs.viewer);
  const details: Record<string, () => Detail> = {};

  // Tasks: to do, in progress, done this week
  const weekAgo = Date.now() - 7 * 86400000;
  const doneThisWeek = scoped.filter((x) => x.status === "done" && x.completed_at && Date.parse(x.completed_at) >= weekAgo).length;
  const todo = open.filter((x) => x.status === "todo").length;
  const doing = open.filter((x) => x.status === "in_progress").length;
  const taskMarks: Mark[] = [
    { key: "todo", label: t("status.todo"), value: todo, tone: "neutral", href: `${base}/tasks?status=todo${mineQuery}`, ariaLabel: `${todo} ${taskWord(todo)} ${lower(t("status.todo"))}, open the board` },
    { key: "in_progress", label: t("status.in_progress"), value: doing, tone: "accent", href: `${base}/tasks?status=in_progress${mineQuery}`, ariaLabel: `${doing} ${taskWord(doing)} ${lower(t("status.in_progress"))}, open the board` },
    { key: "done", label: `${t("status.done")} this week`, value: doneThisWeek, tone: "good", href: `${base}/tasks?status=done${mineQuery}`, ariaLabel: `${doneThisWeek} ${taskWord(doneThisWeek)} ${lower(t("status.done"))} this week, open the list` },
  ];

  // Deadlines: per program, overdue / within 3 days / on track
  const dated = open.filter((x) => x.due_date);
  const byProject = new Map<string, TaskRow[]>();
  for (const x of dated) {
    const k = x.project_id ?? "none";
    byProject.set(k, [...(byProject.get(k) ?? []), x]);
  }
  const deadlineRows = [...byProject.entries()]
    .map(([pid, list]) => {
      const label = pid === "none" ? noProject : (projectName.get(pid) ?? t("project"));
      const target: EditTarget = { kind: "project_work", projectId: pid === "none" ? null : pid };
      const marks: Mark[] = BUCKETS.map((b) => {
        const items = list.filter((x) => bucketOf(x.due_date!, today) === b.key);
        const key = `deadlines:${pid}:${b.key}`;
        const can = editable(target);
        details[key] = () => ({ title: `${items.length} ${taskWord(items.length)} ${lower(b.label)}: ${label}`, items: items.map((x) => detailItem(x, base, projectName)) });
        return {
          key,
          label: b.label,
          value: items.length,
          tone: b.tone,
          symbol: undefined,
          href: can ? `${base}/tasks?view=list&project=${pid}&due=${b.key}${mineQuery}` : detailHref(key),
          ariaLabel: `${items.length} ${taskWord(items.length)} ${lower(b.label)} in ${label}, ${can ? "open the list" : "view details"}`,
        };
      });
      return { key: pid, label, marks };
    })
    .sort((a, b) => (b.marks[0]!.value - a.marks[0]!.value) || a.label.localeCompare(b.label))
    .slice(0, 8);

  // Priority of open work
  const prioTone: Record<TaskPriority, Tone> = { critical: "prio-critical", high: "prio-high", medium: "prio-medium", low: "prio-low" };
  const priorityRows: Mark[] = PRIORITIES.map((p) => {
    const n = open.filter((x) => x.priority === p).length;
    return {
      key: `priority:${p}`,
      label: t(`priority.${p}`),
      value: n,
      tone: prioTone[p],
      href: `${base}/tasks?priority=${p}${mineQuery}`,
      ariaLabel: `${n} ${lower(t(`priority.${p}`))} priority ${taskWord(n)}, open the board`,
    };
  });

  // Progress of the viewer's programs (all their work, not just the viewer's)
  const progressRows = inputs.projects
    .filter((p) => inputs.myProjects.has(p.id) && p.status === "active")
    .map((p) => {
      const list = inputs.tasks.filter((x) => x.project_id === p.id);
      const done = list.filter((x) => x.status === "done").length;
      const pending = list.filter((x) => x.status !== "done");
      const overdue = pending.filter((x) => x.due_date && x.due_date < today).length;
      const behind = pending.filter((x) => x.status === "todo" && x.due_date && x.due_date <= addDays(today, 3)).length;
      const pct = list.length ? Math.round((done / list.length) * 100) : 0;
      const tone: Tone = overdue ? "bad" : behind ? "warn" : "good";
      const note = overdue ? `${overdue} overdue` : behind ? "behind" : "on pace";
      const key = `progress:${p.id}`;
      const can = canEdit({ kind: "project", projectId: p.id }, inputs.viewer);
      details[key] = () => ({
        title: `${p.name}: ${pending.length} open ${taskWord(pending.length)}`,
        items: pending.map((x) => detailItem(x, base, projectName)),
      });
      return {
        key,
        label: p.name,
        value: pct,
        tone,
        note,
        href: can ? `${base}/projects/${p.id}` : detailHref(key),
        ariaLabel: `${p.name}: ${pct}% ${lower(t("status.done"))}, ${note}, ${can ? `open the ${lower(t("project"))}` : "view details"}`,
      };
    });

  // Coming up: the next seven days of due work and calendar items
  const days: DayColumn[] = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(today, i);
    return { date, label: formatRelativeDate(date, today), items: [] };
  });
  const overdueItems: DayColumn["items"] = [];
  for (const x of open) {
    if (!x.due_date) continue;
    const item = { key: `task-${x.id}`, title: x.title, href: `${base}/tasks/${x.id}`, kind: "work" as const, time: null, overdue: x.due_date < today };
    if (x.due_date < today) overdueItems.push(item);
    else days.find((d) => d.date === x.due_date)?.items.push(item);
  }
  for (const e of inputs.events) {
    if (e.project_id && !inputs.myProjects.has(e.project_id)) continue;
    const date = eventStartDate(e.starts_at, e.all_day, tz);
    days.find((d) => d.date === date)?.items.push({
      key: `event-${e.id}`,
      title: e.title,
      href: `${base}/calendar?view=agenda&date=${date}`,
      kind: "calendar",
      time: e.all_day ? null : formatTime(e.starts_at, tz),
      overdue: false,
    });
  }

  const manager = rankOf(ctx.role) >= rankOf("manager");
  const [attendance, workload, funds, budgets] = await Promise.all([
    buildAttendance(ctx, inputs, detailHref),
    buildWorkload(ctx, inputs),
    manager ? getFunds(ctx.org.id) : Promise.resolve(null),
    // budget against actual feeds the Funding widget (D108)
    manager ? getBudgets(ctx) : Promise.resolve([]),
  ]);
  const budgetOf = new Map(budgets.map((b) => [b.id, b]));

  return {
    scope: effective,
    canOversee,
    tasks: { open: open.length, marks: taskMarks },
    deadlines: { overdue: dated.filter((x) => x.due_date! < today).length, rows: deadlineRows },
    priority: { urgent: open.filter((x) => x.priority === "critical" || x.priority === "high").length, rows: priorityRows },
    progress: { onTrack: progressRows.filter((r) => r.tone === "good").length, rows: progressRows },
    comingUp: { count: days.reduce((s, d) => s + d.items.length, 0), overdue: overdueItems, days },
    attendance,
    workload,
    funds: funds
      ? funds.map((f) => ({
          id: f.id,
          name: f.name,
          currency: f.currency,
          totalCents: f.total_cents,
          parts: f.allocations.map((a) => ({ key: a.id, label: a.label, cents: a.amount_cents })),
          spentCents: budgetOf.get(f.id)?.spentCents ?? 0,
          status: budgetOf.get(f.id)?.status ?? "on_pace",
        }))
      : null,
    detail: detailKey && details[detailKey] ? details[detailKey]!() : null,
  };
}

function detailItem(x: TaskRow, base: string, projectName: Map<string, string>): DetailItem {
  return { id: x.id, title: x.title, href: `${base}/tasks/${x.id}`, project: x.project_id ? (projectName.get(x.project_id) ?? null) : null, due: x.due_date, status: x.status };
}

/** Attendance for the programs the viewer runs (D81): a bar per participant and a trend per session. */
async function buildAttendance(
  ctx: Ctx,
  inputs: Pick<Inputs, "viewer">,
  detailHref: (key: string) => string,
  onlyProject?: string,
): Promise<DashboardModel["attendance"]> {
  const programs = (await getAttendancePrograms(ctx.org.id)).filter((p) => !onlyProject || p.id === onlyProject);
  if (programs.length === 0) return null;
  const { t, base, today, org } = ctx;
  const low = org.low_attendance_percent;
  const high = org.high_attendance_percent;
  const from = addDays(today, -30);
  const [marks, names] = await Promise.all([
    Promise.all(programs.map((p) => getMarksInRange(org.id, `${from}T00:00:00Z`, `${addDays(today, 1)}T00:00:00Z`, p.id))).then((x) => x.flat()),
    getParticipantNames(org.id),
  ]);
  const counted = (list: AttendanceMark[]) => list.filter((m) => m.status !== "excused");
  const rateOf = (list: AttendanceMark[]) => {
    const c = counted(list);
    return c.length ? c.filter((m) => m.status === "present" || m.status === "late").length / c.length : null;
  };
  const byPerson = new Map<string, AttendanceMark[]>();
  for (const m of marks) if (m.participant_id) byPerson.set(m.participant_id, [...(byPerson.get(m.participant_id) ?? []), m]);
  const programOf = new Map(marks.map((m) => [m.participant_id, m.event?.project_id ?? null]));
  const rows = [...byPerson.entries()]
    .map(([pid, list]) => {
      const rate = rateOf(list);
      const name = names.get(pid) ?? lower(t("participant"));
      const projectId = programOf.get(pid) ?? programs[0]!.id;
      const can = canEdit({ kind: "participant", projectId }, inputs.viewer);
      const pct = rate === null ? 0 : Math.round(rate * 100);
      return {
        key: `attendance:${pid}`,
        label: name,
        value: pct,
        tone: rateTone(rate, low, high),
        note: rateBand(rate, low, high),
        href: can ? `${base}/attendance/participants/${pid}` : detailHref(`attendance:${pid}`),
        ariaLabel: `${name}: ${pct}% ${lower(t("section.attendance"))}, ${rateWord(rate, low, high)}, ${can ? "open their record" : "view details"}`,
      };
    })
    .sort((a, b) => a.value - b.value)
    .slice(0, 8);
  const bySession = new Map<string, AttendanceMark[]>();
  for (const m of marks) if (m.event) bySession.set(m.event.id, [...(bySession.get(m.event.id) ?? []), m]);
  const trend = [...bySession.entries()]
    .map(([eid, list]) => ({ eid, list, ev: list[0]!.event! }))
    .sort((a, b) => a.ev.starts_at.localeCompare(b.ev.starts_at))
    .slice(-10)
    .map(({ eid, list, ev }) => {
      const rate = rateOf(list) ?? 0;
      const day = formatRelativeDate(dateInZone(new Date(ev.starts_at), ev.all_day ? "UTC" : ctx.tz), today);
      return {
        key: `session:${eid}`,
        label: `${ev.title}, ${day}`,
        value: rate,
        tone: rateTone(rate, low, high),
        href: `${base}/attendance?view=take&program=${ev.project_id}&session=${eid}`,
        ariaLabel: `${ev.title}, ${day}: ${Math.round(rate * 100)}% ${lower(t("section.attendance"))}, open check-in`,
      };
    });
  return { rate: rateOf(marks), low, high, rows, trend };
}

/** Open work per person ranked below the viewer (managers and owners). */
async function buildWorkload(ctx: Ctx, inputs: Inputs): Promise<DashboardModel["workload"]> {
  if (rankOf(ctx.role) < rankOf("manager")) return null;
  const mine = rankOf(ctx.role);
  const below = inputs.members.filter((m) => rankOf(m.role) < mine);
  const allOpen = inputs.tasks.filter((x) => x.status !== "done");
  const rows: Mark[] = below
    .map((m) => {
      const n = allOpen.filter((x) => x.assignees.some((a) => a.membership_id === m.id && !a.done_at)).length;
      return {
        key: `workload:${m.id}`,
        label: m.name,
        value: n,
        tone: "accent" as Tone,
        href: `${ctx.base}/tasks?view=list&assignee=${m.id}`,
        ariaLabel: `${m.name}: ${n} open ${lower(ctx.t("task", n === 1 ? "one" : "other"))}, open their list`,
      };
    })
    .sort((a, b) => b.value - a.value);
  return { total: rows.reduce((s, r) => s + r.value, 0), rows };
}

export type ProjectDashboardModel = {
  tasks: { open: number; marks: Mark[] };
  priority: { urgent: number; rows: Mark[] };
  deadlines: { overdue: number; rows: Mark[] };
  attendance: DashboardModel["attendance"];
  detail: Detail | null;
};

/**
 * A program's own dashboard, from the tasks its page already loaded (so no
 * second task query) plus its attendance, for those allowed to see it.
 */
export async function buildProjectDashboard(
  ctx: Ctx,
  projectId: string,
  projectName: string,
  tasks: TaskRow[],
  detailKey: string | null,
): Promise<ProjectDashboardModel> {
  const { t, base, today } = ctx;
  const supabase = await createClient();
  const { data: ranks } = await supabase.rpc("my_project_ranks", { org_id: ctx.org.id });
  const viewer: Viewer = { role: ctx.role, projectRanks: new Map((ranks ?? []).map((r) => [r.project_id, r.rank])) };
  const can = canEdit({ kind: "project_work", projectId }, viewer);
  const page = `${base}/projects/${projectId}`;
  const detailHref = (key: string) => `${page}?detail=${encodeURIComponent(key)}#details`;
  const taskWord = (n: number) => lower(t("task", n === 1 ? "one" : "other"));
  const open = tasks.filter((x) => x.status !== "done");
  const names = new Map([[projectId, projectName]]);
  const details: Record<string, () => Detail> = {};
  const link = (key: string, editHref: string, items: TaskRow[], title: string) => {
    details[key] = () => ({ title, items: items.map((x) => detailItem(x, base, names)) });
    return can ? editHref : detailHref(key);
  };
  const verb = can ? "open the board" : "view details";

  const weekAgo = Date.now() - 7 * 86400000;
  const groups: { key: string; label: string; tone: Tone; items: TaskRow[]; status: string }[] = [
    { key: "todo", label: t("status.todo"), tone: "neutral", items: open.filter((x) => x.status === "todo"), status: "todo" },
    { key: "in_progress", label: t("status.in_progress"), tone: "accent", items: open.filter((x) => x.status === "in_progress"), status: "in_progress" },
    {
      key: "done",
      label: `${t("status.done")} this week`,
      tone: "good",
      items: tasks.filter((x) => x.status === "done" && x.completed_at && Date.parse(x.completed_at) >= weekAgo),
      status: "done",
    },
  ];
  const taskMarks: Mark[] = groups.map((g) => ({
    key: `p-tasks:${g.key}`,
    label: g.label,
    value: g.items.length,
    tone: g.tone,
    href: link(`p-tasks:${g.key}`, `${base}/tasks?project=${projectId}&status=${g.status}`, g.items, `${g.items.length} ${taskWord(g.items.length)}: ${g.label}`),
    ariaLabel: `${g.items.length} ${taskWord(g.items.length)} ${lower(g.label)}, ${verb}`,
  }));

  const prioTone: Record<TaskPriority, Tone> = { critical: "prio-critical", high: "prio-high", medium: "prio-medium", low: "prio-low" };
  const priorityRows: Mark[] = PRIORITIES.map((p) => {
    const items = open.filter((x) => x.priority === p);
    return {
      key: `p-priority:${p}`,
      label: t(`priority.${p}`),
      value: items.length,
      tone: prioTone[p],
      href: link(`p-priority:${p}`, `${base}/tasks?project=${projectId}&priority=${p}`, items, `${items.length} ${lower(t(`priority.${p}`))} priority ${taskWord(items.length)}`),
      ariaLabel: `${items.length} ${lower(t(`priority.${p}`))} priority ${taskWord(items.length)}, ${verb}`,
    };
  });

  const dated = open.filter((x) => x.due_date);
  const deadlineRows: Mark[] = BUCKETS.map((b) => {
    const items = dated.filter((x) => bucketOf(x.due_date!, today) === b.key);
    return {
      key: `p-deadlines:${b.key}`,
      label: b.label,
      value: items.length,
      tone: b.tone,
      href: link(`p-deadlines:${b.key}`, `${base}/tasks?view=list&project=${projectId}&due=${b.key}`, items, `${items.length} ${taskWord(items.length)}: ${lower(b.label)}`),
      ariaLabel: `${items.length} ${taskWord(items.length)} ${lower(b.label)}, ${can ? "open the list" : "view details"}`,
    };
  });

  const attendance = await buildAttendance(ctx, { viewer }, detailHref, projectId);

  return {
    tasks: { open: open.length, marks: taskMarks },
    priority: { urgent: open.filter((x) => x.priority === "critical" || x.priority === "high").length, rows: priorityRows },
    deadlines: { overdue: dated.filter((x) => x.due_date! < today).length, rows: deadlineRows },
    attendance,
    detail: detailKey && details[detailKey] ? details[detailKey]!() : null,
  };
}

export type { EventRow };
