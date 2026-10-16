"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Lock } from "lucide-react";
import { setTaskStatus } from "@/app/[orgSlug]/tasks/actions";
import { canMoveTask, type Role } from "@/lib/roles";
import { useViewer } from "@/lib/viewer";
import { useUndoToast } from "@/components/ui/undo-toast";

/** The viewer's own part of a task that needs everyone to finish ("all"). */
export type TaskPart = { mineDone: boolean; done: number; total: number };

/**
 * Round checkbox that ticks a task done, or the viewer's own part of one that
 * needs everyone (D100). Ticking hides finished work from everyday views, so
 * a five-second Undo follows (D101).
 */
export function TaskCheckbox({
  id,
  title,
  done,
  part,
  creator,
  locked = false,
  onCompleteStart,
}: {
  id: string;
  title: string;
  done: boolean;
  /** Read-only regardless of rank. */
  locked?: boolean;
  /** Present when the task needs every assignee to finish and the viewer is one of them. */
  part?: TaskPart;
  /** Who made it and who's on it, to mirror the database's rule on who may tick it. */
  creator?: { created_by: string | null; created_by_role: Role | null; assignees: { membership_id: string | null }[] };
  /** Lets a parent play the strike-through/slide-out animation first. */
  onCompleteStart?: () => void;
}) {
  const [checked, setChecked] = useState(part ? part.mineDone : done);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const viewer = useViewer();
  const toast = useUndoToast();

  const save = (next: boolean) =>
    new Promise<boolean>((resolve) =>
      startTransition(async () => {
        const result = await setTaskStatus({ id, status: next ? "done" : "todo" });
        resolve(result.ok);
      }),
    );

  const toggle = async () => {
    const next = !checked;
    // with "all", ticking finishes the task only if everyone else already has
    const finishes = next && (!part || part.done + 1 >= part.total);
    setChecked(next);
    if (finishes) onCompleteStart?.();
    const ok = await save(next);
    if (!ok) {
      setChecked(!next);
      router.refresh();
      return;
    }
    router.refresh();
    if (next) {
      toast(part && !finishes ? `Your part of “${title}” is done.` : `“${title}” is done.`, async () => {
        if (await save(false)) router.refresh();
      });
    }
  };

  const label = part ? `My part of ${title} (${part.done} of ${part.total} done)` : `Done: ${title}`;

  if (locked || (!part && creator && !canMoveTask(viewer, creator))) {
    return (
      <span
        role="checkbox"
        aria-checked={checked}
        aria-disabled
        aria-label={`Done: ${title} (only someone on it, or ranked at or above whoever made it, can change it)`}
        className="inline-flex size-5 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-ink-muted text-ink-muted"
      >
        {checked ? <Check aria-hidden className="size-3" strokeWidth={3} /> : <Lock aria-hidden className="size-2.5" />}
      </span>
    );
  }

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      disabled={pending}
      onClick={toggle}
      className={`inline-flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
        checked ? "border-good bg-good text-canvas" : "border-ink bg-canvas hover:bg-panel"
      }`}
    >
      {checked ? <Check aria-hidden className="size-3" strokeWidth={3} /> : null}
    </button>
  );
}

/** The tick box for a whole task row: works out the viewer's own part for "all" tasks. */
export function TaskDoneBox({
  task,
  onCompleteStart,
}: {
  task: {
    id: string;
    title: string;
    status: string;
    completion: "any" | "all";
    kind: "general" | "appointed" | "personal";
    created_by: string | null;
    created_by_role: Role | null;
    assignees: { membership_id: string | null; done_at: string | null }[];
  };
  onCompleteStart?: () => void;
}) {
  const { membershipId, userId } = useViewer();
  const onIt = task.assignees.some((a) => a.membership_id === membershipId);
  const mine = task.completion === "all" ? task.assignees.find((a) => a.membership_id === membershipId) : undefined;
  const part = mine
    ? { mineDone: mine.done_at !== null, done: task.assignees.filter((a) => a.done_at).length, total: task.assignees.length }
    : undefined;
  return (
    <TaskCheckbox
      id={task.id}
      title={task.title}
      done={task.status === "done"}
      part={part}
      creator={task}
      // someone else's personal work is theirs to tick, whoever can see it
      locked={task.kind === "personal" && !onIt && task.created_by !== userId}
      onCompleteStart={onCompleteStart}
    />
  );
}
