import { describe, expect, it } from "vitest";
import { filterTasks, readFilters, readSort, sortTasks } from "@/lib/task-filters";
import type { TaskRow } from "@/lib/queries";

const P1 = "11111111-1111-4111-8111-111111111111";
const P2 = "22222222-2222-4222-8222-222222222222";
const ME = "33333333-3333-4333-8333-333333333333";
const YOU = "44444444-4444-4444-8444-444444444444";
const today = "2026-10-07";

function task(id: string, patch: Partial<TaskRow>): TaskRow {
  return {
    id,
    title: id,
    description: null,
    status: "todo",
    due_date: null,
    position: 0,
    project_id: P1,
    assignee_membership_id: null,
    completed_at: null,
    created_by: null,
    project: { id: P1, name: "Alpha", color: null, status: "active" },
    ...patch,
  };
}

const tasks = [
  task("late", { due_date: "2026-10-01", assignee_membership_id: ME }),
  task("late-but-done", { due_date: "2026-10-01", status: "done" }),
  task("today", { due_date: today, assignee_membership_id: YOU, project_id: P2, project: { id: P2, name: "Beta", color: null, status: "active" } }),
  task("soon", { due_date: "2026-10-10", status: "in_progress" }),
  task("later", { due_date: "2026-11-20" }),
  task("undated", {}),
];
const ids = (list: TaskRow[]) => list.map((t) => t.id);

describe("task filters", () => {
  it("filters by due window", () => {
    expect(ids(filterTasks(tasks, { due: "overdue" }, today, ME))).toEqual(["late"]);
    expect(ids(filterTasks(tasks, { due: "today" }, today, ME))).toEqual(["today"]);
    expect(ids(filterTasks(tasks, { due: "week" }, today, ME))).toEqual(["today", "soon"]);
    expect(ids(filterTasks(tasks, { due: "later" }, today, ME))).toEqual(["later"]);
    expect(ids(filterTasks(tasks, { due: "none" }, today, ME))).toEqual(["undated"]);
  });

  it("filters by assignee, project and status", () => {
    expect(ids(filterTasks(tasks, { assignee: "me" }, today, ME))).toEqual(["late"]);
    expect(ids(filterTasks(tasks, { assignee: YOU }, today, ME))).toEqual(["today"]);
    expect(filterTasks(tasks, { assignee: "none" }, today, ME)).toHaveLength(4);
    expect(ids(filterTasks(tasks, { project: P2 }, today, ME))).toEqual(["today"]);
    expect(ids(filterTasks(tasks, { status: "in_progress" }, today, ME))).toEqual(["soon"]);
  });

  it("ignores malformed URL parameters", () => {
    expect(readFilters({ project: "x; drop table", assignee: "everyone", status: "bogus", due: "yesterday" })).toEqual({
      project: undefined,
      assignee: undefined,
      status: undefined,
      due: undefined,
    });
    expect(readSort({ sort: "nope", dir: "sideways" })).toEqual({ key: "due", dir: "asc" });
  });
});

describe("task sorting", () => {
  const names = new Map([[ME, "Avery"], [YOU, "Blake"]]);
  it("sorts by due date with undated last in both directions", () => {
    expect(ids(sortTasks(tasks, { key: "due", dir: "asc" }, names)).at(-1)).toBe("undated");
    expect(ids(sortTasks(tasks, { key: "due", dir: "desc" }, names))[0]).toBe("later");
    expect(ids(sortTasks(tasks, { key: "due", dir: "desc" }, names)).at(-1)).toBe("undated");
  });
  it("sorts by status order and by assignee name", () => {
    expect(ids(sortTasks(tasks, { key: "status", dir: "desc" }, names))[0]).toBe("late-but-done");
    expect(ids(sortTasks(tasks, { key: "assignee", dir: "asc" }, names)).slice(0, 2)).toEqual(["late", "today"]);
  });
});
