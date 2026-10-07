"use client";

import Link from "next/link";
import { useState } from "react";
import { CalendarDays, Download, MapPin } from "lucide-react";
import { useT } from "@/lib/terminology/context";
import { lower } from "@/lib/terminology/t";
import { DueBadge, ProjectDot } from "@/components/tasks/badges";
import { TaskCheckbox } from "@/components/tasks/task-checkbox";
import { QuickAddTask } from "@/components/tasks/quick-add";
import { ProgressBar } from "@/components/projects/progress";
import { FileIcon, formatBytes } from "@/components/documents/file-icon";
import type { ProjectOption, TaskStatus } from "@/lib/queries";

export type TaskLite = {
  id: string;
  title: string;
  status: TaskStatus;
  due_date: string | null;
  project: { name: string; color: string | null } | null;
  href: string;
};

export type DashboardData = {
  organizationId: string;
  base: string;
  today: string;
  overdue: TaskLite[];
  dueSoon: TaskLite[];
  myTasks: TaskLite[];
  projects: { id: string; name: string; color: string | null; done: number; total: number }[];
  events: { id: string; title: string; day: string; time: string; location: string | null }[];
  activity: { id: string; actor: string; sentence: string; label: string | null; href: string | null; ago: string }[];
  pinned: { id: string; name: string; mime: string; size: number }[];
  projectOptions: ProjectOption[];
};

/** A number that counts up from zero (CSS only); the real value is in the text. */
export function CountUp({ value, className = "" }: { value: number; className?: string }) {
  return (
    <span className={className}>
      <span aria-hidden className="count-up" style={{ "--to": value } as React.CSSProperties} />
      <span className="sr-only">{value}</span>
    </span>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-4 text-sm text-ink-muted">{children}</p>;
}

function TaskLines({ tasks, today, max = 5 }: { tasks: TaskLite[]; today: string; max?: number }) {
  return (
    <ul className="divide-y divide-rule">
      {tasks.slice(0, max).map((task) => (
        <li key={task.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-2">
          <Link href={task.href} className="min-w-0 flex-1 truncate font-semibold hover:underline">
            {task.title}
          </Link>
          <DueBadge dueDate={task.due_date} status={task.status} today={today} />
        </li>
      ))}
    </ul>
  );
}

export function OverdueWidget({ data }: { data: DashboardData }) {
  const t = useT();
  const n = data.overdue.length;
  return (
    <div className="flex flex-col gap-2">
      <p className="flex items-baseline gap-2">
        <CountUp value={n} className="font-heading text-4xl font-extrabold" />
        <span className="text-ink-muted">{lower(n === 1 ? t("task") : t("task", "other"))} past due</span>
      </p>
      {n ? (
        <>
          <TaskLines tasks={data.overdue} today={data.today} />
          <Link href={`${data.base}/tasks?view=list&due=overdue`} className="text-sm font-semibold underline underline-offset-4">
            See all overdue
          </Link>
        </>
      ) : (
        <Empty>Nothing overdue. Nice work.</Empty>
      )}
    </div>
  );
}

export function DueSoonWidget({ data }: { data: DashboardData }) {
  const t = useT();
  const n = data.dueSoon.length;
  return (
    <div className="flex flex-col gap-2">
      <p className="flex items-baseline gap-2">
        <CountUp value={n} className="font-heading text-4xl font-extrabold" />
        <span className="text-ink-muted">due in the next 7 days</span>
      </p>
      {n ? (
        <>
          <TaskLines tasks={data.dueSoon} today={data.today} />
          <Link href={`${data.base}/tasks?view=list&due=week`} className="text-sm font-semibold underline underline-offset-4">
            See the week
          </Link>
        </>
      ) : (
        <Empty>No {lower(t("task", "other"))} due this week.</Empty>
      )}
    </div>
  );
}

export function MyTasksWidget({ data }: { data: DashboardData }) {
  const t = useT();
  const [tasks, setTasks] = useState(data.myTasks);
  const [completing, setCompleting] = useState<Set<string>>(new Set());

  // pick up server changes (e.g. after a refresh) without losing in-flight animations
  const signature = data.myTasks.map((x) => x.id).join(",");
  const [lastSignature, setLastSignature] = useState(signature);
  if (signature !== lastSignature) {
    setLastSignature(signature);
    setTasks(data.myTasks);
  }

  const remove = (id: string) => {
    setTasks((list) => list.filter((x) => x.id !== id));
    setCompleting((set) => {
      const next = new Set(set);
      next.delete(id);
      return next;
    });
  };

  const start = (id: string) => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      remove(id);
      return;
    }
    setCompleting((set) => new Set(set).add(id));
  };

  if (tasks.length === 0) {
    return <Empty>Nothing assigned to you is open. Pick something up from the {lower(t("task", "other"))} board.</Empty>;
  }

  return (
    <ul className="divide-y divide-rule" aria-label={`My open ${lower(t("task", "other"))}`}>
      {tasks.slice(0, 8).map((task) => (
        <li
          key={task.id}
          className={`flex items-center gap-3 py-2 ${completing.has(task.id) ? "task-completing" : ""}`}
          onAnimationEnd={(e) => {
            if (e.animationName === "slide-out") remove(task.id);
          }}
        >
          <TaskCheckbox id={task.id} title={task.title} done={false} onCompleteStart={() => start(task.id)} />
          <div className="min-w-0 flex-1">
            <Link href={task.href} className="task-title inline font-semibold hover:underline">
              {task.title}
            </Link>
            {task.project ? (
              <p className="flex items-center gap-1.5 truncate text-sm text-ink-muted">
                <ProjectDot color={task.project.color} />
                {task.project.name}
              </p>
            ) : null}
          </div>
          <DueBadge dueDate={task.due_date} status={task.status} today={data.today} />
        </li>
      ))}
    </ul>
  );
}

