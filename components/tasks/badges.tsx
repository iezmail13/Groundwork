import { CalendarClock, Circle, CircleCheck, CircleDot, Clock, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { dueState, formatRelativeDate } from "@/lib/dates";
import type { TaskStatus } from "@/lib/queries";

const STATUS_ICON = { todo: Circle, in_progress: CircleDot, done: CircleCheck } as const;

/** Status as icon + label: outlined for open work, quiet for done. */
export function TaskStatusBadge({ status, label }: { status: TaskStatus; label: string }) {
  const Icon = STATUS_ICON[status];
  return (
    <Badge variant={status === "done" ? "quiet" : "outline"} icon={<Icon aria-hidden className="size-3.5" />}>
      {label}
    </Badge>
  );
}

export function TaskStatusIcon({ status, className = "size-4" }: { status: TaskStatus; className?: string }) {
  const Icon = STATUS_ICON[status];
  return <Icon aria-hidden className={className} />;
}

/**
 * Due-date badge. Overdue is a filled navy badge with an icon and the word
 * "Overdue"; due soon is outlined with a clock; later dates are quiet.
 */
export function DueBadge({ dueDate, status, today }: { dueDate: string | null; status: TaskStatus; today: string }) {
  if (!dueDate) return null;
  const state = dueState(dueDate, status, today);
  const when = formatRelativeDate(dueDate, today);
  if (state === "overdue") {
    return (
      <Badge variant="filled" icon={<TriangleAlert aria-hidden className="size-3.5" />}>
        Overdue<span className="font-normal">· {when}</span>
      </Badge>
    );
  }
  if (state === "due_soon") {
    return (
      <Badge variant="outline" icon={<Clock aria-hidden className="size-3.5" />}>
        <span className="sr-only">Due soon: </span>
        {when}
      </Badge>
    );
  }
  return (
    <Badge variant="quiet" icon={<CalendarClock aria-hidden className="size-3.5" />}>
      <span className="sr-only">Due </span>
      {when}
    </Badge>
  );
}

export function ProjectDot({ color }: { color: string | null }) {
  return (
    <span
      aria-hidden
      className="inline-block size-2.5 shrink-0 rounded-full border border-ink/30"
      style={{ background: color ?? "var(--ink)" }}
    />
  );
}
