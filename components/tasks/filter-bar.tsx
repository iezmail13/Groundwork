"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { X } from "lucide-react";
import { inputClass } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
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

  const filters = ["project", "assignee", "status", "priority", "due", "order"];
  const active = filters.some((f) => params.get(f));

  const select = (key: string, label: string, options: FilterOption[], allLabel: string) => (
    <div className="flex min-w-40 flex-1 flex-col gap-1 sm:flex-none">
      <label htmlFor={`filter-${key}`} className="font-heading text-xs font-semibold text-ink-muted">
        {label}
      </label>
      <select
        id={`filter-${key}`}
        className={`${inputClass} py-1.5 text-sm`}
        value={params.get(key) ?? ""}
        onChange={(e) => set(key, e.target.value)}
      >
        <option value="">{allLabel}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <div
      role="search"
      aria-label="Filters"
      aria-busy={pending}
      className="flex flex-wrap items-end gap-3 border-b border-rule pb-4"
    >
      {showProject ? select("project", t("project"), projects, "All") : null}
      {select("assignee", "Assignee", [{ value: "me", label: "Me" }, { value: "none", label: "Unassigned" }, ...members], "Anyone")}
      {select(
        "status",
        "Status",
        [
          { value: "todo", label: t("status.todo") },
          { value: "in_progress", label: t("status.in_progress") },
          // finished work is hidden from everyday views; this brings it back
          { value: "done", label: "Completed" },
        ],
        "Open",
      )}
      {select(
        "priority",
        "Priority",
        (["critical", "high", "medium", "low"] as const).map((p) => ({ value: p, label: t(`priority.${p}`) })),
        "Any",
      )}
      {select(
        "due",
        "Due",
        [
          { value: "overdue", label: "Overdue" },
          { value: "today", label: "Today" },
          { value: "soon", label: "Within 3 days" },
          { value: "week", label: "Next 7 days" },
          { value: "ontrack", label: "More than 3 days away" },
          { value: "later", label: "Later" },
          { value: "none", label: "No due date" },
        ],
        "Any time",
      )}
      {showOrder ? select("order", "Order", [{ value: "priority", label: "Most urgent first" }], "Board order") : null}
      {active ? (
        <Button
          variant="ghost"
          size="sm"
          className="mb-0.5"
          onClick={() => {
            const next = new URLSearchParams(params.toString());
            filters.forEach((f) => next.delete(f));
            startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
          }}
        >
          <X aria-hidden className="size-4" />
          Clear filters
        </Button>
      ) : null}
    </div>
  );
}
