"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
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
  type CollisionDetection,
  type KeyboardCoordinateGetter,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CircleCheck, CircleDot, TriangleAlert } from "lucide-react";
import { moveTaskToStep } from "@/app/[orgSlug]/tasks/workflow-actions";
import { useT } from "@/lib/terminology/context";
import { lower } from "@/lib/terminology/t";
import type { ProjectOption, TaskRow } from "@/lib/queries";
import type { WorkflowStep } from "@/lib/workflows";
import type { StackPerson } from "./badges";
import { BoardCard } from "./task-board";
import { QuickAddTask } from "./quick-add";

const DONE_SHOWN = 15;

type Columns = Record<string, TaskRow[]>;

function arrange(steps: WorkflowStep[], tasks: TaskRow[]): Columns {
  const firstOpen = steps.find((s) => s.kind === "open")?.id;
  const firstDone = steps.find((s) => s.kind === "done")?.id;
  const cols: Columns = Object.fromEntries(
    steps.map((s) => [s.id, [] as TaskRow[]]),
  );
  for (const t of tasks) {
    // work without a step yet sits at the start (or the end, if it's done)
    const id =
      t.step_id && cols[t.step_id]
        ? t.step_id
        : t.status === "done"
          ? firstDone
          : firstOpen;
    if (id) cols[id]!.push(t);
  }
  for (const s of steps) {
    cols[s.id] =
      s.kind === "done"
        ? cols[s.id]!.sort((a, b) =>
            (b.completed_at ?? "").localeCompare(a.completed_at ?? ""),
          )
        : cols[s.id]!.sort((a, b) => a.position - b.position);
  }
  return cols;
}

function positionAt(list: TaskRow[], index: number): number {
  const before = list[index - 1]?.position;
  const after = list[index]?.position;
  if (before !== undefined && after !== undefined) return (before + after) / 2;
  if (before !== undefined) return before + 1;
  if (after !== undefined) return after - 1;
  return Date.now() / 1000;
}

/**
 * A program's own workflow (D107): one column per step, in order. Cards move
 * between steps by dragging, with the keyboard (focus a card's handle, Space,
 * then the arrow keys), or with the step menu on each card. Moving into a
 * done step finishes the work; moving out reopens it.
 */
