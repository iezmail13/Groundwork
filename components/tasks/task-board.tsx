"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { ChevronLeft, ChevronRight, GripVertical } from "lucide-react";
import { moveTask } from "@/app/[orgSlug]/tasks/actions";
import { useT } from "@/lib/terminology/context";
import { lower } from "@/lib/terminology/t";
import type { TaskRow, TaskStatus } from "@/lib/queries";
import { DueBadge, ProjectDot, TaskStatusIcon } from "./badges";
import { QuickAddTask } from "./quick-add";
import type { ProjectOption } from "@/lib/queries";

const COLUMNS: TaskStatus[] = ["todo", "in_progress", "done"];
type Columns = Record<TaskStatus, TaskRow[]>;

function group(tasks: TaskRow[]): Columns {
  const cols: Columns = { todo: [], in_progress: [], done: [] };
  for (const task of [...tasks].sort((a, b) => a.position - b.position)) cols[task.status].push(task);
  return cols;
}

/** A position between the neighbours at `index` in `list` (which excludes the moved card). */
function positionAt(list: TaskRow[], index: number): number {
  const before = list[index - 1]?.position;
  const after = list[index]?.position;
  if (before !== undefined && after !== undefined) return (before + after) / 2;
  if (before !== undefined) return before + 1;
  if (after !== undefined) return after - 1;
  return Date.now() / 1000;
}

/**
 * Keyboard dragging: Left/Right jump to the neighbouring column, Up/Down
 * reorder within a column (dnd-kit's sortable default).
 */
const boardKeyboardCoordinates: KeyboardCoordinateGetter = (event, args) => {
  const { droppableRects, collisionRect } = args.context;
  if ((event.code === "ArrowRight" || event.code === "ArrowLeft") && collisionRect) {
    event.preventDefault();
    const rects = COLUMNS.map((c) => droppableRects.get(c));
    const centerX = collisionRect.left + collisionRect.width / 2;
    const current = rects.findIndex((r) => r && centerX >= r.left && centerX <= r.left + r.width);
    const target = rects[current + (event.code === "ArrowRight" ? 1 : -1)];
    if (current === -1 || !target) return args.currentCoordinates;
    return { x: target.left + (target.width - collisionRect.width) / 2, y: target.top + 48 };
  }
  return sortableKeyboardCoordinates(event, args);
};

function findColumn(cols: Columns, id: string): TaskStatus | undefined {
  if ((COLUMNS as string[]).includes(id)) return id as TaskStatus;
  return COLUMNS.find((c) => cols[c].some((t) => t.id === id));
}

