import Link from "next/link";
import { CalendarClock, Circle, CircleCheck, CircleDot, Clock, Flag, TriangleAlert, UserRoundX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/people/avatar";
import { dueState, formatRelativeDate } from "@/lib/dates";
import type { TaskPriority, TaskStatus } from "@/lib/queries";

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

/**
 * Priority as a flag plus its label, kept apart from status badges (D83):
 * critical is a filled red flag, high an outlined red-orange one, medium a
 * yellow flag with a dark outline, low an outlined blue one. The label is
 * always there, so it never rests on colour.
 */
const FLAG: Record<TaskPriority, { className: string; fill: string }> = {
  critical: { className: "text-prio-critical", fill: "currentColor" },
  high: { className: "text-prio-high", fill: "none" },
  medium: { className: "text-prio-medium-ink", fill: "var(--prio-medium)" },
  low: { className: "text-prio-low", fill: "none" },
};

export function PriorityFlag({ priority, label, compact = false }: { priority: TaskPriority; label: string; compact?: boolean }) {
  const flag = FLAG[priority];
  return (
    <span
      className={`inline-flex items-center gap-1 font-heading text-xs text-ink ${priority === "critical" ? "font-bold" : "font-semibold"}`}
      data-priority={priority}
    >
      <Flag aria-hidden className={`size-3.5 shrink-0 ${flag.className}`} fill={flag.fill} strokeWidth={2.25} />
      <span className={compact ? "sr-only" : undefined}>{label}</span>
      <span className="sr-only"> priority</span>
    </span>
  );
}

/** Everyone on a task as small stacked initials, then "+N" after three. */
export type StackPerson = { initials: string; name: string; photoUrl?: string | null; href?: string | null };

/** Who's on a task: up to three photos or initials, then "+N". Each links to their profile (D104). */
export function AssigneeStack({ people }: { people: StackPerson[] }) {
  if (people.length === 0) return null;
  const shown = people.slice(0, 3);
  const extra = people.length - shown.length;
  return (
    <span className="inline-flex items-center" title={people.map((p) => p.name).join(", ")}>
      <span className="sr-only">Assigned to {people.map((p) => p.name).join(", ")}</span>
      {shown.map((p, i) => {
        const face = <Avatar name={p.name} initials={p.initials} photoUrl={p.photoUrl ?? null} size="xs" />;
        const cls = `relative inline-flex rounded-full ${i > 0 ? "-ml-1.5" : ""}`;
        return p.href ? (
          <Link key={`${p.name}-${i}`} href={p.href} aria-label={`${p.name}'s profile`} className={`${cls} hover:z-10 hover:-translate-y-0.5`}>
            {face}
          </Link>
        ) : (
          <span key={`${p.name}-${i}`} aria-hidden className={cls}>
            {face}
          </span>
        );
      })}
      {extra > 0 ? (
        <span aria-hidden className="-ml-1.5 inline-flex h-6 min-w-6 items-center justify-center rounded-full border border-ink bg-panel px-1 font-heading text-[0.6rem] font-bold">
          +{extra}
        </span>
      ) : null}
    </span>
  );
}
