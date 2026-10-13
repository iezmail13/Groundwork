"use client";

import { useActionState, useState } from "react";
import { CheckCheck, Save } from "lucide-react";
import { saveAttendance } from "@/app/[orgSlug]/attendance/actions";
import { idle } from "@/lib/action-state";
import { useT } from "@/lib/terminology/context";
import { lower } from "@/lib/terminology/t";
import type { MarkStatus } from "@/lib/attendance-report";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/field";
import { STATUS_ICON } from "./status";

const STATUSES: MarkStatus[] = ["present", "late", "absent", "excused"];

type Entry = { status: MarkStatus | null; note: string };

/**
 * Check-in for one session: a row per participant with four large choices,
 * sized for a phone held in one hand. Nothing is saved until Save.
 */
export function TakeAttendance({
  organizationId,
  eventId,
  roster,
  initial,
  readOnly,
}: {
  organizationId: string;
  eventId: string;
  roster: { id: string; name: string }[];
  initial: Record<string, { status: MarkStatus; note: string | null }>;
  readOnly: boolean;
}) {
  const t = useT();
  const [state, action, pending] = useActionState(saveAttendance, idle);
  const [entries, setEntries] = useState<Record<string, Entry>>(() =>
    Object.fromEntries(roster.map((p) => [p.id, { status: initial[p.id]?.status ?? null, note: initial[p.id]?.note ?? "" }])),
  );
  const set = (id: string, patch: Partial<Entry>) => setEntries((prev) => ({ ...prev, [id]: { ...prev[id]!, ...patch } }));
  const counts = STATUSES.map((s) => ({ s, n: roster.filter((p) => entries[p.id]?.status === s).length }));
  const unmarked = roster.filter((p) => !entries[p.id]?.status).length;

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="eventId" value={eventId} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm" aria-live="polite">
          {counts.map(({ s, n }) => `${t(`attendance.${s}`)} ${n}`).join(" · ")} · Not marked {unmarked}
        </p>
        {!readOnly && unmarked > 0 ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setEntries((prev) => Object.fromEntries(Object.entries(prev).map(([id, e]) => [id, e.status ? e : { ...e, status: "present" }])))}
          >
            <CheckCheck aria-hidden className="size-4" />
            Mark the rest {lower(t("attendance.present"))}
          </Button>
        ) : null}
      </div>

      <ul className="divide-y divide-rule border-y border-rule">
        {roster.map((p) => {
          const entry = entries[p.id]!;
          return (
            <li key={p.id} className="flex flex-col gap-2 py-3 md:flex-row md:items-center md:gap-4">
              <input type="hidden" name={`status.${p.id}`} value={entry.status ?? ""} />
              <input type="hidden" name={`note.${p.id}`} value={entry.note} />
              <span className="font-semibold md:w-56 md:shrink-0">{p.name}</span>
              <fieldset className="grid flex-1 grid-cols-4 gap-1.5" disabled={readOnly}>
                <legend className="sr-only">{p.name}</legend>
                {STATUSES.map((s) => {
                  const Icon = STATUS_ICON[s];
                  return (
                    <label
                      key={s}
                      className="flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-rule px-1 font-heading text-sm font-semibold hover:border-ink has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-on-primary has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:disabled]:cursor-not-allowed"
                    >
                      <input
                        type="radio"
                        className="sr-only"
                        name={`mark-${p.id}`}
                        value={s}
                        checked={entry.status === s}
                        onChange={() => set(p.id, { status: s })}
                      />
                      {/* icons give way to the words on the narrowest phones */}
                      <Icon aria-hidden className="hidden size-4 shrink-0 min-[430px]:inline" />
                      <span className="truncate">{t(`attendance.${s}`)}</span>
                    </label>
                  );
                })}
              </fieldset>
              <details className="md:w-48 md:shrink-0" open={Boolean(entry.note) || undefined}>
                <summary className="cursor-pointer text-sm font-semibold">{entry.note ? "Note" : "Add note"}</summary>
                <label htmlFor={`note-${p.id}`} className="sr-only">
                  Note for {p.name}
                </label>
                <input
                  id={`note-${p.id}`}
                  className={`${inputClass} mt-1 py-1.5 text-sm`}
                  maxLength={500}
                  value={entry.note}
                  readOnly={readOnly}
                  onChange={(ev) => set(p.id, { note: ev.target.value })}
                />
              </details>
              {entry.status && !readOnly ? (
                <Button variant="ghost" size="sm" onClick={() => set(p.id, { status: null })} aria-label={`Clear the mark for ${p.name}`}>
                  Clear
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>

      <FormMessage state={state} />
      {!readOnly ? (
        <div className="sticky bottom-0 -mx-4 border-t border-rule bg-canvas px-4 py-3 sm:static sm:mx-0 sm:border-0 sm:p-0">
          <SubmitButton pending={pending} pendingLabel="Saving…" className="w-full sm:w-auto">
            <Save aria-hidden className="size-4" />
            Save {lower(t("section.attendance"))}
          </SubmitButton>
        </div>
      ) : null}
    </form>
  );
}
