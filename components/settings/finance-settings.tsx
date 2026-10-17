"use client";

import { useActionState } from "react";
import { Field, Input, inputClass } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/form-message";
import { idle } from "@/lib/action-state";
import { keepValues } from "@/lib/forms";
import { saveAccountingLink } from "@/app/[orgSlug]/settings/finance-actions";
import { ACCOUNTING_NAMES } from "@/lib/budget";
import { useT } from "@/lib/terminology/context";
import { lower } from "@/lib/terminology/t";

/** Settings → Finance (D108): the link to the accounting software, for owners. */
export function FinanceSettings({
  organizationId,
  name,
  url,
  canEdit,
}: {
  organizationId: string;
  name: string | null;
  url: string | null;
  canEdit: boolean;
}) {
  const t = useT();
  const [state, action, pending] = useActionState(saveAccountingLink, idle);
  return (
    <form action={action} onSubmit={keepValues(action)} className="flex max-w-xl flex-col gap-4">
      <p className="text-sm text-ink-muted">
        Your official books stay in your accounting software. Add a link to it here and the people who approve spending get an
        &quot;Open&quot; button on the Spending page. It&apos;s only a link: Groundwork never signs in to it or reads from it.
      </p>
      <input type="hidden" name="organizationId" value={organizationId} />
      <fieldset disabled={!canEdit} className="flex flex-col gap-4">
        <Field label="Accounting software" htmlFor="accounting-name" error={state.fieldErrors?.accountingName}>
          <select id="accounting-name" name="accountingName" defaultValue={name ?? ""} className={inputClass}>
            <option value="">None</option>
            {ACCOUNTING_NAMES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Link" htmlFor="accounting-url" error={state.fieldErrors?.accountingUrl} hint="The address you sign in at, starting https://">
          <Input id="accounting-url" name="accountingUrl" type="url" defaultValue={url ?? ""} maxLength={500} placeholder="https://" invalid={Boolean(state.fieldErrors?.accountingUrl)} />
        </Field>
      </fieldset>
      <FormMessage state={state} />
      {canEdit ? (
        <SubmitButton pending={pending} className="self-start">
          Save
        </SubmitButton>
      ) : (
        <p className="text-sm text-ink-muted">Only {lower(t("role.owner", "other"))} change this link.</p>
      )}
    </form>
  );
}
