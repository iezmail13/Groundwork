"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Copy, UserPlus } from "lucide-react";
import { inviteMember, setPreset, updateOrganization } from "@/app/[orgSlug]/settings/actions";
import { idle } from "@/lib/action-state";
import { useT } from "@/lib/terminology/context";
import { Field, Input, Select, inputClass } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/form-message";
import { Button } from "@/components/ui/button";
import { keepValues } from "@/lib/forms";
import { grantableProjectRoles, type Role } from "@/lib/roles";
import { lower } from "@/lib/terminology/t";

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

export type GrantableProject = { id: string; name: string; myRank: number };

export type AssignTask = { id: string; title: string; projectId: string; href: string };

export function InviteForm({
  organizationId,
  roles,
  projects,
  assignTask = null,
}: {
  organizationId: string;
  roles: Role[];
  /** Projects the inviter can grant (they're a project admin or lead there). */
  projects: GrantableProject[];
  /** Arrived from a task's assignee picker: the invitee joins its project and is assigned it. */
  assignTask?: AssignTask | null;
}) {
  const t = useT();
  const [state, action, pending] = useActionState(inviteMember, idle);
  const [copied, setCopied] = useState(false);
  const [role, setRole] = useState<Role>("staff");
  const [handled, setHandled] = useState<number | undefined>();
  // the task is handed over once; later invites from this page are ordinary ones
  const [pendingTask, setPendingTask] = useState(assignTask);
  const formRef = useRef<HTMLFormElement>(null);
  // start fresh after each invite, so the next one doesn't inherit the email, a higher role or project access
  if (state.status === "success" && state.at !== handled) {
    setHandled(state.at);
    setRole("staff");
    setPendingTask(null);
  }
  useEffect(() => {
    if (state.status === "success") formRef.current?.reset();
  }, [state]);
  const link = state.status === "success" ? state.data?.link : undefined;
  const e = state.fieldErrors ?? {};
  const projectWord = lower(t("project", "other"));
  return (
    <div className="flex flex-col gap-3">
      {pendingTask ? (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 border-l-4 border-ink pl-3 text-sm">
          <span>
            The person you invite joins this {lower(t("project"))} and is assigned <strong>{pendingTask.title}</strong>.
          </span>
          <Link href={pendingTask.href} className="font-semibold hover:underline">
            Cancel
          </Link>
        </p>
      ) : null}
      <form ref={formRef} action={action} onSubmit={keepValues(action)} className="flex flex-col gap-4" noValidate>
        <input type="hidden" name="organizationId" value={organizationId} />
        {pendingTask ? <input type="hidden" name="assignTaskId" value={pendingTask.id} /> : null}
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Name" htmlFor="invite-name" error={e.name} className="min-w-48 flex-1">
            <Input id="invite-name" name="name" maxLength={120} autoComplete="off" invalid={Boolean(e.name)} />
          </Field>
          <Field label="Email" htmlFor="invite-email" error={e.email} className="min-w-64 flex-1">
            <Input id="invite-email" name="email" type="email" required placeholder="name@example.org" invalid={Boolean(e.email)} />
          </Field>
          <Field label="Role" htmlFor="invite-role" error={e.role}>
            <Select id="invite-role" name="role" value={role} onChange={(ev) => setRole(ev.target.value as Role)}>
              {roles.map((r) => (
                <option key={r} value={r}>
                  {t(`role.${r}`)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {projects.length ? (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 font-heading text-sm font-semibold">
              {t("project", "other")} they join
            </legend>
            <p className="text-sm text-ink-muted">
              They&apos;ll only see the {projectWord} you add them to
              {roles.includes("owner") ? ` (${lower(t("role.owner", "other"))} see all of them)` : ""}.
            </p>
            <ul className="divide-y divide-rule border-y border-rule">
              {projects.map((p) => {
                const options = grantableProjectRoles(p.myRank, role);
                // the task's project is ticked, at the lowest role, and must stay granted
                const forTask = pendingTask?.projectId === p.id;
                return (
                  <li key={p.id} className="flex items-center justify-between gap-3 py-2">
                    <label htmlFor={`grant-${p.id}`} className="min-w-0 flex-1 font-semibold">
                      {p.name}
                    </label>
                    <select
                      id={`grant-${p.id}`}
                      name={`grant.${p.id}`}
                      defaultValue={forTask ? (options.at(-1) ?? "") : ""}
                      key={`${role}:${forTask}`}
                      className={`${inputClass.replace("w-full", "")} w-40 shrink-0 py-1.5`}
                    >
                      {forTask ? null : <option value="">Not added</option>}
                      {options.map((r) => (
                        <option key={r} value={r}>
                          {t(`project_role.${r}`)}
                        </option>
                      ))}
                    </select>
                  </li>
                );
              })}
            </ul>
          </fieldset>
        ) : null}
        <div>
          <SubmitButton pending={pending} pendingLabel="Creating…">
            <UserPlus aria-hidden className="size-4" />
            Invite
          </SubmitButton>
        </div>
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
      {link && state.data?.taskHref ? (
        <p>
          <Link href={state.data.taskHref} className="inline-flex items-center gap-1.5 font-semibold hover:underline">
            <ArrowLeft aria-hidden className="size-4" />
            Back to {state.data.taskTitle}
          </Link>
        </p>
      ) : null}
    </div>
  );
}
