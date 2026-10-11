"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Copy, UserPlus } from "lucide-react";
import { inviteMember, setPreset, updateOrganization } from "@/app/[orgSlug]/settings/actions";
import { idle } from "@/lib/action-state";
import { useT } from "@/lib/terminology/context";
import { Field, Input, Select, inputClass } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/form-message";
import { Button } from "@/components/ui/button";
import { keepValues } from "@/lib/forms";
import type { Role } from "@/lib/roles";

export type PresetChoice = { key: string; name: string; words: string[] };

export function PresetForm({
  organizationId,
  current,
  presets,
  disabled,
}: {
  organizationId: string;
  current: string;
  presets: PresetChoice[];
  disabled: boolean;
}) {
  const [state, action] = useActionState(setPreset, idle);
  return (
    <form action={action} className="flex max-w-2xl flex-col gap-4">
      <input type="hidden" name="organizationId" value={organizationId} />
      <fieldset disabled={disabled}>
        <legend className="mb-2 text-ink-muted">
          A preset sets the words Groundwork uses everywhere.
        </legend>
        <div className="divide-y divide-rule border-y border-rule">
          {presets.map((p) => (
            <label key={p.key} className="flex cursor-pointer items-start gap-3 py-3 hover:bg-tint has-[:checked]:bg-panel">
              <input
                type="radio"
                name="preset"
                value={p.key}
                defaultChecked={p.key === current}
                className="mt-1 size-4 accent-[var(--ink)]"
              />
              <span>
                <span className="block font-heading font-semibold">
                  {p.name}
                  {p.key === current ? <span className="ml-2 text-sm font-normal text-ink-muted">(current)</span> : null}
                </span>
                <span className="block text-sm text-ink-muted">{p.words.join(" · ")}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <FormMessage state={state} />
      {!disabled ? (
        <div>
          <SubmitButton pendingLabel="Applying…">Apply preset</SubmitButton>
        </div>
      ) : null}
    </form>
  );
}

export function OrganizationForm({
  organizationId,
  name,
  slug,
  disabled,
}: {
  organizationId: string;
  name: string;
  slug: string;
  disabled: boolean;
}) {
  const [state, action, pending] = useActionState(updateOrganization, idle);
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} onSubmit={keepValues(action)} className="flex max-w-xl flex-col gap-4" noValidate>
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="currentSlug" value={slug} />
      <fieldset disabled={disabled} className="flex flex-col gap-4">
        <Field label="Organization name" htmlFor="org-name" error={e.name}>
          <Input id="org-name" name="name" required maxLength={120} defaultValue={name} invalid={Boolean(e.name)} />
        </Field>
        <Field
          label="Web address"
          htmlFor="org-slug"
          hint="Lowercase letters, digits and dashes. Changing it breaks old links."
          error={e.slug}
        >
          <div className="flex items-center">
            <span className="rounded-l-md border border-r-0 border-rule bg-panel px-3 py-2 text-ink-muted">/</span>
            <Input
              id="org-slug"
              name="slug"
              required
              maxLength={48}
              defaultValue={slug}
              className="rounded-l-none"
              invalid={Boolean(e.slug)}
            />
          </div>
        </Field>
      </fieldset>
      <FormMessage state={state} />
      {!disabled ? (
        <div>
          <SubmitButton pending={pending} pendingLabel="Saving…">Save</SubmitButton>
        </div>
      ) : null}
    </form>
  );
}

export function InviteForm({ organizationId, roles }: { organizationId: string; roles: Role[] }) {
  const t = useT();
  const [state, action, pending] = useActionState(inviteMember, idle);
  const [copied, setCopied] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  // start fresh after each invite, so the next one doesn't inherit the email or a higher role
  useEffect(() => {
    if (state.status === "success") formRef.current?.reset();
  }, [state]);
  const link = state.status === "success" ? state.data?.link : undefined;
  const e = state.fieldErrors ?? {};
  return (
    <div className="flex flex-col gap-3">
      <form ref={formRef} action={action} onSubmit={keepValues(action)} className="flex flex-wrap items-end gap-3" noValidate>
        <input type="hidden" name="organizationId" value={organizationId} />
        <Field label="Email" htmlFor="invite-email" error={e.email} className="min-w-64 flex-1">
          <Input id="invite-email" name="email" type="email" required placeholder="name@example.org" invalid={Boolean(e.email)} />
        </Field>
        <Field label="Role" htmlFor="invite-role" error={e.role}>
          <Select id="invite-role" name="role" defaultValue="staff">
            {roles.map((r) => (
              <option key={r} value={r}>
                {t(`role.${r}`)}
              </option>
            ))}
          </Select>
        </Field>
        <SubmitButton pending={pending} pendingLabel="Creating…">
          <UserPlus aria-hidden className="size-4" />
          Invite
        </SubmitButton>
      </form>
      <FormMessage state={state} />
      {link ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-ink p-2">
          <label htmlFor="invite-link" className="sr-only">
            Invite link
          </label>
          <input id="invite-link" readOnly value={link} className={`${inputClass} min-w-0 flex-1 font-mono text-sm`} onFocus={(ev) => ev.currentTarget.select()} />
          <Button
            variant="secondary"
            size="sm"
            onClick={async () => {
              await navigator.clipboard?.writeText(link).catch(() => undefined);
              setCopied(true);
            }}
          >
            <Copy aria-hidden className="size-4" />
            {copied ? "Copied" : "Copy link"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
