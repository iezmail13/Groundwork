import { addDays } from "@/lib/dates";
import type { TaskPriority, TaskRow, TaskStatus } from "@/lib/queries";
import type { Sort, SortKey } from "@/components/tasks/task-table";

export type TaskFilters = {
  project?: string;
  assignee?: string; // "me" | "none" | membership id
  /** Left out: open work only (finished work shows with status "done", the Completed filter). */
  status?: TaskStatus;
  priority?: TaskPriority;
  /** "soon" is due within three days, "ontrack" later than that (the dashboard's deadline buckets, D105). */
  due?: "overdue" | "today" | "soon" | "week" | "ontrack" | "later" | "none";
};

export const PRIORITIES: TaskPriority[] = ["critical", "high", "medium", "low"];
const PRIORITY_ORDER: Record<TaskPriority, number> = { critical: 0, high: 1, medium: 2, low: 3 };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function readFilters(params: Record<string, string | string[] | undefined>): TaskFilters {
  const get = (k: string) => (typeof params[k] === "string" ? (params[k] as string) : undefined);
  const project = get("project");
  const assignee = get("assignee");
  const status = get("status");
  const due = get("due");
  const priority = get("priority");
  return {
    project: project && (project === "none" || UUID.test(project)) ? project : undefined,
    assignee: assignee && (assignee === "me" || assignee === "none" || UUID.test(assignee)) ? assignee : undefined,
    status: status === "todo" || status === "in_progress" || status === "done" ? status : undefined,
    priority: PRIORITIES.find((p) => p === priority),
    due: (["overdue", "today", "soon", "week", "ontrack", "later", "none"] as const).find((d) => d === due),
  };
}

const SORT_KEYS: SortKey[] = ["title", "project", "assignee", "status", "priority", "due"];

export function readSort(params: Record<string, string | string[] | undefined>): Sort {
  const key = SORT_KEYS.find((k) => k === params.sort) ?? "due";
  return { key, dir: params.dir === "desc" ? "desc" : "asc" };
}

/** Everyone on a task, as membership ids and pending invitation ids. */
export function assigneeIds(task: Pick<TaskRow, "assignees">): string[] {
  return task.assignees.map((a) => a.membership_id ?? a.invitation_id ?? "").filter(Boolean);
}

/** A task's first assignee (a membership id or a pending invitation id), or null. */
export function assigneeOf(task: Pick<TaskRow, "assignees">): string | null {
  return assigneeIds(task)[0] ?? null;
}

/** Whether a member is on a task. */
export function isAssignee(task: Pick<TaskRow, "assignees">, membershipId: string): boolean {
  return task.assignees.some((a) => a.membership_id === membershipId);
}

/** Applies filters in memory (also used to test the rules). */
export function filterTasks(tasks: TaskRow[], f: TaskFilters, today: string, myMembershipId: string): TaskRow[] {
  const weekEnd = addDays(today, 7);
  return tasks.filter((task) => {
    if (f.project === "none" ? task.project_id !== null : f.project && task.project_id !== f.project) return false;
    if (f.assignee === "me" && !isAssignee(task, myMembershipId)) return false;
    if (f.assignee === "none" && task.assignees.length > 0) return false;
    if (f.assignee && f.assignee !== "me" && f.assignee !== "none" && !assigneeIds(task).includes(f.assignee)) return false;
    if (f.status && task.status !== f.status) return false;
    if (f.priority && task.priority !== f.priority) return false;
    const due = task.due_date;
    switch (f.due) {
      case "overdue":
        return Boolean(due && due < today && task.status !== "done");
      case "today":
        return due === today;
      case "soon":
        return Boolean(due && due >= today && due <= addDays(today, 3));
      case "week":
        return Boolean(due && due >= today && due <= weekEnd);
      case "ontrack":
        return Boolean(due && due > addDays(today, 3));
      case "later":
        return Boolean(due && due > weekEnd);
      case "none":
        return !due;
      default:
        return true;
    }
  });
}

const STATUS_ORDER: Record<TaskStatus, number> = { todo: 0, in_progress: 1, done: 2 };

/**
 * What a view shows for a status filter: finished work only for "done" (the
 * Completed filter), otherwise open work only, since completing a task hides
 * it from everyday views (D101). It still counts in charts and reports.
 */
export function forStatusView<T extends Pick<TaskRow, "status">>(tasks: T[], status: TaskStatus | undefined): T[] {
  return status === "done" ? tasks.filter((x) => x.status === "done") : tasks.filter((x) => x.status !== "done");
}

/** Most urgent first, then soonest due, then title: the order for "sort by priority". */
export function byPriority<T extends Pick<TaskRow, "priority" | "due_date" | "title">>(a: T, b: T): number {
  return (
    PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] ||
    (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999") ||
    a.title.localeCompare(b.title, undefined, { sensitivity: "base" })
  );
}

export function sortTasks(tasks: TaskRow[], sort: Sort, memberName: Map<string, string>): TaskRow[] {
  const dir = sort.dir === "asc" ? 1 : -1;
  const text = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base" });
  const value = (task: TaskRow): string | number | null => {
    switch (sort.key) {
      case "title":
        return task.title;
      case "project":
        return task.project?.name ?? null;
      case "assignee":
        return memberName.get(assigneeOf(task) ?? "") ?? null;
      case "status":
        return STATUS_ORDER[task.status];
      case "priority":
        return PRIORITY_ORDER[task.priority];
      case "due":
        return task.due_date;
    }
  };
  return [...tasks].sort((a, b) => {
    const va = value(a);
    const vb = value(b);
    // empty values always sort last
    if (va === null && vb === null) return text(a.title, b.title);
    if (va === null) return 1;
    if (vb === null) return -1;
    const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : text(String(va), String(vb));
    return cmp === 0 ? text(a.title, b.title) : cmp * dir;
  });
}

/** The viewer's part of a task that needs everyone to finish, if they're on it. */
export function taskPart(
  task: Pick<TaskRow, "completion" | "assignees">,
  membershipId: string,
): { mineDone: boolean; done: number; total: number } | undefined {
  if (task.completion !== "all") return undefined;
  const mine = task.assignees.find((a) => a.membership_id === membershipId);
  if (!mine) return undefined;
  return { mineDone: mine.done_at !== null, done: task.assignees.filter((a) => a.done_at).length, total: task.assignees.length };
}

/** Whether the viewer can claim a task right now (an open spot on open work they're not on). */
export function canClaim(task: Pick<TaskRow, "kind" | "status" | "claim_limit" | "assignees">, membershipId: string): boolean {
  return (
    task.kind === "general" &&
    task.status !== "done" &&
    !isAssignee(task, membershipId) &&
    (task.claim_limit === null || task.assignees.length < task.claim_limit)
  );
}
