"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Trash2, Upload } from "lucide-react";
import {
  deleteParticipantFile,
  finishParticipantUpload,
  requestParticipantUpload,
} from "@/app/[orgSlug]/attendance/file-actions";
import { createClient } from "@/lib/supabase/client";
import { failure, idle, invalid, type ActionState } from "@/lib/action-state";
import { ACCEPT_ATTRIBUTE, FILE_KIND_LABELS, MAX_UPLOAD_BYTES, PARTICIPANT_FILE_KINDS, mimeTypeFor, participantFileMetaInput } from "@/lib/validation";
import { useT } from "@/lib/terminology/context";
import { Field, Input, Select } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/form-message";
import { DialogButton } from "@/components/ui/modal";
import type { Program } from "@/lib/participants";


export function UploadParticipantFileButton({
  organizationId,
  participantId,
  participantName,
  programs,
}: {
  organizationId: string;
  participantId: string;
  participantName: string;
  /** Active programs the viewer manages that the participant is enrolled in. */
  programs: Program[];
}) {
  return (
    <DialogButton
      variant="secondary"
      label="Add a file"
      ariaLabel={`Add a file for ${participantName}`}
      icon={<Upload aria-hidden className="size-4" />}
      title={`Add a file for ${participantName}`}
      description="PDF, Office and OpenDocument files, text, CSV and images, up to 25 MB. Only the people who manage their roster can open it, and every view and download is recorded."
    >
      {(close) => (
        <UploadForm organizationId={organizationId} participantId={participantId} programs={programs} onDone={close} />
      )}
    </DialogButton>
  );
}

function UploadForm({
  organizationId,
  participantId,
  programs,
  onDone,
}: {
  organizationId: string;
  participantId: string;
  programs: Program[];
  onDone: () => void;
}) {
  const t = useT();
  const [state, finish] = useActionState(finishParticipantUpload, idle);
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
    const meta = participantFileMetaInput.safeParse({
      name: String(formData.get("name") || file.name),
      kind: String(formData.get("kind") ?? ""),
      projectId: String(formData.get("projectId") ?? ""),
    });
    if (!meta.success) {
      setLocalError(invalid(meta.error));
      return;
    }
    const mimeType = mimeTypeFor(file.name, file.type);
    startUpload(async () => {
      const ticket = await requestParticipantUpload({
        organizationId,
        projectId: meta.data.projectId,
        participantId,
        fileName: file.name,
        size: file.size,
        mimeType,
      });
      if (!ticket.ok) {
        setLocalError(failure(ticket.message, { file: [ticket.message] }));
        return;
      }
      // storage takes the type from the file itself, so send a copy carrying the checked type
      const body =
        file.type === mimeType ? file : new File([file], file.name, { type: mimeType, lastModified: file.lastModified });
      const { error } = await createClient().storage.from("participant-files").uploadToSignedUrl(ticket.path, ticket.token, body);
      if (error) {
        setLocalError(failure("The upload failed. Check your connection and try again."));
        return;
      }
      const final = new FormData();
      final.set("organizationId", organizationId);
      final.set("projectId", meta.data.projectId);
      final.set("participantId", participantId);
      final.set("storagePath", ticket.path);
      final.set("name", meta.data.name);
      final.set("kind", meta.data.kind);
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
      <Field label="File" htmlFor="pfile-file" error={e.file}>
        <Input
          id="pfile-file"
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
      <Field label="Name" htmlFor="pfile-name" hint="Defaults to the file name." error={e.name}>
        <Input ref={nameRef} id="pfile-name" name="name" maxLength={255} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Kind of file" htmlFor="pfile-kind" error={e.kind}>
          <Select id="pfile-kind" name="kind" defaultValue="other">
            {PARTICIPANT_FILE_KINDS.map((k) => (
              <option key={k} value={k}>
                {FILE_KIND_LABELS[k]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("project")} htmlFor="pfile-program" error={e.projectId}>
          <Select id="pfile-program" name="projectId" defaultValue={programs[0]?.id}>
            {programs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
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

export function DeleteParticipantFileButton({ id, name }: { id: string; name: string }) {
  return (
    <DialogButton
      variant="ghost"
      size="sm"
      label="Delete"
      ariaLabel={`Delete ${name}`}
      icon={<Trash2 aria-hidden className="size-4" />}
      title={`Delete “${name}”?`}
    >
      {(close) => <DeleteForm id={id} onCancel={close} />}
    </DialogButton>
  );
}

function DeleteForm({ id, onCancel }: { id: string; onCancel: () => void }) {
  const [state, action, pending] = useActionState(deleteParticipantFile, idle);
  useEffect(() => {
    if (state.status === "success") onCancel();
  }, [state, onCancel]);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={id} />
      <p>The file is removed for good. The record of who opened it stays, and shows that you deleted it.</p>
      <FormMessage state={state} />
      <div className="flex justify-end gap-2 border-t border-rule pt-4">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <SubmitButton variant="danger" pending={pending} pendingLabel="Deleting…">
          <Trash2 aria-hidden className="size-4" />
          Delete
        </SubmitButton>
      </div>
    </form>
  );
}
