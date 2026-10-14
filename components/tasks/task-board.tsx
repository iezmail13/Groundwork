"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition, type ReactNode } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { EyeOff, GripVertical, User } from "lucide-react";
import { moveTask } from "@/app/[orgSlug]/tasks/actions";
import { useT } from "@/lib/terminology/context";
import { lower } from "@/lib/terminology/t";
import type { ProjectOption, TaskRow, TaskStatus } from "@/lib/queries";
import { AssigneeStack, DueBadge, NeedsAssigneeBadge, PriorityFlag, ProjectDot, TaskStatusIcon } from "./badges";
import { assigneeIds } from "@/lib/task-filters";
import { QuickAddTask } from "./quick-add";
import { TaskDoneBox } from "./task-checkbox";
import { ClaimButton } from "./claim-button";

/**
 * The board (D101). Status follows the people on a task, so there are two
 * columns, To do (nobody on it) and In progress (someone on it), and done is
 * a tick on the card. Cards reorder within their column by dragging or with
 * the keyboard; they don't move between columns. Under the Completed filter
 * the board shows finished work instead.
 */
export function TaskBoard({
  tasks,
  base,
  today,
  organizationId,
  projects,
  memberInitials,
  completed,
  sortedByPriority,
}: {
  tasks: TaskRow[];
  base: string;
  today: string;
  organizationId: string;
  projects: ProjectOption[];
  memberInitials: Record<string, { initials: string; name: string }>;
  /** The Completed filter: one column of finished work. */
  completed: boolean;
  /** Ordered by priority rather than by hand, so dragging is off. */
  sortedByPriority: boolean;
}) {
  const t = useT();
  const columns: TaskStatus[] = completed ? ["done"] : ["todo", "in_progress"];
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-ink-muted">
        {completed
          ? `Finished work. Untick one to reopen it.`
          : sortedByPriority
            ? `Sorted by priority. Switch back to board order to rearrange cards.`
            : `${t("status.todo")} has open work nobody has claimed yet. Drag a card, or focus its handle and press Space then the arrow keys, to reorder it. Tick a card when it's done.`}
      </p>
      <div className={`grid gap-4 ${completed ? "" : "md:grid-cols-2"}`}>
        {columns.map((status) => (
          <BoardColumn
            key={status}
            status={status}
            tasks={tasks.filter((x) => x.status === status)}
            base={base}
            today={today}
            memberInitials={memberInitials}
            sortable={!completed && !sortedByPriority}
            title={t(`status.${status}`)}
          >
            {status === "todo" ? (
              <QuickAddTask organizationId={organizationId} projects={projects} compact idSuffix="board" status="todo" />
            ) : null}
          </BoardColumn>
        ))}
      </div>
    </div>
  );
}

function sortByPosition(list: TaskRow[]): TaskRow[] {
  return [...list].sort((a, b) => a.position - b.position);
}

/** A position between the neighbours of `index` in `list` (which excludes the moved card). */
function positionAt(list: TaskRow[], index: number): number {
  const before = list[index - 1]?.position;
  const after = list[index]?.position;
  if (before !== undefined && after !== undefined) return (before + after) / 2;
  if (before !== undefined) return before + 1;
  if (after !== undefined) return after - 1;
  return Date.now() / 1000;
}

