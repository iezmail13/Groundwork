"use client";

import { useActionState, useEffect } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { deleteDocument, updateDocument } from "@/app/[orgSlug]/documents/actions";
import { idle } from "@/lib/action-state";
import { useT } from "@/lib/terminology/context";
import { lower } from "@/lib/terminology/t";
import { DialogButton } from "@/components/ui/modal";
import { Field, Input, Select } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/form-message";
import { Button } from "@/components/ui/button";
import type { ProjectOption } from "@/lib/queries";

type Doc = { id: string; name: string; tags: string[]; project_id: string | null };

export function EditDocumentButton({ doc, projects }: { doc: Doc; projects: ProjectOption[] }) {
  const t = useT();
  return (
    <DialogButton
      variant="ghost"
      size="sm"
      label=""
      ariaLabel={`Edit ${doc.name}`}
      icon={<Pencil aria-hidden className="size-4" />}
      title={`Edit ${lower(t("document"))}`}
    >
      {(close) => <EditForm doc={doc} projects={projects} onDone={close} />}
    </DialogButton>
  );
}

function EditForm({ doc, projects, onDone }: { doc: Doc; projects: ProjectOption[]; onDone: () => void }) {
  const t = useT();
  const [state, action] = useActionState(updateDocument, idle);
  useEffect(() => {
    if (state.status === "success") onDone();
  }, [state, onDone]);
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="id" value={doc.id} />
      <Field label="Name" htmlFor={`doc-name-${doc.id}`} error={e.name}>
        <Input id={`doc-name-${doc.id}`} name="name" required maxLength={255} defaultValue={doc.name} invalid={Boolean(e.name)} />
      </Field>
      <Field label={t("project")} htmlFor={`doc-project-${doc.id}`} error={e.projectId}>
        <Select id={`doc-project-${doc.id}`} name="projectId" defaultValue={doc.project_id ?? ""}>
          <option value="">None</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Tags" htmlFor={`doc-tags-${doc.id}`} hint="Separate with commas." error={e.tags}>
        <Input id={`doc-tags-${doc.id}`} name="tags" maxLength={400} defaultValue={doc.tags.join(", ")} />
      </Field>
      <FormMessage state={state} />
      <div className="flex justify-end gap-2 border-t border-rule pt-4">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <SubmitButton pendingLabel="Saving…">Save changes</SubmitButton>
      </div>
    </form>
  );
}

export function DeleteDocumentButton({ doc }: { doc: Doc }) {
  const t = useT();
  return (
    <DialogButton
      variant="ghost"
      size="sm"
      label=""
      ariaLabel={`Delete ${doc.name}`}
      icon={<Trash2 aria-hidden className="size-4" />}
      title={`Delete this ${lower(t("document"))}?`}
    >
      {(close) => <DeleteForm doc={doc} onDone={close} />}
    </DialogButton>
  );
}

function DeleteForm({ doc, onDone }: { doc: Doc; onDone: () => void }) {
  const [state, action] = useActionState(deleteDocument, idle);
  useEffect(() => {
    if (state.status === "success") onDone();
  }, [state, onDone]);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={doc.id} />
      <p>
        <strong>{doc.name}</strong> will be deleted for everyone. This can&apos;t be undone.
      </p>
      <FormMessage state={state} />
      <div className="flex justify-end gap-2 border-t border-rule pt-4">
        <Button variant="secondary" onClick={onDone}>
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
