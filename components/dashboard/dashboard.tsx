"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import {
  Activity,
  CalendarDays,
  ChartNoAxesColumn,
  Check,
  Clock,
  Eye,
  EyeOff,
  GripVertical,
  LayoutGrid,
  Pin,
  Plus,
  RotateCcw,
  TriangleAlert,
  UserCheck,
} from "lucide-react";
import { saveDashboardLayout } from "@/app/[orgSlug]/dashboard/actions";
import { DEFAULT_LAYOUT, SIZE_CLASSES, type DashboardLayout, type WidgetId, type WidgetLayout, type WidgetSize } from "@/lib/dashboard-layout";
import { useT } from "@/lib/terminology/context";
import { lower } from "@/lib/terminology/t";
import { Button } from "@/components/ui/button";
import {
  DueSoonWidget,
  MyTasksWidget,
  OverdueWidget,
  PinnedDocumentsWidget,
  ProjectProgressWidget,
  QuickAddWidget,
  RecentActivityWidget,
  UpcomingEventsWidget,
  type DashboardData,
} from "./widgets";

type WidgetDef = { title: string; icon: ReactNode; render: (data: DashboardData) => ReactNode };

function useWidgetDefs(): Record<WidgetId, WidgetDef> {
  const t = useT();
  const icon = (I: typeof Clock) => <I aria-hidden className="size-4" />;
  return {
    overdue: { title: "Overdue", icon: icon(TriangleAlert), render: (d) => <OverdueWidget data={d} /> },
    due_soon: { title: "Due in 7 days", icon: icon(Clock), render: (d) => <DueSoonWidget data={d} /> },
    my_tasks: { title: `My ${lower(t("task", "other"))}`, icon: icon(UserCheck), render: (d) => <MyTasksWidget data={d} /> },
    project_progress: {
      title: `${t("project")} progress`,
      icon: icon(ChartNoAxesColumn),
      render: (d) => <ProjectProgressWidget data={d} />,
    },
    upcoming_events: {
      title: `Upcoming ${lower(t("event", "other"))}`,
      icon: icon(CalendarDays),
      render: (d) => <UpcomingEventsWidget data={d} />,
    },
    recent_activity: { title: "Recent activity", icon: icon(Activity), render: (d) => <RecentActivityWidget data={d} /> },
    pinned_documents: {
      title: `Pinned ${lower(t("document", "other"))}`,
      icon: icon(Pin),
      render: (d) => <PinnedDocumentsWidget data={d} />,
    },
    quick_add: { title: "Quick add", icon: icon(Plus), render: (d) => <QuickAddWidget data={d} /> },
  };
}

type SaveState = "idle" | "saving" | "saved" | "error";

