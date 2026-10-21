"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowDownWideNarrow, X } from "lucide-react";
import { inputClass } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { FilterMenu } from "@/components/ui/filter-menu";
import { useT } from "@/lib/terminology/context";

export type FilterOption = { value: string; label: string };

/** Filters live in the URL so views are shareable and the server does the work. */
export function FilterBar({
  projects,
  members,
  showOrder = false,
  showProject = true,
}: {
  /** Off on a project's own page. */
  showProject?: boolean;
  projects: FilterOption[];
  members: FilterOption[];
  /** The board's own ordering: by hand, or by priority. */
  showOrder?: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  };

  // one panel of filters (D112): what the work is, whose it is and when it's due.
  // Status is the board's columns already, so finished work is one checkbox, and
  // the board's order is a toggle beside the button, not a filter.
  const fields: { key: string; label: string; options: FilterOption[]; allLabel: string }[] = [
    ...(showProject ? [{ key: "project", label: t("project"), options: projects, allLabel: "All" }] : []),
    {
      key: "assignee",
      label: "Assignee",
      options: [{ value: "me", label: "Me" }, { value: "none", label: "Unassigned" }, ...members],
      allLabel: "Anyone",
    },
    {
      key: "priority",
      label: "Priority",
      options: (["critical", "high", "medium", "low"] as const).map((p) => ({ value: p, label: t(`priority.${p}`) })),
      allLabel: "Any",
    },
    {
      key: "due",
      label: "Due",
      options: [
        { value: "overdue", label: "Overdue" },
        { value: "today", label: "Today" },
        { value: "soon", label: "Within 3 days" },
        { value: "week", label: "Next 7 days" },
        { value: "ontrack", label: "More than 3 days away" },
        { value: "later", label: "Later" },
        { value: "none", label: "No due date" },
      ],
      allLabel: "Any time",
    },
  ];
  // ticks at once, then follows the address once the page has caught up
  const fromUrl = params.get("status") === "done";
  const [finished, setFinished] = useState(fromUrl);
  const [lastFromUrl, setLastFromUrl] = useState(fromUrl);
  if (fromUrl !== lastFromUrl) {
    setLastFromUrl(fromUrl);
    setFinished(fromUrl);
  }
  const urgentFirst = params.get("order") === "priority";
  // what's on, in words, beside the button
  const on = [
    ...fields.flatMap((f) => {
      const value = params.get(f.key);
      const option = value ? f.options.find((o) => o.value === value) : undefined;
      return option ? [{ key: f.key, text: `${f.label}: ${option.label}` }] : [];
    }),
    ...(finished ? [{ key: "status", text: "Including finished work" }] : []),
  ];

  return (
    <div role="search" aria-label="Filters" aria-busy={pending} className="flex flex-wrap items-center gap-2 border-b border-rule pb-4">
      <FilterMenu count={on.length}>
        {fields.map((f) => (
          <div key={f.key} className="flex flex-col gap-1">
            <label htmlFor={`filter-${f.key}`} className="font-heading text-xs font-semibold text-ink-muted">
              {f.label}
            </label>
            <select
              id={`filter-${f.key}`}
              className={`${inputClass} py-1.5 text-sm`}
              value={params.get(f.key) ?? ""}
              onChange={(e) => set(f.key, e.target.value)}
            >
              <option value="">{f.allLabel}</option>
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        ))}
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            checked={finished}
            onChange={(e) => {
              setFinished(e.target.checked);
              set("status", e.target.checked ? "done" : "");
            }}
            className="size-4 accent-[var(--accent)]"
          />
          Include finished work
        </label>
      </FilterMenu>
      {showOrder ? (
        <button
          type="button"
          aria-pressed={urgentFirst}
          onClick={() => set("order", urgentFirst ? "" : "priority")}
          className={`inline-flex h-10 items-center gap-2 rounded-md border px-3 font-heading text-sm font-semibold hover:bg-panel ${
            urgentFirst ? "border-accent text-accent" : "border-rule"
          }`}
        >
          <ArrowDownWideNarrow aria-hidden className="size-4" />
          Most urgent first
        </button>
      ) : null}
      {on.length ? (
        <>
          <ul aria-label="Filters on" className="flex flex-wrap gap-1.5">
            {on.map((o) => (
              <li key={o.key} className="rounded-full border border-rule px-2.5 py-0.5 text-sm">
                {o.text}
              </li>
            ))}
          </ul>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              const next = new URLSearchParams(params.toString());
              [...fields.map((f) => f.key), "status"].forEach((k) => next.delete(k));
              startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
            }}
          >
            <X aria-hidden className="size-4" />
            Clear filters
          </Button>
        </>
      ) : null}
    </div>
  );
}