export function TaskBoard({
  tasks,
  base,
  today,
  organizationId,
  projects,
  memberInitials,
}: {
  tasks: TaskRow[];
  base: string;
  today: string;
  organizationId: string;
  projects: ProjectOption[];
  memberInitials: Record<string, { initials: string; name: string }>;
}) {
  const t = useT();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [columns, setColumns] = useState<Columns>(() => group(tasks));
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dragOrigin, setDragOrigin] = useState<TaskStatus | null>(null);
  const [message, setMessage] = useState("");
  const statusId = useId();
  // stable id keeps dnd-kit's aria-describedby the same on server and client
  const dndId = useId();

  // Re-sync with the server whenever the task list changes underneath us.
  const signature = tasks.map((x) => `${x.id}:${x.status}:${x.position}:${x.title}:${x.due_date}`).join("|");
  const [lastSignature, setLastSignature] = useState(signature);
  if (signature !== lastSignature) {
    setLastSignature(signature);
    setColumns(group(tasks));
  }

  const label = (status: TaskStatus) => t(`status.${status}`);
  const titleOf = (id: string | number) =>
    COLUMNS.flatMap((c) => columns[c]).find((x) => x.id === String(id))?.title ?? lower(t("task"));

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: boardKeyboardCoordinates }),
  );

  const persist = (id: string, status: TaskStatus, position: number, announce: string) => {
    setMessage(announce);
    startTransition(async () => {
      const result = await moveTask({ id, status, position });
      if (!result.ok) {
        setMessage(result.message);
        setColumns(group(tasks));
      }
      router.refresh();
    });
  };

  /** Keyboard/button path: move a card to the end of another column. */
  const moveToColumn = (task: TaskRow, to: TaskStatus) => {
    const from = task.status;
    const target = columns[to];
    const position = positionAt(target, target.length);
    const moved = { ...task, status: to, position };
    setColumns((prev) => ({ ...prev, [from]: prev[from].filter((x) => x.id !== task.id), [to]: [...prev[to], moved] }));
    persist(task.id, to, position, `Moved “${task.title}” to ${label(to)}.`);
    // keep focus on the card's controls in its new column
    requestAnimationFrame(() => document.getElementById(`card-${task.id}`)?.focus());
  };

  const onDragStart = ({ active }: DragStartEvent) => {
    setActiveId(String(active.id));
    setDragOrigin(findColumn(columns, String(active.id)) ?? null);
  };

  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return;
    const from = findColumn(columns, String(active.id));
    const to = findColumn(columns, String(over.id));
    if (!from || !to || from === to) return;
    setColumns((prev) => {
      const moving = prev[from].find((x) => x.id === active.id);
      if (!moving) return prev;
      const overIndex = prev[to].findIndex((x) => x.id === over.id);
      const index = overIndex >= 0 ? overIndex : prev[to].length;
      const nextTo = [...prev[to]];
      nextTo.splice(index, 0, { ...moving, status: to });
      return { ...prev, [from]: prev[from].filter((x) => x.id !== active.id), [to]: nextTo };
    });
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const id = String(active.id);
    setActiveId(null);
    const column = findColumn(columns, id);
    if (!over || !column) {
      setColumns(group(tasks));
      return;
    }
    let list = columns[column];
    const oldIndex = list.findIndex((x) => x.id === id);
    const overIndex = list.findIndex((x) => x.id === over.id);
    if (overIndex >= 0 && overIndex !== oldIndex) list = arrayMove(list, oldIndex, overIndex);
    const index = list.findIndex((x) => x.id === id);
    const others = list.filter((x) => x.id !== id);
    const position = positionAt(others, index);
    const original = tasks.find((x) => x.id === id);
    list = list.map((x) => (x.id === id ? { ...x, status: column, position } : x));
    setColumns((prev) => ({ ...prev, [column]: list }));
    if (original && (original.status !== column || original.position !== position)) {
      persist(id, column, position, `Moved “${original.title}” to ${label(column)}.`);
    }
    setDragOrigin(null);
  };

  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up “${titleOf(active.id)}”. Use the arrow keys to move it, Space to drop, Escape to cancel.`,
    onDragOver: ({ active, over }) =>
      over ? `“${titleOf(active.id)}” is over ${label(findColumn(columns, String(over.id)) ?? "todo")}.` : `“${titleOf(active.id)}” is no longer over a column.`,
    onDragEnd: ({ active, over }) =>
      over ? `Dropped “${titleOf(active.id)}” in ${label(findColumn(columns, String(over.id)) ?? "todo")}.` : `Dropped “${titleOf(active.id)}”.`,
    onDragCancel: ({ active }) => `Cancelled. “${titleOf(active.id)}” is back in ${label(dragOrigin ?? "todo")}.`,
  };

  const activeTask = activeId ? COLUMNS.flatMap((c) => columns[c]).find((x) => x.id === activeId) : undefined;

  return (
    <div className="flex flex-col gap-3">
      <p id={statusId} role="status" aria-live="polite" className="sr-only">
        {message}
      </p>
      <p className="text-sm text-ink-muted">
        Drag cards between columns, or focus a card&apos;s handle and press Space, then the arrow keys. The arrow buttons on
        each card move it one column.
      </p>
      <DndContext
        id={dndId}
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={() => {
          setActiveId(null);
          setColumns(group(tasks));
        }}
        accessibility={{
          announcements,
          screenReaderInstructions: {
            draggable: "To pick up a card, press Space or Enter. Use the arrow keys to move it, then Space or Enter to drop it, or Escape to cancel.",
          },
        }}
      >
        <div className="grid gap-4 md:grid-cols-3">
          {COLUMNS.map((status, ci) => (
            <Column key={status} status={status} title={label(status)} count={columns[status].length}>
              {status === "todo" ? (
                <QuickAddTask organizationId={organizationId} projects={projects} compact idSuffix="board" status="todo" />
              ) : null}
              <SortableContext items={columns[status].map((x) => x.id)} strategy={verticalListSortingStrategy}>
                <ul className="flex min-h-16 flex-col gap-2" aria-label={`${label(status)}: ${columns[status].length}`}>
                  {columns[status].map((task) => (
                    <SortableCard
                      key={task.id}
                      task={task}
                      base={base}
                      today={today}
                      assignee={task.assignee_membership_id ? memberInitials[task.assignee_membership_id] : undefined}
                      prev={COLUMNS[ci - 1]}
                      next={COLUMNS[ci + 1]}
                      labelFor={label}
                      onMove={moveToColumn}
                    />
                  ))}
                </ul>
              </SortableContext>
              {columns[status].length === 0 ? (
                <p className="rounded-md border border-dashed border-rule px-3 py-4 text-center text-sm text-ink-muted">
                  Drop {lower(t("task", "other"))} here
                </p>
              ) : null}
            </Column>
          ))}
        </div>
        <DragOverlay>
          {activeTask ? (
            <div className="rounded-lg border border-ink bg-canvas p-3">
              <p className="font-semibold">{activeTask.title}</p>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function Column({ status, title, count, children }: { status: TaskStatus; title: string; count: number; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <section
      ref={setNodeRef}
      aria-labelledby={`col-${status}`}
      className={`flex flex-col gap-3 rounded-lg border p-3 transition-colors ${isOver ? "border-ink bg-tint" : "border-rule bg-panel/60"}`}
      data-column={status}
    >
      <h2 id={`col-${status}`} className="flex items-center gap-2 font-heading text-sm font-bold">
        <TaskStatusIcon status={status} />
        {title}
        <span className="ml-auto rounded-full border border-rule px-2 text-xs font-semibold tabular-nums">{count}</span>
      </h2>
      {children}
    </section>
  );
}

function SortableCard({
  task,
  base,
  today,
  assignee,
  prev,
  next,
  labelFor,
  onMove,
}: {
  task: TaskRow;
  base: string;
  today: string;
  assignee?: { initials: string; name: string };
  prev?: TaskStatus;
  next?: TaskStatus;
  labelFor: (s: TaskStatus) => string;
  onMove: (task: TaskRow, to: TaskStatus) => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  });
  const style = {
    transform: transform ? `translate3d(${Math.round(transform.x)}px, ${Math.round(transform.y)}px, 0)` : undefined,
    transition,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      data-task-id={task.id}
      className={`group rounded-lg border bg-canvas p-3 transition-[border-color,transform] hover:-translate-y-0.5 hover:border-ink-muted ${
        isDragging ? "border-dashed border-ink opacity-50" : "border-rule"
      }`}
    >
      <div className="flex items-start gap-2">
        <button
          ref={setActivatorNodeRef}
          id={`card-${task.id}`}
          type="button"
          className="-ml-1 mt-0.5 inline-flex size-6 shrink-0 cursor-grab touch-none items-center justify-center rounded text-ink-muted hover:bg-panel hover:text-ink active:cursor-grabbing"
          aria-label={`Drag “${task.title}”`}
          {...attributes}
          {...listeners}
        >
          <GripVertical aria-hidden className="size-4" />
        </button>
        <div className="min-w-0 flex-1">
          <Link
            href={`${base}/tasks/${task.id}`}
            className={`block font-semibold break-words hover:underline ${task.status === "done" ? "text-ink-muted line-through" : ""}`}
          >
            {task.title}
          </Link>
          {task.project ? (
            <p className="mt-1 flex items-center gap-1.5 truncate text-sm text-ink-muted">
              <ProjectDot color={task.project.color} />
              {task.project.name}
            </p>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <DueBadge dueDate={task.due_date} status={task.status} today={today} />
            {assignee ? (
              <span
                className="inline-flex size-6 items-center justify-center rounded-full border border-ink font-heading text-[0.6rem] font-bold"
                title={assignee.name}
              >
                <span aria-hidden>{assignee.initials}</span>
                <span className="sr-only">Assigned to {assignee.name}</span>
              </span>
            ) : null}
            <span className="ml-auto flex gap-1">
              {prev ? (
                <button
                  type="button"
                  onClick={() => onMove(task, prev)}
                  className="inline-flex size-7 items-center justify-center rounded border border-rule hover:border-ink"
                  aria-label={`Move “${task.title}” to ${labelFor(prev)}`}
                  title={`Move to ${labelFor(prev)}`}
                >
                  <ChevronLeft aria-hidden className="size-4" />
                </button>
              ) : null}
              {next ? (
                <button
                  type="button"
                  onClick={() => onMove(task, next)}
                  className="inline-flex size-7 items-center justify-center rounded border border-rule hover:border-ink"
                  aria-label={`Move “${task.title}” to ${labelFor(next)}`}
                  title={`Move to ${labelFor(next)}`}
                >
                  <ChevronRight aria-hidden className="size-4" />
                </button>
              ) : null}
            </span>
          </div>
        </div>
      </div>
    </li>
  );
}
