"use client";

import { useActionState, useState, useTransition } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Field, Input, Textarea, inputClass } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/form-message";
import { idle } from "@/lib/action-state";
import { keepValues } from "@/lib/forms";
import { editDiscussion, removeDiscussion, startDiscussion } from "@/app/[orgSlug]/discussions/actions";

/** Starting a thread, on the organization's board or a program's (D106). */
export function StartDiscussionForm({
  orgSlug,
  places,
  initialWhere,
  whereLabel,
}: {
  orgSlug: string;
  places: { id: string; name: string }[];
  initialWhere: string;
  whereLabel: string;
}) {
  const [state, action, pending] = useActionState(startDiscussion, idle);
  return (
    <form action={action} onSubmit={keepValues(action)} className="flex flex-col gap-4">
      <input type="hidden" name="orgSlug" value={orgSlug} />
      <Field label={whereLabel} htmlFor="discussion-where" error={state.fieldErrors?.where}>
        <select id="discussion-where" name="where" defaultValue={initialWhere} className={inputClass}>
          <option value="org">Everyone in the organization</option>
          {places.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Title" htmlFor="discussion-title" error={state.fieldErrors?.title}>
        <Input id="discussion-title" name="title" maxLength={200} required invalid={Boolean(state.fieldErrors?.title)} />
      </Field>
      <Field label="What's it about?" htmlFor="discussion-body" error={state.fieldErrors?.body}>
        <Textarea id="discussion-body" name="body" maxLength={8000} required rows={5} invalid={Boolean(state.fieldErrors?.body)} />
      </Field>
      <FormMessage state={state} />
      <SubmitButton pending={pending} pendingLabel="Posting…" className="self-start">
        Post discussion
      </SubmitButton>
    </form>
  );
}

export function EditDiscussion({ discussionId, title, body }: { discussionId: string; title: string; body: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(editDiscussion, idle);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1 rounded border border-rule px-2.5 py-1.5 font-heading text-sm font-semibold hover:bg-panel">
        <Pencil aria-hidden className="size-4" />
        Edit
      </button>
    );
  }
  return (
    <form action={action} className="flex w-full flex-col gap-3">
      <input type="hidden" name="discussionId" value={discussionId} />
      <Field label="Title" htmlFor="edit-title" error={state.fieldErrors?.title}>
        <Input id="edit-title" name="title" defaultValue={title} maxLength={200} required />
      </Field>
      <Field label="What's it about?" htmlFor="edit-body" error={state.fieldErrors?.body}>
        <Textarea id="edit-body" name="body" defaultValue={body} maxLength={8000} required rows={5} />
      </Field>
      <FormMessage state={state} />
      <div className="flex gap-2">
        <SubmitButton pending={pending}>Save</SubmitButton>
        <button type="button" onClick={() => setOpen(false)} className="rounded px-3 py-2 text-sm hover:underline">
          Close
        </button>
      </div>
    </form>
  );
}

export function RemoveDiscussion({ orgSlug, discussionId }: { orgSlug: string; discussionId: string }) {
  const [pending, start] = useTransition();
  const [failed, setFailed] = useState(false);
  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!window.confirm("Remove this discussion and all its replies? This can't be undone.")) return;
          start(async () => {
            const result = await removeDiscussion({ orgSlug, discussionId });
            if (!result.ok) setFailed(true);
          });
        }}
        className="inline-flex items-center gap-1 rounded border border-bad px-2.5 py-1.5 font-heading text-sm font-semibold text-bad-ink hover:bg-panel"
      >
        <Trash2 aria-hidden className="size-4" />
        Remove
      </button>
      {failed ? (
        <p role="alert" className="text-sm text-bad-ink">
          Couldn&apos;t remove it.
        </p>
      ) : null}
    </>
  );
}
