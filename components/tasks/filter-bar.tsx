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
  showStatus,
}: {
  projects: FilterOption[];
  members: FilterOption[];
  showStatus: boolean;
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

  const filters = ["project", "assignee", "status", "due"];
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
      {select("project", t("project"), projects, "All")}
      {select("assignee", "Assignee", [{ value: "me", label: "Me" }, { value: "none", label: "Unassigned" }, ...members], "Anyone")}
      {showStatus
        ? select(
            "status",
            "Status",
            [
              { value: "todo", label: t("status.todo") },
              { value: "in_progress", label: t("status.in_progress") },
              { value: "done", label: t("status.done") },
            ],
            "Any status",
          )
        : null}
      {select(
        "due",
        "Due",
        [
          { value: "overdue", label: "Overdue" },
          { value: "today", label: "Today" },
          { value: "week", label: "Next 7 days" },
          { value: "later", label: "Later" },
          { value: "none", label: "No due date" },
        ],
        "Any time",
      )}
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
