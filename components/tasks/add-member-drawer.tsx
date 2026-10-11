"use client";

import { useActionState, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Copy, UserPlus } from "lucide-react";
import { inviteMember } from "@/app/[orgSlug]/settings/actions";
import { idle } from "@/lib/action-state";
import { grantableProjectRoles, type ProjectRole, type Role } from "@/lib/roles";
import { useT } from "@/lib/terminology/context";
import { lower } from "@/lib/terminology/t";
import { Button } from "@/components/ui/button";
import { Field, Input, inputClass, Select } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { Modal } from "@/components/ui/modal";
import { SubmitButton } from "@/components/ui/submit-button";
import { keepValues } from "@/lib/forms";

export type InviteContext = {
  organizationId: string;
  /** Org roles the viewer can hand out, highest first. */
  roles: Role[];
  /** The viewer's rank on each project, to cap the project role they can grant. */
  projectRanks: Record<string, number>;
};

/**
 * "Add member" beside the assignee picker: invites someone in a drawer over
 * the task form, so the half-written task stays as it is. The invitee is
 * granted this project and becomes assignable at once.
 */
export function AddMemberDrawer({
  invite,
  projectId,
  projectName,
  onInvited,
}: {
  invite: InviteContext;
  projectId: string;
  projectName: string;
  onInvited: (option: { value: string; name: string }) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  // a fresh form each time the drawer opens
  const [session, setSession] = useState(0);
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        aria-haspopup="dialog"
        onClick={() => {
          setSession((n) => n + 1);
          setOpen(true);
        }}
      >
        <UserPlus aria-hidden className="size-4" />
        Add {lower(t("member"))}
      </Button>
      {/* rendered into <body>: the drawer has its own form, and forms can't nest */}
      {open
        ? createPortal(
            <Modal
              drawer
              open
              onClose={() => setOpen(false)}
              title={`Add a ${lower(t("member"))}`}
              description={`They're invited by email, join ${projectName}, and can be assigned straight away.`}
            >
              <InviteDrawerForm
                key={session}
                invite={invite}
                projectId={projectId}
                onInvited={onInvited}
                onDone={() => setOpen(false)}
              />
            </Modal>,
            document.body,
          )
        : null}
    </>
  );
}

function InviteDrawerForm({
  invite,
  projectId,
  onInvited,
  onDone,
}: {
  invite: InviteContext;
  projectId: string;
  onInvited: (option: { value: string; name: string }) => void;
  onDone: () => void;
}) {
  const t = useT();
  const [state, action, pending] = useActionState(inviteMember, idle);
  const [role, setRole] = useState<Role>(invite.roles.includes("staff") ? "staff" : (invite.roles.at(-1) ?? "staff"));
  const [copied, setCopied] = useState(false);
  const projectRoles: ProjectRole[] = grantableProjectRoles(invite.projectRanks[projectId] ?? 0, role);
  const e = state.fieldErrors ?? {};
  const link = state.status === "success" ? state.data?.link : undefined;

  useEffect(() => {
    if (state.status === "success" && state.data?.invitationId) {
      onInvited({ value: `i:${state.data.invitationId}`, name: `${state.data.name} (pending)` });
    }
  }, [state, onInvited]);

  if (link) {
    return (
      <div className="flex flex-col gap-4">
        <FormMessage state={state} />
        <p>They&apos;re now the assignee on your form. Send them this link so they can join.</p>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="drawer-invite-link" className="sr-only">
            Invite link
          </label>
          <input id="drawer-invite-link" readOnly value={link} className={`${inputClass} min-w-0 flex-1 font-mono text-sm`} onFocus={(ev) => ev.currentTarget.select()} />
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
        <div className="flex justify-end border-t border-rule pt-4">
          <Button onClick={onDone}>Back to the form</Button>
        </div>
      </div>
    );
  }

  return (
    <form action={action} onSubmit={keepValues(action)} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="organizationId" value={invite.organizationId} />
      <Field label="Name" htmlFor="drawer-invite-name" error={e.name}>
        <Input id="drawer-invite-name" name="name" maxLength={120} autoComplete="off" invalid={Boolean(e.name)} />
      </Field>
      <Field label="Email" htmlFor="drawer-invite-email" error={e.email}>
        <Input id="drawer-invite-email" name="email" type="email" required placeholder="name@example.org" invalid={Boolean(e.email)} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Role" htmlFor="drawer-invite-role" error={e.role}>
          <Select id="drawer-invite-role" name="role" value={role} onChange={(ev) => setRole(ev.target.value as Role)}>
            {invite.roles.map((r) => (
              <option key={r} value={r}>
                {t(`role.${r}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={`Role on this ${lower(t("project"))}`} htmlFor="drawer-invite-project-role">
          <Select id="drawer-invite-project-role" name={`grant.${projectId}`} key={role} defaultValue={projectRoles.at(-1) ?? "staff"}>
            {projectRoles.map((r) => (
              <option key={r} value={r}>
                {t(`project_role.${r}`)}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <FormMessage state={state} />
      <div className="flex justify-end gap-2 border-t border-rule pt-4">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <SubmitButton pending={pending} pendingLabel="Inviting…">
          <UserPlus aria-hidden className="size-4" />
          Invite
        </SubmitButton>
      </div>
    </form>
  );
}
