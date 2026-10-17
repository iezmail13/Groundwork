"use client";

import { useActionState } from "react";
import { UserPlus } from "lucide-react";
import { addParticipant } from "@/app/[orgSlug]/attendance/actions";
import { idle } from "@/lib/action-state";
import { useT } from "@/lib/terminology/context";
import { lower } from "@/lib/terminology/t";
import { DialogButton } from "@/components/ui/modal";
import { Field, Input, Select } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { Button } from "@/components/ui/button";
import { keepValues } from "@/lib/forms";

export function AddParticipantButton({
  orgSlug,
  programs,
  programId,
}: {
  orgSlug: string;
  /** Active programs the viewer manages. */
  programs: { id: string; name: string }[];
  programId?: string;
}) {
  const t = useT();
  const word = lower(t("participant"));
  return (
    <DialogButton label={`Add ${word}`} icon={<UserPlus aria-hidden className="size-4" />} title={`Add a ${word}`}>
      {(close) => <AddParticipantForm orgSlug={orgSlug} programs={programs} programId={programId} onCancel={close} />}
    </DialogButton>
  );
}

function AddParticipantForm({
  orgSlug,
  programs,
  programId,
  onCancel,
}: {
  orgSlug: string;
  programs: { id: string; name: string }[];
  programId?: string;
  onCancel: () => void;
}) {
  const t = useT();
  const [state, action, pending] = useActionState(addParticipant, idle);
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} onSubmit={keepValues(action)} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="orgSlug" value={orgSlug} />
      <Field label="Full name" htmlFor="participant-name" error={e.name}>
        <Input id="participant-name" name="name" required maxLength={120} autoComplete="off" invalid={Boolean(e.name)} />
      </Field>
      <Field label={t("project")} htmlFor="participant-program" error={e.projectId}>
        <Select id="participant-program" name="projectId" defaultValue={programId ?? programs[0]?.id}>
          {programs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </Field>
      <p className="text-sm text-ink-muted">You can add contact and care details on their profile next.</p>
      <FormMessage state={state} />
      <div className="flex justify-end gap-2 border-t border-rule pt-4">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <SubmitButton pending={pending} pendingLabel="Adding…">
          <UserPlus aria-hidden className="size-4" />
          Add
        </SubmitButton>
      </div>
    </form>
  );
}