export function WorkflowBoard({
  steps,
  tasks,
  base,
  today,
  organizationId,
  projects,
  projectId,
  memberInitials,
}: {
  steps: WorkflowStep[];
  tasks: TaskRow[];
  base: string;
  today: string;
  organizationId: string;
  projects: ProjectOption[];
  projectId: string;
  memberInitials: Record<string, StackPerson>;
}) {
  const t = useT();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const dndId = useId();

  const signature = tasks
    .map((x) => `${x.id}:${x.step_id}:${x.position}:${x.status}`)
    .join("|");
  const [lastSignature, setLastSignature] = useState(signature);
  const [cols, setCols] = useState<Columns>(() => arrange(steps, tasks));
  if (signature !== lastSignature) {
    setLastSignature(signature);
    setCols(arrange(steps, tasks));
  }

  const stepOf = (taskId: string) =>
    Object.keys(cols).find((k) => cols[k]!.some((x) => x.id === taskId));
  const titleOf = (id: string | number) =>
    tasks.find((x) => x.id === String(id))?.title ?? lower(t("task"));
  const stepName = (id: string | undefined) =>
    steps.find((s) => s.id === id)?.name ?? "";
  // Left and Right move a carried card exactly one step; Up and Down reorder it within its step
  const latest = useRef({ cols, steps });
  useEffect(() => {
    latest.current = { cols, steps };
  });
  const [coordinateGetter] = useState(() => {
    const getter: KeyboardCoordinateGetter = (event, args) => {
      if (event.code !== "ArrowRight" && event.code !== "ArrowLeft")
        return sortableKeyboardCoordinates(event, args);
      event.preventDefault();
      const { cols: now, steps: order } = latest.current;
      const activeId = String(args.context.active?.id ?? "");
      const here = order.findIndex((st) =>
        now[st.id]?.some((x) => x.id === activeId),
      );
      const next = order[here + (event.code === "ArrowRight" ? 1 : -1)];
      const rect = next ? args.context.droppableRects.get(next.id) : undefined;
      if (!rect) return args.currentCoordinates;
      // the carried card's top-left corner, just inside the next column
      return { x: rect.left + 8, y: rect.top + 8 };
    };
    return getter;
  });
  // the column under the card (by its horizontal position) decides the step;
  // within it, the closest card decides the place
  const [collision] = useState(() => {
    const detect: CollisionDetection = (args) => {
      const { cols: now, steps: order } = latest.current;
      const x =
        args.pointerCoordinates?.x ??
        args.collisionRect.left + Math.min(24, args.collisionRect.width / 2);
      const column = order.find((st) => {
        const r = args.droppableRects.get(st.id);
        return r && x >= r.left && x <= r.right;
      });
      if (!column) return closestCorners(args);
      const inside = new Set<string>([
        column.id,
        ...(now[column.id] ?? []).map((t) => t.id),
      ]);
      const hits = closestCorners({
        ...args,
        droppableContainers: args.droppableContainers.filter((c) =>
          inside.has(String(c.id)),
        ),
      });
      return hits.length ? hits : [{ id: column.id }];
    };
    return detect;
  });
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter }),
  );

  const move = (taskId: string, toStep: string, index?: number) => {
    const from = stepOf(taskId);
    if (!from) return;
    const card = cols[from]!.find((x) => x.id === taskId)!;
    const target = cols[toStep]!.filter((x) => x.id !== taskId);
    const at = index ?? target.length;
    const position = positionAt(target, at);
    const next = {
      ...cols,
      [from]: cols[from]!.filter((x) => x.id !== taskId),
    };
    next[toStep] = [
      ...target.slice(0, at),
      { ...card, step_id: toStep, position },
      ...target.slice(at),
    ];
    setCols(next);
    setMessage(
      from === toStep
        ? `Moved “${card.title}” within ${stepName(toStep)}.`
        : `Moved “${card.title}” to ${stepName(toStep)}.`,
    );
    startTransition(async () => {
      const result = await moveTaskToStep({ taskId, stepId: toStep, position });
      if (!result.ok) {
        setMessage(result.message);
        setCols(arrange(steps, tasks));
      }
      router.refresh();
    });
  };

  // where a drop lands: over a card (its place) or over a column (its end)
  const targetOf = (overId: string) => {
    if (cols[overId]) return { step: overId, index: cols[overId]!.length };
    const step = stepOf(overId);
    return step
      ? { step, index: cols[step]!.findIndex((x) => x.id === overId) }
      : null;
  };

  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return;
    const from = stepOf(String(active.id));
    const to = targetOf(String(over.id));
    if (!from || !to || from === to.step) return;
    // show the card in its new column while it's carried
    const card = cols[from]!.find((x) => x.id === active.id)!;
    setCols({
      ...cols,
      [from]: cols[from]!.filter((x) => x.id !== active.id),
      [to.step]: [
        ...cols[to.step]!.slice(0, to.index),
        card,
        ...cols[to.step]!.slice(to.index),
      ],
    });
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveId(null);
    if (!over) {
      setCols(arrange(steps, tasks));
      return;
    }
    const to = targetOf(String(over.id));
    if (!to) return;
    const original = tasks.find((x) => x.id === active.id);
    const sameSpot =
      original?.step_id === to.step && String(over.id) === String(active.id);
    if (sameSpot) return;
    move(String(active.id), to.step, Math.max(0, to.index));
  };

  const announcements: Announcements = {
    onDragStart: ({ active }) =>
      `Picked up “${titleOf(active.id)}” in ${stepName(stepOf(String(active.id)))}. Use the arrow keys to move it between steps, Space to drop, Escape to cancel.`,
    onDragOver: ({ active, over }) =>
      over
        ? `“${titleOf(active.id)}” is over ${stepName(targetOf(String(over.id))?.step)}.`
        : `“${titleOf(active.id)}” is not over a step.`,
    onDragEnd: ({ active, over }) =>
      over
        ? `Dropped “${titleOf(active.id)}” in ${stepName(targetOf(String(over.id))?.step)}.`
        : `Dropped “${titleOf(active.id)}”.`,
    onDragCancel: ({ active }) =>
      `Cancelled. “${titleOf(active.id)}” is back where it was.`,
  };

  const active = activeId ? tasks.find((x) => x.id === activeId) : undefined;
  const stepChoices = useMemo(
    () => steps.map((s) => ({ id: s.id, name: s.name })),
    [steps],
  );

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-ink-muted">
        Drag a card to another step, or focus its handle and press Space then
        the arrow keys. Each card&apos;s step menu moves it too. Moving a card
        into a done step finishes the {lower(t("task"))}.
      </p>
      <p role="status" aria-live="polite" className="sr-only">
        {message}
      </p>
      <DndContext
        id={dndId}
        sensors={sensors}
        collisionDetection={collision}
        onDragStart={({ active: a }) => setActiveId(String(a.id))}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={() => {
          setActiveId(null);
          setCols(arrange(steps, tasks));
        }}
        accessibility={{
          announcements,
          screenReaderInstructions: {
            draggable:
              "To pick up a card, press Space or Enter. Use the arrow keys to move it within a step or to the next one, then Space or Enter to drop it, or Escape to cancel.",
          },
        }}
      >
        <div className="flex gap-3 overflow-x-auto pb-2" data-workflow-board>
          {steps.map((step, i) => (
            <StepColumn
              key={step.id}
              step={step}
              tasks={
                step.kind === "done"
                  ? cols[step.id]!.slice(0, DONE_SHOWN)
                  : cols[step.id]!
              }
              total={cols[step.id]!.length}
              base={base}
              today={today}
              memberInitials={memberInitials}
              steps={stepChoices}
              onMove={(taskId, stepId) => move(taskId, stepId)}
            >
              {i === 0 ? (
                <QuickAddTask
                  organizationId={organizationId}
                  projects={projects}
                  compact
                  idSuffix="workflow"
                  status="todo"
                  projectId={projectId}
                />
              ) : null}
            </StepColumn>
          ))}
        </div>
        <DragOverlay>
          {active ? (
            <div className="rounded-lg border border-ink bg-canvas p-3">
              <p className="font-semibold">{active.title}</p>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
      {steps.some(
        (s) => s.kind === "done" && cols[s.id]!.length > DONE_SHOWN,
      ) ? (
        <Link
          href={`${base}/tasks?view=list&project=${projectId}&status=done`}
          className="self-start text-sm font-semibold text-accent hover:underline"
        >
          See all finished work
        </Link>
      ) : null}
    </div>
  );
}

