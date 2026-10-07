"use client";

import { useActionState } from "react";
import { Trash2 } from "lucide-react";
import { deleteTask, updateTask } from "@/app/[orgSlug]/tasks/actions";
import { idle } from "@/lib/action-state";
import { useT } from "@/lib/terminology/context";
import { lower } from "@/lib/terminology/t";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/form-message";
import { DialogButton } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import type { ProjectOption, TaskRow } from "@/lib/queries";
import { keepValues } from "@/lib/forms";

export function TaskEditForm({
  task,
  projects,
  members,
  orgSlug,
}: {
  task: TaskRow;
  projects: ProjectOption[];
  members: { id: string; name: string }[];
  orgSlug: string;
}) {
  const t = useT();
  const [state, action, pending] = useActionState(updateTask, idle);
  const e = state.fieldErrors ?? {};
  return (
    <div className="flex max-w-2xl flex-col gap-4">
    <form onSubmit={keepValues(action)} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="id" value={task.id} />
      <Field label="Title" htmlFor="task-title" error={e.title}>
        <Input id="task-title" name="title" required maxLength={200} defaultValue={task.title} invalid={Boolean(e.title)} />
      </Field>
      <Field label="Description" htmlFor="task-description" error={e.description}>
        <Textarea id="task-description" name="description" rows={5} maxLength={4000} defaultValue={task.description ?? ""} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("project")} htmlFor="task-project" error={e.projectId}>
          <Select id="task-project" name="projectId" defaultValue={task.project_id}>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Status" htmlFor="task-status" error={e.status}>
          <Select id="task-status" name="status" defaultValue={task.status}>
            <option value="todo">{t("status.todo")}</option>
            <option value="in_progress">{t("status.in_progress")}</option>
            <option value="done">{t("status.done")}</option>
          </Select>
        </Field>
        <Field label="Assignee" htmlFor="task-assignee" error={e.assigneeMembershipId}>
          <Select id="task-assignee" name="assigneeMembershipId" defaultValue={task.assignee_membership_id ?? ""}>
            <option value="">Unassigned</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Due date" htmlFor="task-due" error={e.dueDate}>
          <Input id="task-due" name="dueDate" type="date" defaultValue={task.due_date ?? ""} />
        </Field>
      </div>
      <FormMessage state={state} />
      <div className="border-t border-rule pt-4">
        <SubmitButton pending={pending} pendingLabel="Saving…">Save changes</SubmitButton>
      </div>
    </form>
    <div className="flex justify-end">
      <DialogButton
        variant="danger"
        label="Delete"
        icon={<Trash2 aria-hidden className="size-4" />}
        title={`Delete this ${lower(t("task"))}?`}
      >
        {(close) => <DeleteTaskForm id={task.id} title={task.title} orgSlug={orgSlug} onCancel={close} />}
      </DialogButton>
    </div>
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
