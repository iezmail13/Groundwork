"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Hand, LogOut } from "lucide-react";
import { claimTask } from "@/app/[orgSlug]/tasks/actions";
import { canClaim } from "@/lib/task-filters";
import { useViewer } from "@/lib/viewer";
import type { TaskRow } from "@/lib/queries";

/**
 * Claim open work, or take yourself off something you claimed. Someone who
 * was appointed can't leave, so they see no button (D100).
 */
export function ClaimButton({ task, size = "sm" }: { task: Pick<TaskRow, "id" | "title" | "kind" | "status" | "claim_limit" | "assignees">; size?: "sm" | "md" }) {
  const { membershipId } = useViewer();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const mine = task.assignees.find((a) => a.membership_id === membershipId);
  const claim = canClaim(task, membershipId);
  const leave = mine?.kind === "claimed" && task.status !== "done";
  if (!claim && !leave) return null;

  const run = () => {
    setError(null);
    startTransition(async () => {
      const result = await claimTask({ id: task.id, claim });
      if (!result.ok) setError(result.message);
      router.refresh();
    });
  };
  const spots = task.claim_limit !== null ? ` (${task.assignees.length} of ${task.claim_limit} taken)` : "";
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        aria-label={claim ? `Claim ${task.title}${spots}` : `Unclaim ${task.title}`}
        className={`inline-flex items-center gap-1 rounded-md border font-heading font-semibold transition-colors disabled:opacity-60 ${
          size === "sm" ? "h-7 px-2 text-xs" : "h-9 px-3 text-sm"
        } ${claim ? "border-accent text-accent hover:bg-accent-tint" : "border-rule text-ink hover:border-ink"}`}
      >
        {claim ? <Hand aria-hidden className="size-3.5" /> : <LogOut aria-hidden className="size-3.5" />}
        {claim ? "Claim" : "Unclaim"}
      </button>
      {error ? (
        <span role="alert" className="text-xs font-semibold text-bad-ink">
          {error}
        </span>
      ) : null}
    </span>
  );
}
