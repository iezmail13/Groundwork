"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { EyeOff, Share2, Trash2, UserPlus, Users } from "lucide-react";
import { deleteTask, saveTask } from "@/app/[orgSlug]/tasks/actions";
import { idle } from "@/lib/action-state";
import { PresenceBadge } from "@/components/people/presence";
import { useT } from "@/lib/terminology/context";
import { lower } from "@/lib/terminology/t";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/form-message";
import { DialogButton } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import type {
  ProjectOption,
  TaskKind,
  TaskPriority,
  TaskRow,
} from "@/lib/queries";
import { keepValues } from "@/lib/forms";
import { useViewer } from "@/lib/viewer";

export type PersonOption = { value: string; name: string; userId?: string };

const KINDS: TaskKind[] = ["general", "appointed", "personal"];
const PRIORITIES: TaskPriority[] = ["critical", "high", "medium", "low"];

/**
 * The full task form (D101), for a new task or an existing one: where it
 * lives (a project, or none for personal and org-level work), its kind and
 * priority, the people on it, a claim limit for open work, when it counts as
 * done, hiding it from other collaborators, and who it's shared with. Status
 * isn't here: it follows the people on it, and done is a tick.
 */
export function TaskForm({
  task,
  organizationId,
  orgSlug,
  defaultProjectId,
  projects,
  people,
  members,
  canHide,
  canOrgLevel,
  invite,
  sharedWith = [],
}: {
  /** Absent for a new task. */
  task?: TaskRow;
  /** Membership ids on the task's share list. */
  sharedWith?: string[];
  organizationId: string;
  orgSlug: string;
  defaultProjectId?: string;
  projects: ProjectOption[];
  /** Who work in each project ("" for none) can go to: members, owners and pending invitees. */
  people: Record<string, PersonOption[]>;
  /** Everyone in the organization, for the share list. */
  members: { id: string; name: string }[];
  /** Whether the viewer may hide work in each project ("" for none): leads, managers and owners. */
  canHide: Record<string, boolean>;
  /** Managers and owners can put shared work outside any project. */
  canOrgLevel: boolean;
  /** Present when the viewer can invite: where the invite form is, and the projects they can grant. */
  invite: { href: string; projectIds: string[] } | null;
}) {
  const t = useT();
  const { membershipId } = useViewer();
  const [state, action, pending] = useActionState(saveTask, idle);
  const e = state.fieldErrors ?? {};
  const [projectId, setProjectId] = useState(
    task
      ? (task.project_id ?? "")
      : (defaultProjectId ?? projects[0]?.id ?? ""),
  );
  const [kind, setKind] = useState<TaskKind>(task?.kind ?? "general");
  const [chosen, setChosen] = useState<string[]>(
    task
      ? task.assignees.map((a) =>
          a.membership_id ? `m:${a.membership_id}` : `i:${a.invitation_id}`,
        )
      : [],
  );
  const [shareCount, setShareCount] = useState(sharedWith.length);
  const options = people[projectId] ?? [];
  const personal = kind === "personal";
  // shared work can sit outside a project only for managers and owners
  const orgLevelBlocked = projectId === "" && !personal && !canOrgLevel;
  const canInviteHere =
    invite !== null &&
    projectId !== "" &&
    invite.projectIds.includes(projectId);
  const id = task?.id ?? "new";

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <form
        action={action}
        onSubmit={keepValues(action)}
        className="flex flex-col gap-5"
        noValidate
      >
        {task ? <input type="hidden" name="id" value={task.id} /> : null}
        <input type="hidden" name="organizationId" value={organizationId} />
        <input type="hidden" name="orgSlug" value={orgSlug} />
        <Field label="Title" htmlFor={`task-title-${id}`} error={e.title}>
          <Input
            id={`task-title-${id}`}
            name="title"
            required
            maxLength={200}
            defaultValue={task?.title ?? ""}
            invalid={Boolean(e.title)}
          />
        </Field>
        <Field
          label="Description"
          htmlFor={`task-description-${id}`}
          error={e.description}
        >
          <Textarea
            id={`task-description-${id}`}
            name="description"
            rows={4}
            maxLength={4000}
            defaultValue={task?.description ?? ""}
          />
        </Field>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 font-heading text-sm font-semibold">
            Kind
          </legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {KINDS.map((k) => {
              // a personal task stays personal, and nothing else becomes one
              const locked =
                Boolean(task) &&
                (task!.kind === "personal") !== (k === "personal");
              return (
                <label
                  key={k}
                  className={`flex cursor-pointer flex-col gap-0.5 rounded-md border p-3 has-[:checked]:border-ink has-[:checked]:bg-tint has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent ${
                    locked
                      ? "cursor-not-allowed opacity-60"
                      : "border-rule hover:border-ink-muted"
                  }`}
                >
                  <span className="flex items-center gap-2 font-semibold">
                    <input
                      type="radio"
                      name="kind"
                      value={k}
                      checked={kind === k}
                      disabled={locked}
                      onChange={() => setKind(k)}
                      className="size-4 accent-[var(--accent)]"
                    />
                    {t(`task_kind.${k}`)}
                  </span>
                  <span className="text-sm text-ink-muted">
                    {k === "general"
                      ? "Anyone who can see it can claim a spot."
                      : k === "appointed"
                        ? "Given to the people you choose."
                        : "Yours alone; only people ranked above you see it."}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field
            label={t("project")}
            htmlFor={`task-project-${id}`}
            error={e.projectId}
          >
            <Select
              id={`task-project-${id}`}
              name="projectId"
              value={projectId}
              onChange={(ev) => {
                const next = ev.target.value;
                setProjectId(next);
                // keep only the people who can see it there
                const allowed = new Set(
                  (people[next] ?? []).map((o) => o.value),
                );
                setChosen((list) => list.filter((v) => allowed.has(v)));
              }}
            >
              <option value="">No {lower(t("project"))}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Priority"
            htmlFor={`task-priority-${id}`}
            error={e.priority}
          >
            <Select
              id={`task-priority-${id}`}
              name="priority"
              defaultValue={task?.priority ?? "medium"}
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {t(`priority.${p}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Due date" htmlFor={`task-due-${id}`} error={e.dueDate}>
            <Input
              id={`task-due-${id}`}
              name="dueDate"
              type="date"
              defaultValue={task?.due_date ?? ""}
            />
          </Field>
        </div>
        {orgLevelBlocked ? (
          <p role="note" className="-mt-2 text-sm font-semibold text-warn-ink">
            Only people who manage the organization can put shared work outside
            a {lower(t("project"))}. Choose one, or make it{" "}
            {lower(t("task_kind.personal"))}.
          </p>
        ) : null}

        {personal ? (
          <input type="hidden" name="completion" value="any" />
        ) : (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 flex items-center gap-2 font-heading text-sm font-semibold">
              <Users aria-hidden className="size-4" />
              People on it
            </legend>
            <p className="text-sm text-ink-muted">
              Choosing yourself claims it. Anyone else is appointed, which takes
              someone ranked above them or someone running the work.
            </p>
            {options.length ? (
              <div className="max-h-56 overflow-y-auto rounded-md border border-rule">
                {options.map((o) => (
                  <div
                    key={o.value}
                    className="flex items-center gap-3 border-b border-rule pr-3 last:border-b-0 hover:bg-tint"
                  >
                    <label className="flex flex-1 cursor-pointer items-center gap-3 px-3 py-2">
                      <input
                        type="checkbox"
                        name="assignee"
                        value={o.value}
                        checked={chosen.includes(o.value)}
                        onChange={(ev) =>
                          setChosen((list) =>
                            ev.target.checked
                              ? [...list, o.value]
                              : list.filter((v) => v !== o.value),
                          )
                        }
                        className="size-4 accent-[var(--accent)]"
                      />
                      <span>
                        {o.name}
                        {o.value === `m:${membershipId}` ? (
                          <span className="text-ink-muted"> (you)</span>
                        ) : null}
                      </span>
                    </label>
                    {o.userId ? <PresenceBadge userId={o.userId} /> : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-ink-muted">
                Nobody can be added here yet.
              </p>
            )}
            {canInviteHere && task ? (
              <p className="text-sm">
                <Link
                  href={`${invite!.href}&task=${task.id}#invite`}
                  className="inline-flex items-center gap-1.5 font-semibold text-accent hover:underline"
                >
                  <UserPlus aria-hidden className="size-4" />
                  Invite someone to assign
                </Link>
                <span className="block text-ink-muted">
                  Opens the invite form. Save any changes here first.
                </span>
              </p>
            ) : null}
            {e.assignees ? (
              <p role="alert" className="text-sm font-semibold text-bad-ink">
                {e.assignees[0]}
              </p>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              {kind === "general" ? (
                <Field
                  label="Claim limit"
                  htmlFor={`task-limit-${id}`}
                  hint="How many people can be on it. Leave empty for no limit."
                  error={e.claimLimit}
                >
                  <Input
                    id={`task-limit-${id}`}
                    name="claimLimit"
                    type="number"
                    min={1}
                    max={1000}
                    inputMode="numeric"
                    defaultValue={task?.claim_limit ?? ""}
                  />
                </Field>
              ) : null}
              {chosen.length > 1 || task?.completion === "all" ? (
                <fieldset className="flex flex-col gap-1.5">
                  <legend className="mb-1 font-heading text-sm font-semibold">
                    When it&apos;s done
                  </legend>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="completion"
                      value="any"
                      defaultChecked={(task?.completion ?? "any") === "any"}
                      className="size-4 accent-[var(--accent)]"
                    />
                    When anyone ticks it
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="completion"
                      value="all"
                      defaultChecked={task?.completion === "all"}
                      className="size-4 accent-[var(--accent)]"
                    />
                    When everyone has ticked their part
                  </label>
                </fieldset>
              ) : (
                <input
                  type="hidden"
                  name="completion"
                  value={task?.completion ?? "any"}
                />
              )}
            </div>
          </fieldset>
        )}

        {canHide[projectId] && !personal ? (
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              name="hidden"
              defaultChecked={task?.hidden ?? false}
              className="mt-1 size-4 accent-[var(--accent)]"
            />
            <span>
              <span className="flex items-center gap-1.5 font-semibold">
                <EyeOff aria-hidden className="size-4" />
                Hide from other collaborators
              </span>
              <span className="block text-sm text-ink-muted">
                Only the people on it, whoever made it, people ranked above them
                and whoever runs the work can see it.
              </span>
            </span>
          </label>
        ) : task?.hidden ? (
          <input type="hidden" name="hidden" value="on" />
        ) : null}

        <details
          className="rounded-md border border-rule"
          open={sharedWith.length > 0}
        >
          <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 font-heading text-sm font-semibold">
            <Share2 aria-hidden className="size-4" />
            Share with specific people
            {shareCount ? (
              <span className="font-normal text-ink-muted">({shareCount})</span>
            ) : null}
          </summary>
          <div className="flex flex-col gap-2 border-t border-rule p-3">
            <p className="text-sm text-ink-muted">
              They can see it even if it&apos;s hidden or{" "}
              {lower(t("task_kind.personal"))}
              {projectId
                ? `, as long as they're on the ${lower(t("project"))}`
                : ""}
              . Outside a {lower(t("project"))}, a share list narrows who sees
              it to these people.
            </p>
            <div className="max-h-48 overflow-y-auto">
              {members
                .filter((m) => m.id !== membershipId)
                .map((m) => (
                  <label
                    key={m.id}
                    className="flex cursor-pointer items-center gap-3 py-1"
                  >
                    <input
                      type="checkbox"
                      name="share"
                      value={m.id}
                      defaultChecked={sharedWith.includes(m.id)}
                      onChange={(ev) =>
                        setShareCount((n) => n + (ev.target.checked ? 1 : -1))
                      }
                      className="size-4 accent-[var(--accent)]"
                    />
                    {m.name}
                  </label>
                ))}
            </div>
          </div>
        </details>

        <FormMessage state={state} />
        <div className="border-t border-rule pt-4">
          <SubmitButton
            pending={pending}
            disabled={orgLevelBlocked}
            pendingLabel="Saving…"
          >
            {task ? "Save changes" : `Create ${lower(t("task"))}`}
          </SubmitButton>
        </div>
      </form>
      {task ? (
        <div className="flex justify-end">
          <DialogButton
            variant="danger"
            label="Delete"
            icon={<Trash2 aria-hidden className="size-4" />}
            title={`Delete this ${lower(t("task"))}?`}
          >
            {(close) => (
              <DeleteTaskForm
                id={task.id}
                title={task.title}
                orgSlug={orgSlug}
                onCancel={close}
              />
            )}
          </DialogButton>
        </div>
      ) : null}
    </div>
  );
}

function DeleteTaskForm({
  id,
  title,
  orgSlug,
  onCancel,
}: {
  id: string;
  title: string;
  orgSlug: string;
  onCancel: () => void;
}) {
  const [state, action] = useActionState(deleteTask, idle);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="orgSlug" value={orgSlug} />
      <p>
        <strong>{title}</strong> will be deleted. This can&apos;t be undone.
      </p>
      <FormMessage state={state} />
      <div className="flex justify-end gap-2 border-t border-rule pt-4">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <SubmitButton variant="danger" pendingLabel="Deleting…">
          <Trash2 aria-hidden className="size-4" />
          Delete permanently
        </SubmitButton>
      </div>
    </form>
  );
}
