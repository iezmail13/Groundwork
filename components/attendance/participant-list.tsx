"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Archive, ArchiveRestore } from "lucide-react";
import { setParticipantsArchived } from "@/app/[orgSlug]/attendance/actions";
import { idle } from "@/lib/action-state";
import { useT } from "@/lib/terminology/context";
import { lower } from "@/lib/terminology/t";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";

export type ParticipantListRow = { id: string; name: string; programs: string; contact: string; added: string };

/**
 * The roster as a ruled table. In the active list rows can be ticked and
 * archived together; in the archived list each row has Restore.
 */
export function ParticipantList({
  rows,
  base,
  archived,
  canChange,
  caption,
}: {
  rows: ParticipantListRow[];
  base: string;
  archived: boolean;
  canChange: boolean;
  caption: string;
}) {
  const t = useT();
  const [state, action] = useActionState(setParticipantsArchived, idle);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const allSelected = rows.length > 0 && selected.size === rows.length;
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const selectable = canChange && !archived;

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="archived" value={archived ? "false" : "true"} />
      {selectable ? (
        <div className="flex flex-wrap items-center gap-3">
          <SubmitButton variant="secondary" size="sm" disabled={selected.size === 0} pendingLabel="Archiving…">
            <Archive aria-hidden className="size-4" />
            Archive selected{selected.size ? ` (${selected.size})` : ""}
          </SubmitButton>
          <span className="text-sm text-ink-muted">
            Archived {lower(t("participant", "other"))} leave rosters and check-in; their {lower(t("section.attendance"))} still counts.
          </span>
        </div>
      ) : null}
      <FormMessage state={state} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-left">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-ink font-heading text-sm">
              {selectable ? (
                <th scope="col" className="w-10 py-2">
                  <input
                    type="checkbox"
                    aria-label="Select all"
                    checked={allSelected}
                    onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)))}
                    className="size-4 accent-[var(--accent)]"
                  />
                </th>
              ) : null}
              <th scope="col" className="py-2 pr-4 font-semibold">
                Name
              </th>
              <th scope="col" className="py-2 pr-4 font-semibold">
                {t("project", "other")}
              </th>
              <th scope="col" className="py-2 pr-4 font-semibold">
                Contact
              </th>
              <th scope="col" className="py-2 pr-4 font-semibold">
                Added
              </th>
              {archived && canChange ? (
                <th scope="col" className="py-2">
                  <span className="sr-only">Actions</span>
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-rule hover:bg-tint">
                {selectable ? (
                  <td className="py-2.5">
                    <input
                      type="checkbox"
                      name="ids"
                      value={r.id}
                      checked={selected.has(r.id)}
                      onChange={() => toggle(r.id)}
                      aria-label={`Select ${r.name}`}
                      className="size-4 accent-[var(--accent)]"
                    />
                  </td>
                ) : null}
                <th scope="row" className="py-2.5 pr-4 font-semibold">
                  <Link href={`${base}/attendance/participants/${r.id}`} className="hover:underline">
                    {r.name}
                  </Link>
                </th>
                <td className="py-2.5 pr-4 text-sm">{r.programs || "—"}</td>
                <td className="py-2.5 pr-4 text-sm break-all">{r.contact || "—"}</td>
                <td className="py-2.5 pr-4 text-sm whitespace-nowrap">{r.added}</td>
                {archived && canChange ? (
                  <td className="py-2.5 text-right">
                    <SubmitButton variant="ghost" size="sm" name="ids" value={r.id} aria-label={`Restore ${r.name}`}>
                      <ArchiveRestore aria-hidden className="size-4" />
                      Restore
                    </SubmitButton>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </form>
  );
}
