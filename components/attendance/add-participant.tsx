"use client";

import { useActionState, useState } from "react";
import { ClipboardPaste, Plus, Trash2, UserPlus } from "lucide-react";
import { addParticipants } from "@/app/[orgSlug]/attendance/actions";
import { idle } from "@/lib/action-state";
import { useT } from "@/lib/terminology/context";
import { lower } from "@/lib/terminology/t";
import { DialogButton } from "@/components/ui/modal";
import { Field, inputClass, Select, Textarea } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { Button } from "@/components/ui/button";
import { keepValues } from "@/lib/forms";
import { parsePastedPeople, type NewPersonRow as Row } from "@/lib/people-paste";

const EMPTY: Row = { name: "", email: "", phone: "", guardianName: "", emergencyContact: "" };
const COLUMNS: { key: keyof Row; label: string; type?: string; max: number }[] = [
  { key: "name", label: "Full name", max: 120 },
  { key: "email", label: "Email", type: "email", max: 254 },
  { key: "phone", label: "Phone", type: "tel", max: 40 },
  { key: "guardianName", label: "Parent or guardian", max: 120 },
  { key: "emergencyContact", label: "Emergency contact", max: 200 },
];

export function AddParticipantButton({
  orgSlug,
  programs,
  programId,
}: {
  orgSlug: string;
  /** Active programs the viewer manages. */
  programs: { id: string; name: string }[];
  programId?: string;
}) {
  const t = useT();
  const plural = lower(t("participant", "other"));
  return (
    <DialogButton
      label={`Add ${plural}`}
      icon={<UserPlus aria-hidden className="size-4" />}
      title={`Add ${plural}`}
      description="One per row, with their details side by side. Paste a list to fill the rows at once."
      wide
    >
      {(close) => <AddPeopleForm orgSlug={orgSlug} programs={programs} programId={programId} onCancel={close} />}
    </DialogButton>
  );
}

/**
 * Adding people as a table (D112): every field for every person on view at
 * once, rows added as needed or filled from a pasted list, all saved together.
 */
function AddPeopleForm({
  orgSlug,
  programs,
  programId,
  onCancel,
}: {
  orgSlug: string;
  programs: { id: string; name: string }[];
  programId?: string;
  onCancel: () => void;
}) {
  const t = useT();
  const [state, action, pending] = useActionState(addParticipants, idle);
  const [rows, setRows] = useState<Row[]>([{ ...EMPTY }, { ...EMPTY }, { ...EMPTY }]);
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState("");
  const e = state.fieldErrors ?? {};
  const filled = rows.filter((r) => Object.values(r).some((v) => v.trim())).length;

  const update = (i: number, key: keyof Row, value: string) => setRows(rows.map((r, j) => (j === i ? { ...r, [key]: value } : r)));

  return (
    <form action={action} onSubmit={keepValues(action)} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="orgSlug" value={orgSlug} />
      <input type="hidden" name="people" value={JSON.stringify(rows)} />
      <Field label={t("project")} htmlFor="participants-program" error={e.projectId} className="max-w-sm">
        <Select id="participants-program" name="projectId" defaultValue={programId ?? programs[0]?.id}>
          {programs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </Field>

      {pasting ? (
        <div className="flex flex-col gap-2 rounded-lg border border-rule p-3">
          <Field
            label="Paste a list"
            htmlFor="participants-paste"
            hint="One person per line: name, email, phone, parent or guardian, emergency contact. Copying rows from a spreadsheet works too."
          >
            <Textarea id="participants-paste" rows={5} value={pasted} onChange={(ev) => setPasted(ev.target.value)} />
          </Field>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                const people = parsePastedPeople(pasted);
                if (people.length) setRows([...rows.filter((r) => Object.values(r).some((v) => v.trim())), ...people]);
                setPasted("");
                setPasting(false);
              }}
            >
              Fill the rows
            </Button>
            <Button variant="ghost" onClick={() => setPasting(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      <div className="max-h-[50vh] overflow-auto">
        <table className="w-full min-w-[820px] border-collapse text-left text-sm">
          <caption className="sr-only">New {lower(t("participant", "other"))}, one per row</caption>
          <thead className="sticky top-0 bg-canvas">
            <tr className="border-b border-ink font-heading">
              <th scope="col" className="w-8 py-2 pr-2">
                <span className="sr-only">Row</span>
              </th>
              {COLUMNS.map((c) => (
                <th key={c.key} scope="col" className="py-2 pr-2 font-semibold">
                  {c.label}
                  {c.key === "name" ? <span className="sr-only"> (needed)</span> : null}
                </th>
              ))}
              <th scope="col" className="py-2">
                <span className="sr-only">Remove</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-rule align-top">
                <th scope="row" className="py-1.5 pr-2 pt-3.5 text-right font-normal text-ink-muted">
                  {i + 1}
                </th>
                {COLUMNS.map((c) => {
                  const error = e[`row-${i}-${c.key}`]?.[0];
                  const inputId = `participant-${i}-${c.key}`;
                  return (
                    <td key={c.key} className="py-1.5 pr-2">
                      <input
                        id={inputId}
                        type={c.type ?? "text"}
                        maxLength={c.max}
                        value={r[c.key]}
                        onChange={(ev) => update(i, c.key, ev.target.value)}
                        aria-label={`${c.label}, row ${i + 1}`}
                        aria-invalid={error ? true : undefined}
                        aria-describedby={error ? `${inputId}-error` : undefined}
                        autoComplete="off"
                        className={`${inputClass} py-1.5 ${error ? "border-bad" : ""}`}
                      />
                      {error ? (
                        <p id={`${inputId}-error`} className="mt-1 text-xs font-semibold text-bad-ink">
                          {error}
                        </p>
                      ) : null}
                    </td>
                  );
                })}
                <td className="py-1.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setRows(rows.length > 1 ? rows.filter((_, j) => j !== i) : [{ ...EMPTY }])}
                    aria-label={`Remove row ${i + 1}`}
                    className="inline-flex size-8 items-center justify-center rounded-md text-ink-muted hover:bg-panel hover:text-bad-ink"
                  >
                    <Trash2 aria-hidden className="size-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={() => setRows([...rows, { ...EMPTY }])}>
          <Plus aria-hidden className="size-4" />
          Add a row
        </Button>
        {!pasting ? (
          <Button variant="ghost" size="sm" onClick={() => setPasting(true)}>
            <ClipboardPaste aria-hidden className="size-4" />
            Paste a list
          </Button>
        ) : null}
      </div>
      <p className="text-sm text-ink-muted">
        Blank rows are skipped. Date of birth and medical notes go on each profile afterwards, where fewer people can see them.
      </p>
      <FormMessage state={state} />
      <div className="flex justify-end gap-2 border-t border-rule pt-4">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <SubmitButton pending={pending} pendingLabel="Adding…" disabled={filled === 0}>
          <UserPlus aria-hidden className="size-4" />
          {filled > 1 ? `Add ${filled} ${lower(t("participant", "other"))}` : `Add ${lower(t("participant"))}`}
        </SubmitButton>
      </div>
    </form>
  );
}
