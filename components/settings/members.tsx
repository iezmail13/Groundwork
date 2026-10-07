"use client";

import { useActionState, useState } from "react";
import { Copy, Trash2, X } from "lucide-react";
import { changeRole, removeMember, revokeInvitation } from "@/app/[orgSlug]/settings/actions";
import { idle } from "@/lib/action-state";
import { useT } from "@/lib/terminology/context";
import { lower } from "@/lib/terminology/t";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/form-message";
import { DialogButton } from "@/components/ui/modal";
import { inputClass } from "@/components/ui/field";

export type MemberRow = { id: string; name: string; email: string; role: "admin" | "member"; isYou: boolean };
export type InviteRow = { id: string; email: string; role: "admin" | "member"; link: string; expires: string; expired: boolean };

export function MembersTable({ members, isAdmin }: { members: MemberRow[]; isAdmin: boolean }) {
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
                <span className="font-semibold">{m.name}</span>
                {m.isYou ? <span className="ml-2 text-sm text-ink-muted">(you)</span> : null}
                <span className="block text-sm text-ink-muted">{m.email}</span>
              </th>
              <td className="py-2.5 pr-4">
                {isAdmin ? <RoleSelect member={m} /> : <Badge variant={m.role === "admin" ? "filled" : "outline"}>{t(`role.${m.role}`)}</Badge>}
              </td>
              <td className="py-2.5 text-right">{isAdmin ? <RemoveButton member={m} /> : null}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RoleSelect({ member }: { member: MemberRow }) {
  const t = useT();
  const [state, action] = useActionState(changeRole, idle);
  return (
    <form action={action} className="flex flex-col gap-1">
      <input type="hidden" name="membershipId" value={member.id} />
      <div className="flex items-center gap-2">
        <label htmlFor={`role-${member.id}`} className="sr-only">
          Role for {member.name}
        </label>
        <select id={`role-${member.id}`} name="role" defaultValue={member.role} className={`${inputClass} w-auto py-1.5`}>
          <option value="member">{t("role.member")}</option>
          <option value="admin">{t("role.admin")}</option>
        </select>
        <SubmitButton variant="secondary" size="sm">
          Update
        </SubmitButton>
      </div>
      {state.status === "error" ? <FormMessage state={state} /> : null}
    </form>
  );
}

function RemoveButton({ member }: { member: MemberRow }) {
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
      {(close) => <RemoveForm member={member} onCancel={close} memberWord={lower(t("member"))} />}
    </DialogButton>
  );
}

function RemoveForm({ member, onCancel, memberWord }: { member: MemberRow; onCancel: () => void; memberWord: string }) {
  const [state, action] = useActionState(removeMember, idle);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="membershipId" value={member.id} />
      <p>
        {member.isYou
          ? "You'll lose access straight away. An admin would need to invite you again."
          : `${member.name} will lose access straight away. Their work stays; anything assigned to them becomes unassigned. You can invite them back later as a ${memberWord}.`}
      </p>
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

export function PendingInvites({ invites }: { invites: InviteRow[] }) {
  const t = useT();
  const [copied, setCopied] = useState<string | null>(null);
  if (invites.length === 0) return <p className="text-ink-muted">No pending invitations.</p>;
  return (
    <ul className="divide-y divide-rule border-y border-rule">
      {invites.map((inv) => (
        <li key={inv.id} className="flex flex-wrap items-center gap-3 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{inv.email}</p>
            <p className="text-sm text-ink-muted">
              {t(`role.${inv.role}`)} · {inv.expired ? <strong className="text-ink">Expired</strong> : `Expires ${inv.expires}`}
            </p>
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
