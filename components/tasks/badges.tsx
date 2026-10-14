import { CalendarClock, Circle, CircleCheck, CircleDot, Clock, TriangleAlert, UserRoundX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { dueState, formatRelativeDate } from "@/lib/dates";
import type { TaskStatus } from "@/lib/queries";

const STATUS_ICON = { todo: Circle, in_progress: CircleDot, done: CircleCheck } as const;

/** Status as icon + label: outlined to do, accent in progress, green when done. */
export function TaskStatusBadge({ status, label }: { status: TaskStatus; label: string }) {
  const Icon = STATUS_ICON[status];
  const variant = status === "done" ? "good" : status === "in_progress" ? "accent" : "outline";
  return (
    <Badge variant={variant} icon={<Icon aria-hidden className="size-3.5" />}>
      {label}
    </Badge>
  );
}

export function TaskStatusIcon({ status, className = "size-4" }: { status: TaskStatus; className?: string }) {
  const Icon = STATUS_ICON[status];
  return <Icon aria-hidden className={className} />;
}

/**
 * Due-date badge. Overdue is red with a dot, an icon and the word "Overdue"
 * (D83); due soon is amber with a clock; later dates are quiet.
 */
export function DueBadge({ dueDate, status, today }: { dueDate: string | null; status: TaskStatus; today: string }) {
  if (!dueDate) return null;
  const state = dueState(dueDate, status, today);
  const when = formatRelativeDate(dueDate, today);
  if (state === "overdue") {
    return (
      <Badge variant="bad" dot icon={<TriangleAlert aria-hidden className="size-3.5" />}>
        Overdue<span className="font-normal">· {when}</span>
      </Badge>
    );
  }
  if (state === "due_soon") {
    return (
      <Badge variant="warn" icon={<Clock aria-hidden className="size-3.5" />}>
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

/** Open work whose assignee left; shown until someone takes it over. */
export function NeedsAssigneeBadge() {
  return (
    <Badge variant="warn" icon={<UserRoundX aria-hidden className="size-3.5" />}>
      Needs assignee
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