export function Dashboard({ data, initialLayout }: { data: DashboardData; initialLayout: DashboardLayout }) {
  const defs = useWidgetDefs();
  const [layout, setLayout] = useState<DashboardLayout>(initialLayout);
  const [editing, setEditing] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveMessage, setSaveMessage] = useState("");
  const [settling, setSettling] = useState<string | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  // stable id keeps dnd-kit's aria-describedby the same on server and client
  const dndId = useId();

  // Saves run one at a time, in order, so the last change always wins.
  const persist = useCallback(
    (next: DashboardLayout) => {
      setSaveState("saving");
      queue.current = queue.current.then(async () => {
        const result = await saveDashboardLayout(data.organizationId, next);
        setSaveState(result.ok ? "saved" : "error");
        setSaveMessage(result.ok ? "Layout saved." : result.message);
      });
    },
    [data.organizationId],
  );

  const update = (next: DashboardLayout) => {
    setLayout(next);
    persist(next);
  };

  const setWidget = (id: WidgetId, patch: Partial<WidgetLayout>) =>
    update({ ...layout, widgets: layout.widgets.map((w) => (w.id === id ? { ...w, ...patch } : w)) });

  useEffect(() => {
    if (!settling) return;
    const timer = window.setTimeout(() => setSettling(null), 450);
    return () => window.clearTimeout(timer);
  }, [settling]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const visible = layout.widgets.filter((w) => !w.hidden);
  const hidden = layout.widgets.filter((w) => w.hidden);
  const titleOf = (id: string | number) => defs[id as WidgetId]?.title ?? "widget";
  const positionOf = (id: string | number) => visible.findIndex((w) => w.id === id) + 1;

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) {
      setSettling(String(active.id));
      return;
    }
    const from = layout.widgets.findIndex((w) => w.id === active.id);
    const to = layout.widgets.findIndex((w) => w.id === over.id);
    update({ ...layout, widgets: arrayMove(layout.widgets, from, to) });
    setSettling(String(active.id));
  };

  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${titleOf(active.id)}, position ${positionOf(active.id)} of ${visible.length}.`,
    onDragOver: ({ active, over }) => (over ? `${titleOf(active.id)} is over position ${positionOf(over.id)}.` : `${titleOf(active.id)} is not over a position.`),
    onDragEnd: ({ active, over }) => (over ? `Dropped ${titleOf(active.id)} at position ${positionOf(over.id)}.` : `Dropped ${titleOf(active.id)}.`),
    onDragCancel: ({ active }) => `Cancelled moving ${titleOf(active.id)}.`,
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <p role="status" aria-live="polite" className="mr-auto text-sm text-ink-muted">
          {saveState === "saving" ? "Saving layout…" : saveState === "idle" ? "" : saveMessage}
        </p>
        {editing ? (
          <Button variant="ghost" onClick={() => update(DEFAULT_LAYOUT)}>
            <RotateCcw aria-hidden className="size-4" />
            Reset layout
          </Button>
        ) : null}
        <Button variant={editing ? "primary" : "secondary"} aria-pressed={editing} onClick={() => setEditing((e) => !e)}>
          {editing ? <Check aria-hidden className="size-4" /> : <LayoutGrid aria-hidden className="size-4" />}
          {editing ? "Done" : "Customize"}
        </Button>
      </div>

      {editing ? (
        <p id="customize-help" className="border-l-4 border-ink pl-3 text-sm">
          Drag a widget by its handle to reorder. With a keyboard, focus a handle, press Space, use the arrow keys, then
          Space again to drop. Choose S, M or L to resize, or hide widgets you don&apos;t need. Changes save as you go.
        </p>
      ) : null}

      <DndContext
        id={dndId}
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
        accessibility={{
          announcements,
          screenReaderInstructions: {
            draggable: "To pick up a widget, press Space or Enter. Use the arrow keys to move it, Space or Enter to drop, Escape to cancel.",
          },
        }}
      >
        <SortableContext items={visible.map((w) => w.id)} strategy={rectSortingStrategy}>
          <ol className="grid grid-cols-1 gap-4 md:grid-cols-12" aria-label="Dashboard widgets">
            {visible.map((w, i) => (
              <SortableWidget
                key={w.id}
                widget={w}
                index={i}
                def={defs[w.id]}
                editing={editing}
                settling={settling === w.id}
                onSize={(size) => setWidget(w.id, { size })}
                onHide={() => setWidget(w.id, { hidden: true })}
              >
                {defs[w.id].render(data)}
              </SortableWidget>
            ))}
          </ol>
        </SortableContext>
      </DndContext>

      {editing && hidden.length > 0 ? (
        <section aria-labelledby="hidden-widgets" className="border-t border-dashed border-rule pt-4">
          <h2 id="hidden-widgets" className="font-heading text-sm font-bold">
            Hidden widgets
          </h2>
          <ul className="mt-2 flex flex-wrap gap-2">
            {hidden.map((w) => (
              <li key={w.id}>
                <Button variant="secondary" size="sm" onClick={() => setWidget(w.id, { hidden: false })}>
                  <Eye aria-hidden className="size-4" />
                  Show {defs[w.id].title}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function SortableWidget({
  widget,
  index,
  def,
  editing,
  settling,
  onSize,
  onHide,
  children,
}: {
  widget: WidgetLayout;
  index: number;
  def: WidgetDef;
  editing: boolean;
  settling: boolean;
  onSize: (size: WidgetSize) => void;
  onHide: () => void;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: widget.id,
    disabled: !editing,
  });
  const headingId = `widget-${widget.id}`;
  const style = {
    "--i": index,
    transform: transform ? `translate3d(${Math.round(transform.x)}px, ${Math.round(transform.y)}px, 0)` : undefined,
    transition,
    zIndex: isDragging ? 10 : undefined,
  } as React.CSSProperties;

  return (
    <li
      ref={setNodeRef}
      style={style}
      data-widget={widget.id}
      className={`col-span-1 ${SIZE_CLASSES[widget.size]} ${isDragging ? "" : "widget-enter"} ${settling ? "widget-settle" : ""}`}
    >
      <section
        aria-labelledby={headingId}
        className={`flex h-full flex-col rounded-lg border bg-canvas ${
          isDragging ? "border-dashed border-ink" : editing ? "border-ink-muted" : "widget-lift border-rule"
        }`}
      >
        <header className="flex flex-wrap items-center gap-2 border-b border-rule px-4 py-2.5">
          {editing ? (
            <button
              ref={setActivatorNodeRef}
              type="button"
              className="-ml-1 inline-flex size-7 cursor-grab touch-none items-center justify-center rounded hover:bg-panel active:cursor-grabbing"
              aria-label={`Move ${def.title}`}
              {...attributes}
              {...listeners}
            >
              <GripVertical aria-hidden className="size-4" />
            </button>
          ) : null}
          <h2 id={headingId} className="flex items-center gap-2 font-heading text-base font-bold">
            {def.icon}
            {def.title}
          </h2>
          {editing ? (
            <div className="ml-auto flex items-center gap-2">
              <fieldset className="flex rounded-md border border-rule">
                <legend className="sr-only">Size of {def.title}</legend>
                {(["s", "m", "l"] as const).map((size) => (
                  <label key={size} className="cursor-pointer">
                    <input
                      type="radio"
                      name={`size-${widget.id}`}
                      value={size}
                      checked={widget.size === size}
                      onChange={() => onSize(size)}
                      className="peer sr-only"
                    />
                    <span className="sr-only">{{ s: "Small", m: "Medium", l: "Large" }[size]}</span>
                    <span
                      aria-hidden
                      className="block px-2 py-0.5 font-heading text-xs font-bold peer-checked:bg-primary peer-checked:text-on-primary peer-focus-visible:outline-2 peer-focus-visible:outline-ink"
                    >
                      {size.toUpperCase()}
                    </span>
                  </label>
                ))}
              </fieldset>
              <button
                type="button"
                onClick={onHide}
                className="inline-flex size-7 items-center justify-center rounded border border-rule hover:border-ink"
                aria-label={`Hide ${def.title}`}
                title="Hide"
              >
                <EyeOff aria-hidden className="size-4" />
              </button>
            </div>
          ) : null}
        </header>
        <div className={`flex-1 px-4 py-3 ${editing ? "pointer-events-none opacity-70 select-none" : ""}`} inert={editing}>
          {children}
        </div>
      </section>
    </li>
  );
}
