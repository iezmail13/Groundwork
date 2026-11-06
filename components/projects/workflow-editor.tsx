"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, CircleAlert, CircleCheck, Plus, Trash2 } from "lucide-react";
import { saveWorkflow } from "@/app/[orgSlug]/projects/[projectId]/workflow-actions";
import { inputClass } from "@/components/ui/field";

type Draft = { key: string; id?: string; name: string; kind: "open" | "done"; wip: string };

let counter = 0;
const nextKey = () => `new-${++counter}`;

/**
 * Setting a program's steps (D107), for the people who run it. Steps are
 * edited here and saved together; removing a step moves its cards to the
 * first remaining step of the same kind.
 */
export function WorkflowEditor({
  projectId,
  steps,
  templates,
}: {
  projectId: string;
  steps: { id: string; name: string; kind: "open" | "done"; wip_limit: number | null }[];
  templates: { key: string; name: string; steps: { name: string; kind: "open" | "done"; wip_limit?: number }[] }[];
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft[]>(() =>
    steps.map((s) => ({ key: s.id, id: s.id, name: s.name, kind: s.kind, wip: s.wip_limit ? String(s.wip_limit) : "" })),
  );
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, start] = useTransition();

  const update = (key: string, patch: Partial<Draft>) => setDraft((d) => d.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  const moveBy = (index: number, by: number) =>
    setDraft((d) => {
      const next = [...d];
      const [item] = next.splice(index, 1);
      next.splice(index + by, 0, item!);
      return next;
    });

  const save = (list: Draft[], done: string) =>
    start(async () => {
      const res = await saveWorkflow({
        projectId,
        steps: list.map((s) => ({ id: s.id, name: s.name, kind: s.kind, wip_limit: s.kind === "open" && s.wip ? Number(s.wip) : null })),
      });
      setResult(res.ok ? { ok: true, message: done } : { ok: false, message: res.message });
      if (res.ok) router.refresh();
    });

  if (draft.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-ink-muted">
          This board uses the standard columns. Give it its own steps to follow work through a process; each step is either open or done.
        </p>
        <div className="flex flex-wrap gap-2">
          {templates.map((tpl) => (
            <button
              key={tpl.key}
              type="button"
              onClick={() => setDraft(tpl.steps.map((s) => ({ key: nextKey(), name: s.name, kind: s.kind, wip: s.wip_limit ? String(s.wip_limit) : "" })))}
              className="rounded-md border border-rule px-3 py-2 text-left text-sm hover:border-ink-muted hover:bg-panel"
            >
              <span className="block font-heading font-semibold">{tpl.name}</span>
              <span className="text-xs text-ink-muted">{tpl.steps.map((s) => s.name).join(" → ")}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() =>
              setDraft([
                { key: nextKey(), name: "", kind: "open", wip: "" },
                { key: nextKey(), name: "", kind: "done", wip: "" },
              ])
            }
            className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-rule px-3 py-2 font-heading text-sm font-semibold hover:bg-panel"
          >
            <Plus aria-hidden className="size-4" />
            Start from scratch
          </button>
        </div>
        {result ? <Result {...result} /> : null}
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        save(draft, "Steps saved.");
      }}
    >
      <table className="w-full text-left text-sm">
        <caption className="sr-only">Steps, in order</caption>
        <thead>
          <tr className="border-b border-ink font-heading">
            <th scope="col" className="py-2 pr-2">#</th>
            <th scope="col" className="py-2 pr-2">Step</th>
            <th scope="col" className="py-2 pr-2">Kind</th>
            <th scope="col" className="py-2 pr-2">Limit</th>
            <th scope="col" className="py-2">
              <span className="sr-only">Arrange</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {draft.map((s, i) => (
            <tr key={s.key} className="border-b border-rule">
              <td className="py-2 pr-2 tabular-nums">{i + 1}</td>
              <td className="py-2 pr-2">
                <input
                  aria-label={`Step ${i + 1} name`}
                  value={s.name}
                  maxLength={40}
                  required
                  onChange={(e) => update(s.key, { name: e.target.value })}
                  className={inputClass}
                />
              </td>
              <td className="py-2 pr-2">
                <select aria-label={`Step ${i + 1} kind`} value={s.kind} onChange={(e) => update(s.key, { kind: e.target.value as "open" | "done" })} className={inputClass}>
                  <option value="open">Open</option>
                  <option value="done">Done</option>
                </select>
              </td>
              <td className="py-2 pr-2">
                <input
                  aria-label={`Step ${i + 1} limit`}
                  type="number"
                  min={1}
                  max={999}
                  inputMode="numeric"
                  disabled={s.kind === "done"}
                  placeholder="None"
                  value={s.kind === "done" ? "" : s.wip}
                  onChange={(e) => update(s.key, { wip: e.target.value })}
                  className={`${inputClass} w-24`}
                />
              </td>
              <td className="py-2">
                <div className="flex gap-1">
                  <button type="button" disabled={i === 0} onClick={() => moveBy(i, -1)} aria-label={`Move step ${i + 1} up`} className="inline-flex size-8 items-center justify-center rounded border border-rule hover:bg-panel disabled:opacity-40">
                    <ArrowUp aria-hidden className="size-4" />
                  </button>
                  <button type="button" disabled={i === draft.length - 1} onClick={() => moveBy(i, 1)} aria-label={`Move step ${i + 1} down`} className="inline-flex size-8 items-center justify-center rounded border border-rule hover:bg-panel disabled:opacity-40">
                    <ArrowDown aria-hidden className="size-4" />
                  </button>
                  <button type="button" onClick={() => setDraft((d) => d.filter((x) => x.key !== s.key))} aria-label={`Remove step ${i + 1}`} className="inline-flex size-8 items-center justify-center rounded border border-rule hover:bg-panel">
                    <Trash2 aria-hidden className="size-4" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-ink-muted">
        Cards on a removed step move to the first remaining step of the same kind. A limit marks the step when it holds more cards than that.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={draft.length >= 12}
          onClick={() => setDraft((d) => [...d.slice(0, -1), { key: nextKey(), name: "", kind: "open", wip: "" }, ...d.slice(-1)])}
          className="inline-flex items-center gap-1.5 rounded-md border border-rule px-3 py-2 font-heading text-sm font-semibold hover:bg-panel disabled:opacity-40"
        >
          <Plus aria-hidden className="size-4" />
          Add a step
        </button>
        <button type="submit" disabled={pending} className="rounded-md bg-accent px-4 py-2 font-heading text-sm font-semibold text-on-accent disabled:opacity-60">
          {pending ? "Saving…" : "Save steps"}
        </button>
        {steps.length > 0 ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (!window.confirm("Go back to the standard board? Cards keep their status; their steps are cleared.")) return;
              setDraft([]);
              save([], "This board uses the standard columns again.");
            }}
            className="rounded-md px-3 py-2 text-sm text-bad-ink hover:underline"
          >
            Use the standard board
          </button>
        ) : (
          <button type="button" onClick={() => setDraft([])} className="rounded-md px-3 py-2 text-sm hover:underline">
            Cancel
          </button>
        )}
      </div>
      {result ? <Result {...result} /> : null}
    </form>
  );
}

function Result({ ok, message }: { ok: boolean; message: string }) {
  return (
    <p role="status" aria-live="polite" className={`flex items-center gap-2 text-sm ${ok ? "text-good-ink" : "font-semibold text-bad-ink"}`}>
      {ok ? <CircleCheck aria-hidden className="size-4" /> : <CircleAlert aria-hidden className="size-4" />}
      <span className="sr-only">{ok ? "Done: " : "Error: "}</span>
      {message}
    </p>
  );
}
