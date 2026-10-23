"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { LogOut, Trash2, UserPlus, Users } from "lucide-react";
import { addAllAdmins, addProjectMember, changeProjectRole, removeProjectMember } from "@/app/[orgSlug]/projects/actions";
import { idle } from "@/lib/action-state";
import { canManageProjectMember, grantableProjectRoles, type ProjectRole, type Role } from "@/lib/roles";
import { useT } from "@/lib/terminology/context";
import { lower } from "@/lib/terminology/t";
import { Badge } from "@/components/ui/badge";
import { ProfilePeek } from "@/components/people/profile-peek";
import { Button } from "@/components/ui/button";
import { DialogButton } from "@/components/ui/modal";
import { Field, inputClass, Select } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";

export type PersonRow = {
  id: string;
  membershipId: string;
  role: ProjectRole;
  orgRole: Role;
  name: string;
  email: string;
  userId: string;
  initials: string;
  photoUrl: string | null;
  title: string | null;
};
export type Candidate = { membershipId: string; name: string; orgRole: Role };

/** Who is on the project, and controls for the people the viewer outranks. */
export function ProjectPeople({
  organizationId,
  projectId,
  orgSlug,
  myRank,
  myMembershipId,
  roster,
  candidates,
  owners,
  adminsToAdd,
  archived,
}: {
  organizationId: string;
  projectId: string;
  orgSlug: string;
  myRank: number;
  myMembershipId: string;
  roster: PersonRow[];
  candidates: Candidate[];
  owners: string[];
  adminsToAdd: number;
  archived: boolean;
}) {
  const t = useT();
  const editable = !archived;
  const canAdd = editable && myRank >= 2 && candidates.length > 0;
  return (
    <div className="flex flex-col gap-3">
      {owners.length ? (
        <p className="text-sm text-ink-muted">
          {t("role.owner", "other")} see every {lower(t("project"))} without being added: {owners.join(", ")}.
        </p>
      ) : null}
      {roster.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-left">
            <caption className="sr-only">People on this {lower(t("project"))}</caption>
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
              {roster.map((p) => {
                const isYou = p.membershipId === myMembershipId;
                const manage = editable && !isYou && canManageProjectMember(myRank, p.role);
                const roles = grantableProjectRoles(myRank, p.orgRole);
                return (
                  <tr key={p.id} className="border-b border-rule">
                    <th scope="row" className="py-2.5 pr-4 font-normal">
                      {/* the name opens their profile card, right here (D112) */}
                      <ProfilePeek
                        person={{ ...p, role: t(`project_role.${p.role}`) }}
                        href={`/${orgSlug}/members/${p.userId}`}
                        isYou={isYou}
                      />
                      {isYou ? <span className="ml-2 text-sm text-ink-muted">(you)</span> : null}
                      <span className="block pl-10 text-sm text-ink-muted">{p.email}</span>
                    </th>
                    <td className="py-2.5 pr-4">
                      {manage && roles.length > 1 ? (
                        <RoleSelect person={p} roles={roles} />
                      ) : (
                        <Badge variant={p.role === "lead" ? "filled" : "outline"}>{t(`project_role.${p.role}`)}</Badge>
                      )}
                    </td>
                    <td className="py-2.5 text-right">
                      {isYou || manage ? <RemoveButton person={p} orgSlug={orgSlug} leaving={isYou} /> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="border-y border-dashed border-rule py-6 text-center text-ink-muted">
          Nobody has been added yet. Only {lower(t("role.owner", "other"))} can see it.
        </p>
      )}
      {canAdd ? <AddPersonForm organizationId={organizationId} projectId={projectId} myRank={myRank} candidates={candidates} /> : null}
      {editable && myRank >= 3 && adminsToAdd > 0 ? (
        <AddAllAdmins organizationId={organizationId} projectId={projectId} count={adminsToAdd} />
      ) : null}
    </div>
  );
}

function RoleSelect({ person, roles }: { person: PersonRow; roles: ProjectRole[] }) {
  const t = useT();
  const [state, action] = useActionState(changeProjectRole, idle);
  return (
    <form action={action} className="flex flex-col gap-1">
      <input type="hidden" name="projectMemberId" value={person.id} />
      <div className="flex items-center gap-2">
        <label htmlFor={`project-role-${person.id}`} className="sr-only">
          Role for {person.name}
        </label>
        <select id={`project-role-${person.id}`} name="role" defaultValue={person.role} className={`${inputClass} w-auto py-1.5`}>
          {roles.map((r) => (
            <option key={r} value={r}>
              {t(`project_role.${r}`)}
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

function RemoveButton({ person, orgSlug, leaving }: { person: PersonRow; orgSlug: string; leaving: boolean }) {
  const t = useT();
  const projectWord = lower(t("project"));
  return (
    <DialogButton
      variant="ghost"
      size="sm"
      label={leaving ? "Leave" : "Remove"}
      icon={leaving ? <LogOut aria-hidden className="size-4" /> : <Trash2 aria-hidden className="size-4" />}
      ariaLabel={leaving ? `Leave this ${projectWord}` : `Remove ${person.name} from this ${projectWord}`}
      title={leaving ? `Leave this ${projectWord}?` : `Remove ${person.name}?`}
    >
      {(close) => <RemoveForm person={person} orgSlug={orgSlug} leaving={leaving} onCancel={close} />}
    </DialogButton>
  );
}

function RemoveForm({ person, orgSlug, leaving, onCancel }: { person: PersonRow; orgSlug: string; leaving: boolean; onCancel: () => void }) {
  const t = useT();
  const [state, action] = useActionState(removeProjectMember, idle);
  const projectWord = lower(t("project"));
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="projectMemberId" value={person.id} />
      <input type="hidden" name="orgSlug" value={orgSlug} />
      <input type="hidden" name="leaving" value={String(leaving)} />
      <p>
        {leaving
          ? `You'll stop seeing this ${projectWord} and everything in it straight away.`
          : `${person.name} will stop seeing this ${projectWord} and everything in it straight away.`}{" "}
        Open {lower(t("task", "other"))} assigned to {leaving ? "you" : "them"} here are unassigned and flagged so
        someone can pick them up.
      </p>
      <FormMessage state={state} />
      <div className="flex justify-end gap-2 border-t border-rule pt-4">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <SubmitButton variant="danger" pendingLabel={leaving ? "Leaving…" : "Removing…"}>
          {leaving ? "Leave" : "Remove"}
        </SubmitButton>
      </div>
    </form>
  );
}

function AddPersonForm({
  organizationId,
  projectId,
  myRank,
  candidates,
}: {
  organizationId: string;
  projectId: string;
  myRank: number;
  candidates: Candidate[];
}) {
  const t = useT();
  const [state, action, pending] = useActionState(addProjectMember, idle);
  const [personId, setPersonId] = useState("");
  const [handled, setHandled] = useState<number | undefined>();
  const formRef = useRef<HTMLFormElement>(null);
  if (state.status === "success" && state.at !== handled) {
    setHandled(state.at);
    setPersonId("");
  }
  const person = candidates.find((c) => c.membershipId === personId);
  const roles = person ? grantableProjectRoles(myRank, person.orgRole) : [];
  const e = state.fieldErrors ?? {};

  useEffect(() => {
    if (state.status === "success") formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-2 border-t border-rule pt-3" aria-label="Add a person">
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="projectId" value={projectId} />
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Person" htmlFor="add-person" error={e.membershipId} className="min-w-56 flex-1">
          <Select id="add-person" name="membershipId" value={personId} onChange={(ev) => setPersonId(ev.target.value)} invalid={Boolean(e.membershipId)}>
            <option value="">Choose someone</option>
            {candidates.map((c) => (
              <option key={c.membershipId} value={c.membershipId}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Role" htmlFor="add-person-role" error={e.role}>
          <Select id="add-person-role" name="role" key={personId} defaultValue={roles.at(-1) ?? "staff"} disabled={!person}>
            {(roles.length ? roles : (["staff"] as ProjectRole[])).map((r) => (
              <option key={r} value={r}>
                {t(`project_role.${r}`)}
              </option>
            ))}
          </Select>
        </Field>
        <SubmitButton pending={pending} pendingLabel="Adding…" disabled={!person}>
          <UserPlus aria-hidden className="size-4" />
          Add
        </SubmitButton>
      </div>
      <FormMessage state={state} />
    </form>
  );
}

function AddAllAdmins({ organizationId, projectId, count }: { organizationId: string; projectId: string; count: number }) {
  const t = useT();
  const [state, action] = useActionState(addAllAdmins, idle);
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="projectId" value={projectId} />
      <SubmitButton variant="secondary" size="sm" pendingLabel="Adding…">
        <Users aria-hidden className="size-4" />
        Add all {lower(t("role.admin", "other"))} ({count})
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
