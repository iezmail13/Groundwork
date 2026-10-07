"use client";

import { useActionState } from "react";
import { createOrganization } from "@/app/create-organization/actions";
import { idle } from "@/lib/action-state";
import { Field, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/form-message";
import { keepValues } from "@/lib/forms";

export type PresetOption = { key: string; name: string; example: string };

export function CreateOrgForm({ presets, defaultName }: { presets: PresetOption[]; defaultName?: string }) {
  const [state, action, pending] = useActionState(createOrganization, idle);
  return (
    <form action={action} onSubmit={keepValues(action)} className="flex flex-col gap-5" noValidate>
      <Field label="Your name" htmlFor="fullName" hint="Shown to your colleagues." error={state.fieldErrors?.fullName}>
        <Input id="fullName" name="fullName" autoComplete="name" defaultValue={defaultName} maxLength={120} />
      </Field>
      <Field label="Organization name" htmlFor="name" error={state.fieldErrors?.name}>
        <Input
          id="name"
          name="name"
          required
          maxLength={120}
          placeholder="Northside Youth Collective"
          invalid={Boolean(state.fieldErrors?.name)}
        />
      </Field>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 font-heading text-sm font-semibold">How should Groundwork talk?</legend>
        <p className="-mt-1 mb-1 text-sm text-ink-muted">You can change this, or rename anything, later in Settings.</p>
        <div className="divide-y divide-rule border-y border-rule">
          {presets.map((p, i) => (
            <label key={p.key} className="flex cursor-pointer items-start gap-3 py-3 hover:bg-panel has-[:checked]:bg-panel">
              <input
                type="radio"
                name="preset"
                value={p.key}
                defaultChecked={i === 0}
                className="mt-1 size-4 accent-[var(--ink)]"
              />
              <span>
                <span className="block font-heading font-semibold">{p.name}</span>
                <span className="block text-sm text-ink-muted">{p.example}</span>
              </span>
            </label>
          ))}
        </div>
        {state.fieldErrors?.preset ? (
          <p className="text-sm font-semibold" role="alert">
            {state.fieldErrors.preset[0]}
          </p>
        ) : null}
      </fieldset>
      <SubmitButton pending={pending} pendingLabel="Creating…">Create organization</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
