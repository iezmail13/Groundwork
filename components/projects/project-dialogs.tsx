"use client";

import { useActionState } from "react";
import { Archive, ArchiveRestore, Pencil, Plus, Trash2 } from "lucide-react";
import { DialogButton } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/form-message";
import { deleteProject, setProjectStatus } from "@/app/[orgSlug]/projects/actions";
import { idle } from "@/lib/action-state";
import { useT } from "@/lib/terminology/context";
import { lower } from "@/lib/terminology/t";
import { ProjectForm, type ProjectFormValues } from "./project-form";

type Members = { id: string; name: string }[];

export function NewProjectButton({ organizationId, members }: { organizationId: string; members: Members }) {
  const t = useT();
  return (
    <DialogButton
      label={`New ${lower(t("project"))}`}
      icon={<Plus aria-hidden className="size-4" />}
      title={`New ${lower(t("project"))}`}
    >
      {(close) => <ProjectForm organizationId={organizationId} members={members} onDone={close} />}
    </DialogButton>
  );
}

export function EditProjectButton({
  organizationId,
  members,
  project,
}: {
  organizationId: string;
  members: Members;
  project: ProjectFormValues;
}) {
  const t = useT();
  return (
    <DialogButton
      variant="secondary"
      label="Edit"
      icon={<Pencil aria-hidden className="size-4" />}
      title={`Edit ${lower(t("project"))}`}
    >
      {(close) => <ProjectForm organizationId={organizationId} members={members} project={project} onDone={close} />}
    </DialogButton>
  );
}

export function ArchiveProjectButton({ id, archived }: { id: string; archived: boolean }) {
  return (
    <form action={setProjectStatus}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={archived ? "active" : "archived"} />
      <SubmitButton variant="secondary">
        {archived ? <ArchiveRestore aria-hidden className="size-4" /> : <Archive aria-hidden className="size-4" />}
        {archived ? "Restore" : "Archive"}
      </SubmitButton>
    </form>
  );
}

export function DeleteProjectButton({ id, orgSlug, name }: { id: string; orgSlug: string; name: string }) {
  const t = useT();
  return (
    <DialogButton
      variant="danger"
      label="Delete"
      icon={<Trash2 aria-hidden className="size-4" />}
      title={`Delete ${lower(t("project"))}?`}
    >
      {(close) => <DeleteProjectForm id={id} orgSlug={orgSlug} name={name} onCancel={close} />}
    </DialogButton>
  );
}

function DeleteProjectForm({ id, orgSlug, name, onCancel }: { id: string; orgSlug: string; name: string; onCancel: () => void }) {
  const t = useT();
  const [state, action] = useActionState(deleteProject, idle);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="orgSlug" value={orgSlug} />
      <p>
        <strong>{name}</strong> and all of its {lower(t("task", "other"))} will be deleted.{" "}
        {t("event", "other")} and {lower(t("document", "other"))} are kept but unlinked. This can&apos;t be undone.
        Archive it instead if you might need it again.
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
