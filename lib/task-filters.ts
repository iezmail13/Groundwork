import { addDays } from "@/lib/dates";
import type { TaskRow, TaskStatus } from "@/lib/queries";
import type { Sort, SortKey } from "@/components/tasks/task-table";

export type TaskFilters = {
  project?: string;
  assignee?: string; // "me" | "none" | membership id
  status?: TaskStatus;
  due?: "overdue" | "today" | "week" | "later" | "none";
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function readFilters(params: Record<string, string | string[] | undefined>): TaskFilters {
  const get = (k: string) => (typeof params[k] === "string" ? (params[k] as string) : undefined);
  const project = get("project");
  const assignee = get("assignee");
  const status = get("status");
  const due = get("due");
  return {
    project: project && UUID.test(project) ? project : undefined,
    assignee: assignee && (assignee === "me" || assignee === "none" || UUID.test(assignee)) ? assignee : undefined,
    status: status === "todo" || status === "in_progress" || status === "done" ? status : undefined,
    due: due === "overdue" || due === "today" || due === "week" || due === "later" || due === "none" ? due : undefined,
  };
}

const SORT_KEYS: SortKey[] = ["title", "project", "assignee", "status", "due"];

export function readSort(params: Record<string, string | string[] | undefined>): Sort {
  const key = SORT_KEYS.find((k) => k === params.sort) ?? "due";
  return { key, dir: params.dir === "desc" ? "desc" : "asc" };
}

/** Applies filters in memory (also used to test the rules). */
export function filterTasks(tasks: TaskRow[], f: TaskFilters, today: string, myMembershipId: string): TaskRow[] {
  const weekEnd = addDays(today, 7);
  return tasks.filter((task) => {
    if (f.project && task.project_id !== f.project) return false;
    if (f.assignee === "me" && task.assignee_membership_id !== myMembershipId) return false;
    if (f.assignee === "none" && task.assignee_membership_id) return false;
    if (f.assignee && f.assignee !== "me" && f.assignee !== "none" && task.assignee_membership_id !== f.assignee) return false;
    if (f.status && task.status !== f.status) return false;
    const due = task.due_date;
    switch (f.due) {
      case "overdue":
        return Boolean(due && due < today && task.status !== "done");
      case "today":
        return due === today;
      case "week":
        return Boolean(due && due >= today && due <= weekEnd);
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
        return task.assignee_membership_id ? (memberName.get(task.assignee_membership_id) ?? null) : null;
      case "status":
        return STATUS_ORDER[task.status];
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
