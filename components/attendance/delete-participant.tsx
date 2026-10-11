"use client";

import { useActionState } from "react";
import { Trash2 } from "lucide-react";
import { deleteParticipant } from "@/app/[orgSlug]/attendance/actions";
import { idle } from "@/lib/action-state";
import { useT } from "@/lib/terminology/context";
import { lower } from "@/lib/terminology/t";
import { DialogButton } from "@/components/ui/modal";
import { Field, Input } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { Button } from "@/components/ui/button";

/** Permanent deletion for privacy requests, confirmed by typing the name. */
export function DeleteParticipantButton({ id, name, orgSlug }: { id: string; name: string; orgSlug: string }) {
  return (
    <DialogButton
      variant="danger"
      label="Delete permanently"
      icon={<Trash2 aria-hidden className="size-4" />}
      title={`Delete ${name} permanently?`}
    >
      {(close) => <DeleteForm id={id} name={name} orgSlug={orgSlug} onCancel={close} />}
    </DialogButton>
  );
}

function DeleteForm({ id, name, orgSlug, onCancel }: { id: string; name: string; orgSlug: string; onCancel: () => void }) {
  const t = useT();
  const word = lower(t("section.attendance"));
  const [state, action, pending] = useActionState(deleteParticipant, idle);
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="orgSlug" value={orgSlug} />
      <p>
        This erases <strong>{name}</strong>&apos;s details and notes for good, for example to meet a privacy request. Their {word}{" "}
        marks stay without a name, so past {lower(t("event"))} counts and rates don&apos;t change. To hide them but keep their details, archive
        them instead.
      </p>
      <Field label={`Type ${name} to confirm`} htmlFor="delete-confirm" error={e.confirm}>
        <Input id="delete-confirm" name="confirm" autoComplete="off" required invalid={Boolean(e.confirm)} />
      </Field>
      <FormMessage state={state} />
      <div className="flex justify-end gap-2 border-t border-rule pt-4">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <SubmitButton variant="danger" pending={pending} pendingLabel="Deleting…">
          <Trash2 aria-hidden className="size-4" />
          Delete permanently
        </SubmitButton>
      </div>
    </form>
  );
}
