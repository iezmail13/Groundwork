"use client";

import { useActionState, useEffect, useState } from "react";
import { Lock, Trash2 } from "lucide-react";
import { deleteEvent, saveEvent } from "@/app/[orgSlug]/calendar/actions";
import { idle } from "@/lib/action-state";
import { useT } from "@/lib/terminology/context";
import { lower } from "@/lib/terminology/t";
import { MAX_REPEAT_WEEKS, WEEKDAYS, weekdayOf, weeklyDates } from "@/lib/recurrence";
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
  /** Set when it's one occurrence of a repeating event (D112). */
  seriesId?: string | null;
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
  // the repeat summary reads the date and times as they're typed
  const [dateValue, setDateValue] = useState(event.date);
  const [startValue, setStartValue] = useState(event.startTime);
  const [endValue, setEndValue] = useState(event.endTime);
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
    return <DeleteEvent id={event.id} seriesId={event.seriesId ?? null} title={event.title} onCancel={() => setDeleting(false)} onDone={onDone} />;
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
          <Input id="event-date" name="date" type="date" required defaultValue={event.date} invalid={Boolean(e.date)} onChange={(ev) => setDateValue(ev.target.value)} />
        </Field>
        <Field label="End date" htmlFor="event-end-date" error={e.endDate} hint={allDay ? undefined : "Only if it runs past midnight."}>
          <Input id="event-end-date" name="endDate" type="date" defaultValue={event.endDate === event.date ? "" : event.endDate} />
        </Field>
        {!allDay ? (
          <>
            <Field label="Starts" htmlFor="event-start" error={e.startTime}>
              <Input id="event-start" name="startTime" type="time" required defaultValue={event.startTime} invalid={Boolean(e.startTime)} onChange={(ev) => setStartValue(ev.target.value)} />
            </Field>
            <Field label="Ends" htmlFor="event-end" error={e.endTime}>
              <Input id="event-end" name="endTime" type="time" required defaultValue={event.endTime} invalid={Boolean(e.endTime)} onChange={(ev) => setEndValue(ev.target.value)} />
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
      {event.id ? (
        event.seriesId ? (
          <p className="border-l-4 border-ink pl-3 text-sm">This is one time of a repeating {lower(t("event"))}. Changes here apply to this time only.</p>
        ) : null
      ) : (
        <RepeatFields date={dateValue} startTime={allDay ? null : startValue} endTime={allDay ? null : endValue} errors={e} />
      )}
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

function DeleteEvent({
  id,
  seriesId,
  title,
  onCancel,
  onDone,
}: {
  id: string;
  seriesId: string | null;
  title: string;
  onCancel: () => void;
  onDone: () => void;
}) {
  const [state, action] = useActionState(deleteEvent, idle);
  useEffect(() => {
    if (state.status === "success") onDone();
  }, [state, onDone]);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={id} />
      {seriesId ? <input type="hidden" name="seriesId" value={seriesId} /> : null}
      {seriesId ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1">
            Delete <strong>{title}</strong>? It repeats. This can&apos;t be undone.
          </legend>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="scope" value="one" defaultChecked className="size-4 accent-[var(--accent)]" />
            Only this time
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="scope" value="series" className="size-4 accent-[var(--accent)]" />
            Every time it repeats
          </label>
        </fieldset>
      ) : (
        <p>
          Delete <strong>{title}</strong>? This can&apos;t be undone.
        </p>
      )}
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

/**
 * Repeat weekly on chosen days for a number of weeks (D112), e.g. every Friday
 * for 5 weeks, 4–6 pm. Each time becomes its own event in one series.
 */
function RepeatFields({
  date,
  startTime,
  endTime,
  errors,
}: {
  date: string;
  startTime: string | null;
  endTime: string | null;
  errors: Record<string, string[] | undefined>;
}) {
  const t = useT();
  const [repeat, setRepeat] = useState(false);
  const [days, setDays] = useState<number[]>(() => (date ? [weekdayOf(date)] : []));
  const [weeks, setWeeks] = useState("5");
  // a new start date moves an untouched single day along with it
  const [lastDate, setLastDate] = useState(date);
  if (date !== lastDate) {
    setLastDate(date);
    if (date && lastDate && days.length === 1 && days[0] === weekdayOf(lastDate)) setDays([weekdayOf(date)]);
  }
  const n = Number(weeks);
  const count = date && Number.isInteger(n) && n >= 1 && n <= MAX_REPEAT_WEEKS ? weeklyDates(date, days, n).length : 0;
  const dayNames = WEEKDAYS.filter((d) => days.includes(d.value)).map((d) => d.long);
  return (
    <fieldset className="flex flex-col gap-3 border-y border-rule py-3">
      <legend className="sr-only">Repeat</legend>
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input
          type="checkbox"
          name="repeat"
          value="weekly"
          checked={repeat}
          onChange={(ev) => setRepeat(ev.target.checked)}
          className="size-4 accent-[var(--accent)]"
        />
        Repeats weekly
      </label>
      {repeat ? (
        <>
          <fieldset className="flex flex-col gap-1.5">
            <legend className="text-sm font-semibold">On</legend>
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAYS.map((d) => {
                const on = days.includes(d.value);
                return (
                  <label
                    key={d.value}
                    className={`inline-flex cursor-pointer items-center rounded-md border px-2.5 py-1.5 text-sm font-semibold has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent ${
                      on ? "border-accent bg-accent text-on-accent" : "border-rule"
                    }`}
                  >
                    <input
                      type="checkbox"
                      name="repeatOn"
                      value={d.value}
                      checked={on}
                      onChange={() => setDays(on ? days.filter((x) => x !== d.value) : [...days, d.value])}
                      className="sr-only"
                    />
                    <span aria-hidden>{d.short}</span>
                    <span className="sr-only">{d.long}</span>
                  </label>
                );
              })}
            </div>
            {errors.repeatOn ? <p className="text-sm font-semibold text-bad-ink">{errors.repeatOn[0]}</p> : null}
          </fieldset>
          <label className="flex flex-wrap items-center gap-2 text-sm font-semibold">
            For
            <input
              name="repeatWeeks"
              type="number"
              min={1}
              max={MAX_REPEAT_WEEKS}
              value={weeks}
              onChange={(ev) => setWeeks(ev.target.value)}
              className="w-20 rounded-md border border-rule bg-canvas px-2 py-1.5"
              aria-describedby="repeat-summary"
            />
            weeks
          </label>
          {errors.repeatWeeks ? <p className="text-sm font-semibold text-bad-ink">{errors.repeatWeeks[0]}</p> : null}
          <p id="repeat-summary" className="text-sm text-ink-muted" aria-live="polite">
            {count && dayNames.length
              ? `Every ${dayNames.join(", ")} for ${n} ${n === 1 ? "week" : "weeks"}${startTime && endTime ? `, ${startTime}–${endTime}` : ""}: ${count} ${count === 1 ? "time" : "times"}, each its own ${lower(t("event"))}.`
              : "Pick the days and how many weeks."}
          </p>
        </>
      ) : null}
    </fieldset>
  );
}
