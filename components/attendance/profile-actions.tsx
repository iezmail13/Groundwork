"use client";

import { useActionState } from "react";
import { Archive, ArchiveRestore, Plus } from "lucide-react";
import { enrollParticipant, setParticipantsArchived } from "@/app/[orgSlug]/attendance/actions";
import { idle } from "@/lib/action-state";
import { useT } from "@/lib/terminology/context";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { inputClass } from "@/components/ui/field";

export function ArchiveParticipantButton({ id, archived }: { id: string; archived: boolean }) {
  const [state, action] = useActionState(setParticipantsArchived, idle);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="ids" value={id} />
      <input type="hidden" name="archived" value={archived ? "false" : "true"} />
      <div>
        <SubmitButton variant="secondary" pendingLabel={archived ? "Restoring…" : "Archiving…"}>
          {archived ? <ArchiveRestore aria-hidden className="size-4" /> : <Archive aria-hidden className="size-4" />}
          {archived ? "Restore" : "Archive"}
        </SubmitButton>
      </div>
      <FormMessage state={state} />
    </form>
  );
}

export function EnrollForm({
  organizationId,
  participantId,
  programs,
}: {
  organizationId: string;
  participantId: string;
  /** Active programs the viewer manages that this person isn't in yet. */
  programs: { id: string; name: string }[];
}) {
  const t = useT();
  const [state, action] = useActionState(enrollParticipant, idle);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="participantId" value={participantId} />
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex min-w-48 flex-col gap-1">
          <label htmlFor="enroll-program" className="font-heading text-xs font-semibold text-ink-muted">
            Add to a {t("project").toLowerCase()}
          </label>
          <select id="enroll-program" name="projectId" className={`${inputClass} py-1.5`}>
            {programs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <SubmitButton variant="secondary" pendingLabel="Adding…">
          <Plus aria-hidden className="size-4" />
          Add
        </SubmitButton>
      </div>
      <FormMessage state={state} />
    </form>
  );
}
