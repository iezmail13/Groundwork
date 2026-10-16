"use client";

import Link from "next/link";

import { useActionState, useState } from "react";
import { Copy, Crown, Trash2, X } from "lucide-react";
import { changeRole, removeMember, revokeInvitation, transferOwnership } from "@/app/[orgSlug]/settings/actions";
import { idle } from "@/lib/action-state";
import { canManageMember, canManageOrg, grantableRoles, type Role } from "@/lib/roles";
import { Avatar } from "@/components/people/avatar";
import { PresenceBadge } from "@/components/people/presence";
import { useT } from "@/lib/terminology/context";
import { lower } from "@/lib/terminology/t";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/form-message";
import { DialogButton } from "@/components/ui/modal";
import { Field, inputClass, Select } from "@/components/ui/field";

export type MemberRow = {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: Role;
  isYou: boolean;
  initials: string;
  photoUrl: string | null;
  href: string;
};
export type InviteRow = {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  projects: string[];
  link: string;
  expires: string;
  expired: boolean;
};

/** Everyone sees the list; controls appear only where the viewer's rank allows them. */
export function MembersTable({ members, viewerRole, orgSlug }: { members: MemberRow[]; viewerRole: Role; orgSlug: string }) {
  const t = useT();
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[620px] border-collapse text-left">
        <caption className="sr-only">{t("member", "other")}</caption>
        <thead>
          <tr className="border-b border-ink font-heading text-sm">
            <th scope="col" className="py-2 pr-4 font-semibold">Name</th>
            <th scope="col" className="py-2 pr-4 font-semibold">Role</th>
            <th scope="col" className="py-2 font-semibold">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.id} className="border-b border-rule">
              <th scope="row" className="py-2.5 pr-4 font-normal">
                <span className="flex items-center gap-3">
                  <Avatar name={m.name} initials={m.initials} photoUrl={m.photoUrl} size="sm" />
                  <span className="min-w-0">
                    <Link href={m.href} className="font-semibold hover:underline">
                      {m.name}
                    </Link>
                    {m.isYou ? <span className="ml-2 text-sm text-ink-muted">(you)</span> : null}
                    <span className="block text-sm text-ink-muted">{m.email}</span>
                    <PresenceBadge userId={m.userId} />
                  </span>
                </span>
              </th>
              <td className="py-2.5 pr-4">
                {canManageMember(viewerRole, m.role) ? (
                  <RoleSelect member={m} viewerRole={viewerRole} orgSlug={orgSlug} />
                ) : (
                  <Badge variant={canManageOrg(m.role) ? "filled" : "outline"}>{t(`role.${m.role}`)}</Badge>
                )}
              </td>
              <td className="py-2.5 text-right">
                {m.isYou || canManageMember(viewerRole, m.role) ? (
                  <RemoveButton member={m} orgSlug={orgSlug} heirs={members.filter((x) => x.id !== m.id)} />
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RoleSelect({ member, viewerRole, orgSlug }: { member: MemberRow; viewerRole: Role; orgSlug: string }) {
  const t = useT();
  const [state, action] = useActionState(changeRole, idle);
  return (
    <form action={action} className="flex flex-col gap-1">
      <input type="hidden" name="membershipId" value={member.id} />
      <input type="hidden" name="orgSlug" value={orgSlug} />
      <div className="flex items-center gap-2">
        <label htmlFor={`role-${member.id}`} className="sr-only">
          Role for {member.name}
        </label>
        <select id={`role-${member.id}`} name="role" defaultValue={member.role} className={`${inputClass} w-auto py-1.5`}>
          {grantableRoles(viewerRole).map((r) => (
            <option key={r} value={r}>
              {t(`role.${r}`)}
            </option>
          ))}
        </select>
        <SubmitButton variant="secondary" size="sm">
          Update
        </SubmitButton>
      </div>
      {state.status === "error" ? <FormMessage state={state} /> : null}
    </form>
  );
}

function RemoveButton({ member, orgSlug, heirs }: { member: MemberRow; orgSlug: string; heirs: MemberRow[] }) {
  const t = useT();
  return (
    <DialogButton
      variant="ghost"
      size="sm"
      label={member.isYou ? "Leave" : "Remove"}
      icon={<Trash2 aria-hidden className="size-4" />}
      ariaLabel={`${member.isYou ? "Leave the organization" : `Remove ${member.name}`}`}
      title={member.isYou ? "Leave this organization?" : `Remove ${member.name}?`}
    >
      {(close) => <RemoveForm member={member} orgSlug={orgSlug} heirs={heirs} onCancel={close} memberWord={lower(t("member"))} />}
    </DialogButton>
  );
}

function RemoveForm({
  member,
  orgSlug,
  heirs,
  onCancel,
  memberWord,
}: {
  member: MemberRow;
  orgSlug: string;
  heirs: MemberRow[];
  onCancel: () => void;
  memberWord: string;
}) {
  const t = useT();
  const [state, action] = useActionState(removeMember, idle);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="membershipId" value={member.id} />
      <input type="hidden" name="orgSlug" value={orgSlug} />
      <p>
        {member.isYou
          ? "You'll lose access straight away, and would need a new invitation to come back."
          : `${member.name} will lose access straight away. You can invite them back later as a ${memberWord}.`}{" "}
        Finished work and history stay as they are.
      </p>
      <Field label={`Hand over open ${lower(t("task", "other"))} to`} htmlFor={`heir-${member.id}`} hint="Anything the person you choose can't see is flagged for a new assignee instead.">
        <Select id={`heir-${member.id}`} name="reassignTo" defaultValue="">
          <option value="">Nobody: flag it for a new assignee</option>
          {heirs.map((h) => (
            <option key={h.id} value={h.id}>
              {h.name}
            </option>
          ))}
        </Select>
      </Field>
      <FormMessage state={state} />
      <div className="flex justify-end gap-2 border-t border-rule pt-4">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <SubmitButton variant="danger" pendingLabel="Removing…">
          {member.isYou ? "Leave" : "Remove"}
        </SubmitButton>
      </div>
    </form>
  );
}

/** Owners hand the organization to someone else; they step down a rank. */
export function TransferOwnership({
  organizationId,
  orgSlug,
  candidates,
}: {
  organizationId: string;
  orgSlug: string;
  candidates: { id: string; name: string }[];
}) {
  const t = useT();
  if (candidates.length === 0) {
    return <p className="text-ink-muted">Invite someone first. Ownership can only go to someone already in the organization.</p>;
  }
  return (
    <DialogButton
      variant="secondary"
      label="Transfer ownership"
      icon={<Crown aria-hidden className="size-4" />}
      title="Transfer ownership"
      description={`The person you choose becomes ${lower(t("role.owner"))}. You stay on as ${lower(t("role.manager"))}.`}
    >
      {(close) => <TransferForm organizationId={organizationId} orgSlug={orgSlug} candidates={candidates} onCancel={close} />}
    </DialogButton>
  );
}

function TransferForm({
  organizationId,
  orgSlug,
  candidates,
  onCancel,
}: {
  organizationId: string;
  orgSlug: string;
  candidates: { id: string; name: string }[];
  onCancel: () => void;
}) {
  const t = useT();
  const [state, action] = useActionState(transferOwnership, idle);
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="orgSlug" value={orgSlug} />
      <Field label={`New ${lower(t("role.owner"))}`} htmlFor="transfer-to" error={e.membershipId}>
        <Select id="transfer-to" name="membershipId" defaultValue="" required invalid={Boolean(e.membershipId)}>
          <option value="" disabled>
            Choose a person
          </option>
          {candidates.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>
      <FormMessage state={state} />
      <div className="flex justify-end gap-2 border-t border-rule pt-4">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <SubmitButton pendingLabel="Transferring…">Transfer ownership</SubmitButton>
      </div>
    </form>
  );
}

export function PendingInvites({ invites }: { invites: InviteRow[] }) {
  const t = useT();
  const [copied, setCopied] = useState<string | null>(null);
  if (invites.length === 0) return <p className="text-ink-muted">No pending invitations.</p>;
  return (
    <ul className="divide-y divide-rule border-y border-rule">
      {invites.map((inv) => (
        <li key={inv.id} className="flex flex-wrap items-center gap-3 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="font-semibold">
              {inv.name ? `${inv.name} · ` : ""}
              {inv.email}
            </p>
            <p className="text-sm text-ink-muted">
              {t(`role.${inv.role}`)} · {inv.expired ? <strong className="text-ink">Expired</strong> : `Expires ${inv.expires}`}
            </p>
            {inv.projects.length ? <p className="text-sm text-ink-muted">Joins {inv.projects.join(", ")}</p> : null}
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={async () => {
              await navigator.clipboard?.writeText(inv.link).catch(() => undefined);
              setCopied(inv.id);
            }}
            aria-label={`Copy invite link for ${inv.email}`}
          >
            <Copy aria-hidden className="size-4" />
            {copied === inv.id ? "Copied" : "Copy link"}
          </Button>
          <form action={revokeInvitation}>
            <input type="hidden" name="id" value={inv.id} />
            <SubmitButton variant="ghost" size="sm" aria-label={`Revoke invitation for ${inv.email}`}>
              <X aria-hidden className="size-4" />
              Revoke
            </SubmitButton>
          </form>
        </li>
      ))}
    </ul>
  );
}
