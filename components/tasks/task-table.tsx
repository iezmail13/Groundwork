import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { DueBadge, NeedsAssigneeBadge, PriorityFlag, ProjectDot, TaskStatusBadge } from "./badges";
import { assigneeIds } from "@/lib/task-filters";
import { TaskDoneBox } from "./task-checkbox";
import type { TaskRow } from "@/lib/queries";
import { lower, type Translate } from "@/lib/terminology/t";

export type SortKey = "title" | "project" | "assignee" | "status" | "priority" | "due";
export type Sort = { key: SortKey; dir: "asc" | "desc" };

/** Ruled task table. Pass `sortHref` to make the column headers sortable. */
export function TaskTable({
  tasks,
  base,
  today,
  t,
  memberName,
  sort,
  sortHref,
  showProject = true,
  caption,
}: {
  tasks: TaskRow[];
  base: string;
  today: string;
  t: Translate;
  memberName: Map<string, string>;
  sort?: Sort;
  sortHref?: (key: SortKey) => string;
  showProject?: boolean;
  caption: string;
}) {
  const columns: { key: SortKey; label: string; className?: string }[] = [
    { key: "title", label: "Title" },
    ...(showProject ? [{ key: "project" as const, label: t("project") }] : []),
    { key: "assignee", label: "Assignee" },
    { key: "status", label: "Status" },
    { key: "priority", label: "Priority" },
    { key: "due", label: "Due" },
  ];

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] border-collapse text-left">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-ink font-heading text-sm">
            <th scope="col" className="w-10 py-2">
              <span className="sr-only">Done</span>
            </th>
            {columns.map((c) => {
              const active = sort?.key === c.key;
              return (
                <th
                  key={c.key}
                  scope="col"
                  className="py-2 pr-4 font-semibold"
                  aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : sortHref ? "none" : undefined}
                >
                  {sortHref ? (
                    <Link href={sortHref(c.key)} className="inline-flex items-center gap-1 hover:underline">
                      {c.label}
                      {active ? (
                        sort.dir === "asc" ? (
                          <ArrowUp aria-hidden className="size-3.5" />
                        ) : (
                          <ArrowDown aria-hidden className="size-3.5" />
                        )
                      ) : (
                        <ArrowUpDown aria-hidden className="size-3.5 opacity-50" />
                      )}
                      <span className="sr-only">
                        {active ? `, sorted ${sort.dir === "asc" ? "ascending" : "descending"}` : ", sortable"}
                      </span>
                    </Link>
                  ) : (
                    c.label
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => (
            <tr key={task.id} className="border-b border-rule hover:bg-tint">
              <td className="py-2.5">
                <TaskDoneBox task={task} />
              </td>
              <th scope="row" className="py-2.5 pr-4 font-normal">
                <Link
                  href={`${base}/tasks/${task.id}`}
                  className={`font-semibold hover:underline ${task.status === "done" ? "text-ink-muted line-through" : ""}`}
                >
                  {task.title}
                </Link>
              </th>
              {showProject ? (
                <td className="py-2.5 pr-4 text-sm">
                  {task.project ? (
                    <Link href={`${base}/projects/${task.project.id}`} className="inline-flex items-center gap-1.5 hover:underline">
                      <ProjectDot color={task.project.color} />
                      {task.project.name}
                    </Link>
                  ) : (
                    <span className="text-ink-muted">{task.kind === "personal" ? t("task_kind.personal") : `No ${lower(t("project"))}`}</span>
                  )}
                </td>
              ) : null}
              <td className="py-2.5 pr-4 text-sm">
                {task.assignees.length > 0 ? (
                  assigneeIds(task)
                    .map((id) => memberName.get(id) ?? "Someone")
                    .join(", ")
                ) : task.needs_assignee && task.status !== "done" ? (
                  <NeedsAssigneeBadge />
                ) : (
                  <span className="text-ink-muted">Unassigned</span>
                )}
              </td>
              <td className="py-2.5 pr-4">
                <TaskStatusBadge status={task.status} label={t(`status.${task.status}`)} />
              </td>
              <td className="py-2.5 pr-4">
                <PriorityFlag priority={task.priority} label={t(`priority.${task.priority}`)} />
              </td>
              <td className="py-2.5">
                {task.due_date ? (
                  <DueBadge dueDate={task.due_date} status={task.status} today={today} />
                ) : (
                  <span className="text-sm text-ink-muted">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