function StepColumn({
  step,
  tasks,
  total,
  base,
  today,
  memberInitials,
  steps,
  onMove,
  children,
}: {
  step: WorkflowStep;
  tasks: TaskRow[];
  total: number;
  base: string;
  today: string;
  memberInitials: Record<string, StackPerson>;
  steps: { id: string; name: string }[];
  onMove: (taskId: string, stepId: string) => void;
  children?: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: step.id });
  const over =
    step.wip_limit !== null && step.kind === "open" && total > step.wip_limit;
  const headingId = `step-${step.id}`;
  return (
    <section
      ref={setNodeRef}
      aria-labelledby={headingId}
      data-step={step.name}
      className={`flex w-72 shrink-0 flex-col gap-3 rounded-lg border bg-panel/60 p-3 ${isOver ? "border-ink" : "border-rule"} ${
        over ? "border-t-4 border-t-warn" : ""
      }`}
    >
      <h2
        id={headingId}
        className="flex items-center gap-2 font-heading text-sm font-bold"
      >
        {step.kind === "done" ? (
          <CircleCheck aria-hidden className="size-4 text-good" />
        ) : (
          <CircleDot aria-hidden className="size-4 text-accent" />
        )}
        <span className="min-w-0 truncate">{step.name}</span>
        {step.kind === "done" ? (
          <span className="sr-only">(done step)</span>
        ) : null}
        <span className="ml-auto rounded-full border border-rule px-2 text-xs font-semibold tabular-nums">
          {step.wip_limit !== null && step.kind === "open"
            ? `${total} / ${step.wip_limit}`
            : total}
          <span className="sr-only">
            {" "}
            cards
            {step.wip_limit !== null && step.kind === "open"
              ? `, limit ${step.wip_limit}`
              : ""}
          </span>
        </span>
      </h2>
      {over ? (
        <p className="flex items-center gap-1.5 text-xs font-semibold text-warn-ink">
          <TriangleAlert aria-hidden className="size-3.5" />
          Over its limit of {step.wip_limit}
        </p>
      ) : null}
      {children}
      <SortableContext
        items={tasks.map((x) => x.id)}
        strategy={verticalListSortingStrategy}
      >
        <ul
          className="flex min-h-16 flex-col gap-2"
          aria-label={`${step.name}: ${total}`}
        >
          {tasks.map((task) => (
            <BoardCard
              key={task.id}
              task={task}
              base={base}
              today={today}
              memberInitials={memberInitials}
              sortable
              handleLabel={`Move “${task.title}”`}
              footer={
                <label className="mt-2 flex items-center gap-1.5 text-xs text-ink-muted">
                  <span>Step</span>
                  <select
                    value={step.id}
                    onChange={(e) => onMove(task.id, e.target.value)}
                    aria-label={`Step for “${task.title}”`}
                    className="rounded border border-rule bg-canvas px-1.5 py-0.5 text-xs text-ink"
                  >
                    {steps.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
              }
            />
          ))}
        </ul>
      </SortableContext>
      {total === 0 ? (
        <p className="rounded-md border border-dashed border-rule px-3 py-4 text-center text-sm text-ink-muted">
          Drop a card here.
        </p>
      ) : null}
    </section>
  );
}
