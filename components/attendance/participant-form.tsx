"use client";

import { useActionState } from "react";
import { updateParticipant } from "@/app/[orgSlug]/attendance/actions";
import { idle } from "@/lib/action-state";
import { Field, Input, Textarea } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { keepValues } from "@/lib/forms";

export type ParticipantValues = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  date_of_birth: string | null;
  guardian_name: string | null;
  emergency_contact: string | null;
  care_notes: string | null;
  notes: string | null;
};

export function ParticipantForm({ participant, readOnly }: { participant: ParticipantValues; readOnly: boolean }) {
  const [state, action, pending] = useActionState(updateParticipant, idle);
  const e = state.fieldErrors ?? {};
  const p = participant;
  return (
    <form action={action} onSubmit={keepValues(action)} className="flex max-w-3xl flex-col gap-5" noValidate>
      <input type="hidden" name="id" value={p.id} />
      <fieldset disabled={readOnly} className="flex flex-col gap-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" htmlFor="p-name" error={e.name} className="sm:col-span-2">
            <Input id="p-name" name="name" required maxLength={120} defaultValue={p.name} invalid={Boolean(e.name)} />
          </Field>
          <Field label="Email" htmlFor="p-email" error={e.email}>
            <Input id="p-email" name="email" type="email" maxLength={254} defaultValue={p.email ?? ""} invalid={Boolean(e.email)} />
          </Field>
          <Field label="Phone" htmlFor="p-phone" error={e.phone}>
            <Input id="p-phone" name="phone" type="tel" maxLength={40} defaultValue={p.phone ?? ""} invalid={Boolean(e.phone)} />
          </Field>
        </div>
        <fieldset className="flex flex-col gap-4 border-t border-rule pt-4">
          <legend className="sr-only">Private details</legend>
          <p className="font-heading text-sm font-semibold">Private details</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Date of birth" htmlFor="p-dob" error={e.dateOfBirth}>
              <Input id="p-dob" name="dateOfBirth" type="date" defaultValue={p.date_of_birth ?? ""} invalid={Boolean(e.dateOfBirth)} />
            </Field>
            <Field label="Parent or guardian" htmlFor="p-guardian" error={e.guardianName}>
              <Input id="p-guardian" name="guardianName" maxLength={120} defaultValue={p.guardian_name ?? ""} invalid={Boolean(e.guardianName)} />
            </Field>
            <Field label="Emergency contact" htmlFor="p-emergency" hint="Name and phone number" error={e.emergencyContact} className="sm:col-span-2">
              <Input id="p-emergency" name="emergencyContact" maxLength={200} defaultValue={p.emergency_contact ?? ""} invalid={Boolean(e.emergencyContact)} />
            </Field>
            <Field label="Medical and accessibility notes" htmlFor="p-care" error={e.careNotes} className="sm:col-span-2">
              <Textarea id="p-care" name="careNotes" rows={3} maxLength={2000} defaultValue={p.care_notes ?? ""} invalid={Boolean(e.careNotes)} />
            </Field>
          </div>
        </fieldset>
        <Field label="Other notes" htmlFor="p-notes" error={e.notes}>
          <Textarea id="p-notes" name="notes" rows={3} maxLength={4000} defaultValue={p.notes ?? ""} invalid={Boolean(e.notes)} />
        </Field>
      </fieldset>
      <FormMessage state={state} />
      {!readOnly ? (
        <div>
          <SubmitButton pending={pending} pendingLabel="Saving…">
            Save details
          </SubmitButton>
        </div>
      ) : null}
    </form>
  );
}
