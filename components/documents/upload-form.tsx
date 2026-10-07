"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Upload } from "lucide-react";
import { finishUpload, requestUpload } from "@/app/[orgSlug]/documents/actions";
import { createClient } from "@/lib/supabase/client";
import { failure, idle, invalid, type ActionState } from "@/lib/action-state";
import { ACCEPT_ATTRIBUTE, MAX_UPLOAD_BYTES, documentMetaInput, mimeTypeFor } from "@/lib/validation";
import { useT } from "@/lib/terminology/context";
import { lower } from "@/lib/terminology/t";
import { Field, Input, Select } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { DialogButton } from "@/components/ui/modal";
import type { ProjectOption } from "@/lib/queries";

export function UploadButton({
  organizationId,
  projects,
  projectId,
  variant = "primary",
}: {
  organizationId: string;
  projects: ProjectOption[];
  projectId?: string;
  variant?: "primary" | "secondary";
}) {
  const t = useT();
  return (
    <DialogButton
      variant={variant}
      label="Upload"
      ariaLabel={`Upload a ${lower(t("document"))}`}
      icon={<Upload aria-hidden className="size-4" />}
      title={`Upload a ${lower(t("document"))}`}
      description="PDF, Office and OpenDocument files, text, CSV, Markdown and images, up to 25 MB."
    >
      {(close) => (
        <UploadForm organizationId={organizationId} projects={projects} projectId={projectId} onDone={close} />
      )}
    </DialogButton>
  );
}

function UploadForm({
  organizationId,
  projects,
  projectId,
  onDone,
}: {
  organizationId: string;
  projects: ProjectOption[];
  projectId?: string;
  onDone: () => void;
}) {
  const t = useT();
  const [state, finish] = useActionState(finishUpload, idle);
  const [localError, setLocalError] = useState<ActionState | null>(null);
  const [uploading, startUpload] = useTransition();
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.status === "success") onDone();
  }, [state, onDone]);

  const submit = (formData: FormData) => {
    setLocalError(null);
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      setLocalError(failure("Choose a file to upload.", { file: ["Choose a file to upload."] }));
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setLocalError(failure("Files can be at most 25 MB.", { file: ["Files can be at most 25 MB."] }));
      return;
    }
    // check name, tags and project before sending the file, so a typo never
    // leaves an orphaned copy in storage
    const meta = documentMetaInput.safeParse({
      name: String(formData.get("name") || file.name).trim(),
      projectId: String(formData.get("projectId") ?? "") || undefined,
      tags: String(formData.get("tags") ?? "").trim() || undefined,
    });
    if (!meta.success) {
      setLocalError(invalid(meta.error));
      return;
    }
    const mimeType = mimeTypeFor(file.name, file.type);
    startUpload(async () => {
      const ticket = await requestUpload({ organizationId, fileName: file.name, size: file.size, mimeType });
      if (!ticket.ok) {
        setLocalError(failure(ticket.message, { file: [ticket.message] }));
        return;
      }
      // storage takes the type from the file itself (it ignores contentType for
      // files), so send a copy that carries the type the ticket was issued for
      const body =
        file.type === mimeType ? file : new File([file], file.name, { type: mimeType, lastModified: file.lastModified });
      const { error } = await createClient().storage.from("documents").uploadToSignedUrl(ticket.path, ticket.token, body);
      if (error) {
        setLocalError(failure("The upload failed. Check your connection and try again."));
        return;
      }
      const final = new FormData();
      final.set("organizationId", organizationId);
      final.set("storagePath", ticket.path);
      final.set("name", String(formData.get("name") || file.name));
      final.set("projectId", String(formData.get("projectId") ?? ""));
      final.set("tags", String(formData.get("tags") ?? ""));
      // updates after an await fall outside the outer transition, so start another
      startUpload(() => finish(final));
    });
  };

  const shown = localError ?? state;
  const e = shown.fieldErrors ?? {};

  return (
    <form
      // submitted by hand: React's automatic reset after a form action would clear the chosen file
      onSubmit={(event) => {
        event.preventDefault();
        submit(new FormData(event.currentTarget));
      }}
      className="flex flex-col gap-4"
      noValidate
    >
      <Field label="File" htmlFor="doc-file" error={e.file}>
        <Input
          id="doc-file"
          name="file"
          type="file"
          required
          accept={ACCEPT_ATTRIBUTE}
          invalid={Boolean(e.file)}
          className="file:mr-3 file:rounded file:border file:border-rule file:bg-panel file:px-2 file:py-1 file:font-heading file:text-sm file:font-semibold file:text-ink"
          onChange={(ev) => {
            const f = ev.target.files?.[0];
            if (f && nameRef.current && !nameRef.current.value) nameRef.current.value = f.name;
          }}
        />
      </Field>
      <Field label="Name" htmlFor="doc-name" hint="Defaults to the file name." error={e.name}>
        <Input ref={nameRef} id="doc-name" name="name" maxLength={255} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("project")} htmlFor="doc-project" error={e.projectId}>
          <Select id="doc-project" name="projectId" defaultValue={projectId ?? ""}>
            <option value="">None</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Tags" htmlFor="doc-tags" hint="Separate with commas." error={e.tags}>
          <Input id="doc-tags" name="tags" maxLength={400} placeholder="budget, forms" />
        </Field>
      </div>
      <FormMessage state={shown} />
      <div className="flex justify-end gap-2 border-t border-rule pt-4">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={uploading}>
          <Upload aria-hidden className="size-4" />
          {uploading ? "Uploading…" : "Upload"}
        </Button>
      </div>
    </form>
  );
}