export function ProjectProgressWidget({ data }: { data: DashboardData }) {
  const t = useT();
  if (data.projects.length === 0) {
    return <Empty>No active {lower(t("project", "other"))}.</Empty>;
  }
  return (
    <ul className="flex flex-col gap-3">
      {data.projects.slice(0, 6).map((p) => (
        <li key={p.id} className="flex flex-col gap-1">
          <Link href={`${data.base}/projects/${p.id}`} className="flex items-center gap-2 font-semibold hover:underline">
            <ProjectDot color={p.color} />
            <span className="truncate">{p.name}</span>
          </Link>
          <ProgressBar done={p.done} total={p.total} label={`${p.name} progress`} />
        </li>
      ))}
    </ul>
  );
}

export function UpcomingEventsWidget({ data }: { data: DashboardData }) {
  const t = useT();
  if (data.events.length === 0) {
    return (
      <Empty>
        Nothing scheduled in the next two weeks.{" "}
        <Link href={`${data.base}/calendar`} className="underline underline-offset-4">
          Open the calendar
        </Link>
        .
      </Empty>
    );
  }
  return (
    <ul className="divide-y divide-rule">
      {data.events.map((e) => (
        <li key={e.id} className="flex gap-3 py-2">
          <div className="w-20 shrink-0 font-heading text-sm">
            <span className="block font-bold">{e.day}</span>
            <span className="text-ink-muted">{e.time}</span>
          </div>
          <div className="min-w-0">
            <p className="font-semibold">{e.title}</p>
            {e.location ? (
              <p className="flex items-center gap-1 text-sm text-ink-muted">
                <MapPin aria-hidden className="size-3.5" />
                {e.location}
              </p>
            ) : null}
          </div>
        </li>
      ))}
      <li className="pt-2">
        <Link href={`${data.base}/calendar?view=agenda`} className="inline-flex items-center gap-1 text-sm font-semibold underline underline-offset-4">
          <CalendarDays aria-hidden className="size-4" />
          All {lower(t("event", "other"))}
        </Link>
      </li>
    </ul>
  );
}

export function RecentActivityWidget({ data }: { data: DashboardData }) {
  if (data.activity.length === 0) return <Empty>Changes your team makes show up here.</Empty>;
  return (
    <ol className="divide-y divide-rule">
      {data.activity.map((a) => (
        <li key={a.id} className="py-2 text-sm">
          <span className="font-semibold">{a.actor}</span> {a.sentence}
          {a.label ? (
            <>
              {" "}
              {a.href ? (
                <Link href={a.href} className="font-semibold underline-offset-4 hover:underline">
                  “{a.label}”
                </Link>
              ) : (
                <span className="font-semibold">“{a.label}”</span>
              )}
            </>
          ) : null}
          <span className="block text-ink-muted">{a.ago}</span>
        </li>
      ))}
    </ol>
  );
}

export function PinnedDocumentsWidget({ data }: { data: DashboardData }) {
  const t = useT();
  if (data.pinned.length === 0) {
    return (
      <Empty>
        Pin the {lower(t("document", "other"))} people reach for most from the{" "}
        <Link href={`${data.base}/documents`} className="underline underline-offset-4">
          {lower(t("document", "other"))} page
        </Link>{" "}
        and they&apos;ll appear here.
      </Empty>
    );
  }
  return (
    <ul className="grid gap-x-6 sm:grid-cols-2">
      {data.pinned.map((d) => (
        <li key={d.id} className="flex items-center gap-3 border-b border-rule py-2">
          <FileIcon mime={d.mime} />
          <a href={`${data.base}/documents/${d.id}/download`} className="min-w-0 flex-1 truncate font-semibold hover:underline">
            {d.name}
          </a>
          <span className="text-sm text-ink-muted">{formatBytes(d.size)}</span>
          <Download aria-hidden className="size-4 text-ink-muted" />
        </li>
      ))}
    </ul>
  );
}

export function QuickAddWidget({ data }: { data: DashboardData }) {
  return <QuickAddTask organizationId={data.organizationId} projects={data.projectOptions} compact idSuffix="dashboard" />;
}