function BoardColumn({
  status,
  tasks,
  base,
  today,
  memberInitials,
  sortable,
  title,
  children,
}: {
  status: TaskStatus;
  tasks: TaskRow[];
  base: string;
  today: string;
  memberInitials: Record<string, { initials: string; name: string }>;
  sortable: boolean;
  title: string;
  children?: ReactNode;
}) {
  const t = useT();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [order, setOrder] = useState(() => (sortable ? sortByPosition(tasks) : tasks));
  const [activeId, setActiveId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const dndId = useId();

  // follow the server whenever the column's contents change
  const signature = tasks.map((x) => `${x.id}:${x.position}:${x.status}:${x.assignees.length}:${x.priority}`).join("|");
  const [lastSignature, setLastSignature] = useState(signature);
  if (signature !== lastSignature) {
    setLastSignature(signature);
    setOrder(sortable ? sortByPosition(tasks) : tasks);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const titleOf = (id: string | number) => order.find((x) => x.id === String(id))?.title ?? lower(t("task"));
  const positionOf = (id: string | number) => order.findIndex((x) => x.id === String(id)) + 1;

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveId(null);
    if (!over || active.id === over.id) return;
    const from = order.findIndex((x) => x.id === active.id);
    const to = order.findIndex((x) => x.id === over.id);
    if (from < 0 || to < 0) return;
    const moved = arrayMove(order, from, to);
    const others = moved.filter((x) => x.id !== active.id);
    const position = positionAt(others, to);
    setOrder(moved.map((x) => (x.id === active.id ? { ...x, position } : x)));
    setMessage(`Moved “${titleOf(active.id)}” to position ${to + 1} of ${order.length}.`);
    startTransition(async () => {
      const result = await moveTask({ id: String(active.id), position });
      if (!result.ok) {
        setMessage(result.message);
        setOrder(sortByPosition(tasks));
      }
      router.refresh();
    });
  };

  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up “${titleOf(active.id)}”, position ${positionOf(active.id)} of ${order.length}. Use the arrow keys to move it, Space to drop, Escape to cancel.`,
    onDragOver: ({ active, over }) => (over ? `“${titleOf(active.id)}” is over position ${positionOf(over.id)}.` : `“${titleOf(active.id)}” is not over a position.`),
    onDragEnd: ({ active, over }) => (over ? `Dropped “${titleOf(active.id)}” at position ${positionOf(over.id)}.` : `Dropped “${titleOf(active.id)}”.`),
    onDragCancel: ({ active }) => `Cancelled. “${titleOf(active.id)}” is back where it was.`,
  };

  const active = activeId ? order.find((x) => x.id === activeId) : undefined;
  const list = (
    <ul className="flex min-h-16 flex-col gap-2" aria-label={`${title}: ${order.length}`}>
      {order.map((task) => (
        <Card key={task.id} task={task} base={base} today={today} memberInitials={memberInitials} sortable={sortable} />
      ))}
    </ul>
  );

  return (
    <section aria-labelledby={`col-${status}`} className="flex flex-col gap-3 rounded-lg border border-rule bg-panel/60 p-3" data-column={status}>
      <h2 id={`col-${status}`} className="flex items-center gap-2 font-heading text-sm font-bold">
        <TaskStatusIcon status={status} className={`size-4 ${status === "in_progress" ? "text-accent" : status === "done" ? "text-good" : ""}`} />
        {title}
        <span className="ml-auto rounded-full border border-rule px-2 text-xs font-semibold tabular-nums">{order.length}</span>
      </h2>
      <p role="status" aria-live="polite" className="sr-only">
        {message}
      </p>
      {children}
      {sortable ? (
        <DndContext
          id={dndId}
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={({ active: a }: DragStartEvent) => setActiveId(String(a.id))}
          onDragEnd={onDragEnd}
          onDragCancel={() => setActiveId(null)}
          accessibility={{
            announcements,
            screenReaderInstructions: {
              draggable: "To pick up a card, press Space or Enter. Use the up and down arrow keys to move it, then Space or Enter to drop it, or Escape to cancel.",
            },
          }}
        >
          <SortableContext items={order.map((x) => x.id)} strategy={verticalListSortingStrategy}>
            {list}
          </SortableContext>
          <DragOverlay>
            {active ? (
              <div className="rounded-lg border border-ink bg-canvas p-3">
                <p className="font-semibold">{active.title}</p>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      ) : (
        list
      )}
      {order.length === 0 ? (
        <p className="rounded-md border border-dashed border-rule px-3 py-4 text-center text-sm text-ink-muted">
          {status === "todo"
            ? `Nothing waiting to be claimed.`
            : status === "in_progress"
              ? `Nobody is working on anything here yet.`
              : `Nothing finished matches these filters.`}
        </p>
      ) : null}
    </section>
  );
}

function Card({
  task,
  base,
  today,
  memberInitials,
  sortable,
}: {
  task: TaskRow;
  base: string;
  today: string;
  memberInitials: Record<string, { initials: string; name: string }>;
  sortable: boolean;
}) {
  const t = useT();
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled: !sortable,
  });
  const style = {
    transform: transform ? `translate3d(${Math.round(transform.x)}px, ${Math.round(transform.y)}px, 0)` : undefined,
    transition,
  };
  const [completing, setCompleting] = useState(false);
  const people = assigneeIds(task).map((id) => memberInitials[id]).filter((p): p is { initials: string; name: string } => Boolean(p));

  return (
    <li
      ref={setNodeRef}
      style={style}
      data-task-id={task.id}
      className={`group rounded-lg border bg-canvas p-3 transition-[border-color,transform] hover:-translate-y-0.5 hover:border-ink-muted ${
        isDragging ? "border-dashed border-ink opacity-50" : "border-rule"
      } ${completing ? "task-completing" : ""}`}
    >
      <div className="flex items-start gap-2">
        {sortable ? (
          <button
            ref={setActivatorNodeRef}
            id={`card-${task.id}`}
            type="button"
            className="-ml-1 mt-0.5 inline-flex size-6 shrink-0 cursor-grab touch-none items-center justify-center rounded text-ink-muted hover:bg-panel hover:text-ink active:cursor-grabbing"
            aria-label={`Reorder “${task.title}”`}
            {...attributes}
            {...listeners}
          >
            <GripVertical aria-hidden className="size-4" />
          </button>
        ) : null}
        <TaskDoneBox
          task={task}
          onCompleteStart={() => {
            if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) setCompleting(true);
          }}
        />
        <div className="min-w-0 flex-1">
          <Link
            href={`${base}/tasks/${task.id}`}
            className={`task-title block font-semibold break-words hover:underline ${task.status === "done" ? "text-ink-muted line-through" : ""}`}
          >
            {task.title}
          </Link>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-muted">
            <PriorityFlag priority={task.priority} label={t(`priority.${task.priority}`)} />
            {task.project ? (
              <span className="inline-flex min-w-0 items-center gap-1.5 truncate">
                <ProjectDot color={task.project.color} />
                {task.project.name}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <User aria-hidden className="size-3.5" />
                {task.kind === "personal" ? t("task_kind.personal") : `No ${lower(t("project"))}`}
              </span>
            )}
            {task.hidden ? (
              <span className="inline-flex items-center gap-1">
                <EyeOff aria-hidden className="size-3.5" />
                Hidden
              </span>
            ) : null}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <DueBadge dueDate={task.due_date} status={task.status} today={today} />
            {people.length === 0 && task.needs_assignee && task.status !== "done" ? <NeedsAssigneeBadge /> : null}
            {task.completion === "all" && task.assignees.length > 1 ? (
              <span className="text-xs font-semibold">
                {task.assignees.filter((a) => a.done_at).length} of {task.assignees.length} done
              </span>
            ) : null}
            <AssigneeStack people={people} />
            <span className="ml-auto">
              <ClaimButton task={task} />
            </span>
          </div>
        </div>
      </div>
    </li>
  );
}
