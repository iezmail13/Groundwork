"use client";

import { useActionState, useEffect, useState } from "react";
import { Lock, Trash2 } from "lucide-react";
import { deleteEvent, saveEvent } from "@/app/[orgSlug]/calendar/actions";
import { idle } from "@/lib/action-state";
import { useT } from "@/lib/terminology/context";
import { lower } from "@/lib/terminology/t";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/form-message";
import { Button } from "@/components/ui/button";
import type { ProjectOption } from "@/lib/queries";
import { keepValues } from "@/lib/forms";

/** Event values in the viewer's wall-clock time (prepared on the server). */
export type EventFormValues = {
  id?: string;
  title: string;
  description: string | null;
  location: string | null;
  projectId: string | null;
  allDay: boolean;
  date: string;
  endDate: string;
  startTime: string;
  endTime: string;
  canDelete?: boolean;
  /** Why the viewer can't change it, when someone ranked above them made it. */
  locked?: string | null;
};

export function EventForm({
  organizationId,
  projects,
  event,
  onDone,
}: {
  organizationId: string;
  projects: ProjectOption[];
  event: EventFormValues;
  onDone: () => void;
}) {
  const t = useT();
  const [state, action, pending] = useActionState(saveEvent, idle);
  const [allDay, setAllDay] = useState(event.allDay);
  const [deleting, setDeleting] = useState(false);
  // only ever rendered inside an opened dialog, so this runs in the browser
  const [tz] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  const e = state.fieldErrors ?? {};

  useEffect(() => {
    if (state.status === "success") onDone();
  }, [state, onDone]);

  if (event.locked) {
    return (
      <div className="flex flex-col gap-4">
        <p className="flex items-start gap-2 border-l-4 border-ink pl-3 text-sm">
          <Lock aria-hidden className="mt-0.5 size-4 shrink-0" />
          {event.locked}
        </p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
          <dt className="font-semibold">Title</dt>
          <dd>{event.title}</dd>
          <dt className="font-semibold">When</dt>
          <dd>
            {event.date}
            {event.endDate !== event.date ? ` – ${event.endDate}` : ""}
            {event.allDay ? "" : `, ${event.startTime}–${event.endTime}`}
          </dd>
          {event.location ? (
            <>
              <dt className="font-semibold">Location</dt>
              <dd>{event.location}</dd>
            </>
          ) : null}
          {event.description ? (
            <>
              <dt className="font-semibold">Notes</dt>
              <dd className="whitespace-pre-wrap">{event.description}</dd>
            </>
          ) : null}
        </dl>
        <div className="flex justify-end border-t border-rule pt-4">
          <Button variant="secondary" onClick={onDone}>
            Close
          </Button>
        </div>
      </div>
    );
  }

  if (deleting && event.id) {
    return <DeleteEvent id={event.id} title={event.title} onCancel={() => setDeleting(false)} onDone={onDone} />;
  }

  return (
    <form action={action} onSubmit={keepValues(action)} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="timeZone" value={tz} />
      {event.id ? <input type="hidden" name="id" value={event.id} /> : null}
      <Field label="Title" htmlFor="event-title" error={e.title}>
        <Input id="event-title" name="title" required maxLength={200} defaultValue={event.title} invalid={Boolean(e.title)} autoFocus />
      </Field>
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input
          type="checkbox"
          name="allDay"
          checked={allDay}
          onChange={(ev) => setAllDay(ev.target.checked)}
          className="size-4 accent-[var(--accent)]"
        />
        All day
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={allDay ? "Start date" : "Date"} htmlFor="event-date" error={e.date}>
          <Input id="event-date" name="date" type="date" required defaultValue={event.date} invalid={Boolean(e.date)} />
        </Field>
        <Field label="End date" htmlFor="event-end-date" error={e.endDate} hint={allDay ? undefined : "Only if it runs past midnight."}>
          <Input id="event-end-date" name="endDate" type="date" defaultValue={event.endDate === event.date ? "" : event.endDate} />
        </Field>
        {!allDay ? (
          <>
            <Field label="Starts" htmlFor="event-start" error={e.startTime}>
              <Input id="event-start" name="startTime" type="time" required defaultValue={event.startTime} invalid={Boolean(e.startTime)} />
            </Field>
            <Field label="Ends" htmlFor="event-end" error={e.endTime}>
              <Input id="event-end" name="endTime" type="time" required defaultValue={event.endTime} invalid={Boolean(e.endTime)} />
            </Field>
          </>
        ) : null}
        <Field label="Location" htmlFor="event-location" error={e.location}>
          <Input id="event-location" name="location" maxLength={200} defaultValue={event.location ?? ""} />
        </Field>
        <Field label={t("project")} htmlFor="event-project" error={e.projectId}>
          <Select id="event-project" name="projectId" defaultValue={event.projectId ?? ""}>
            <option value="">None</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Notes" htmlFor="event-description" error={e.description}>
        <Textarea id="event-description" name="description" maxLength={4000} defaultValue={event.description ?? ""} />
      </Field>
      {!allDay ? <p className="text-sm text-ink-muted">Times are in your time zone ({tz}).</p> : null}
      <FormMessage state={state} />
      <div className="flex flex-wrap justify-between gap-2 border-t border-rule pt-4">
        {event.id && event.canDelete ? (
          <Button variant="danger" onClick={() => setDeleting(true)}>
            <Trash2 aria-hidden className="size-4" />
            Delete
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onDone}>
            Cancel
          </Button>
          <SubmitButton pending={pending} pendingLabel="Saving…">{event.id ? "Save changes" : `Add ${lower(t("event"))}`}</SubmitButton>
        </div>
      </div>
    </form>
  );
}

function DeleteEvent({ id, title, onCancel, onDone }: { id: string; title: string; onCancel: () => void; onDone: () => void }) {
  const [state, action] = useActionState(deleteEvent, idle);
  useEffect(() => {
    if (state.status === "success") onDone();
  }, [state, onDone]);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={id} />
      <p>
        Delete <strong>{title}</strong>? This can&apos;t be undone.
      </p>
      <FormMessage state={state} />
      <div className="flex justify-end gap-2 border-t border-rule pt-4">
        <Button variant="secondary" onClick={onCancel}>
          Keep it
        </Button>
        <SubmitButton variant="danger" pendingLabel="Deleting…">
          <Trash2 aria-hidden className="size-4" />
          Delete permanently
        </SubmitButton>
      </div>
    </form>
  );
}
