"use client";

import { useActionState, useEffect, useRef } from "react";
import { Plus } from "lucide-react";
import { createTask } from "@/app/[orgSlug]/tasks/actions";
import { idle } from "@/lib/action-state";
import { useT } from "@/lib/terminology/context";
import { lower } from "@/lib/terminology/t";
import { inputClass } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/form-message";
import type { ProjectOption } from "@/lib/queries";
import { keepValues } from "@/lib/forms";

/**
 * Inline quick-add: type a title and press Enter. When no project is fixed,
 * a project picker sits beside the title.
 */
export function QuickAddTask({
  organizationId,
  projects,
  projectId,
  status,
  compact = false,
  idSuffix = "main",
}: {
  organizationId: string;
  projects?: ProjectOption[];
  projectId?: string;
  status?: "todo" | "in_progress" | "done";
  compact?: boolean;
  idSuffix?: string;
}) {
  const t = useT();
  const [state, action, pending] = useActionState(createTask, idle);
  const formRef = useRef<HTMLFormElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const taskLabel = lower(t("task"));

  useEffect(() => {
    if (state.status === "success") {
      if (titleRef.current) titleRef.current.value = "";
      titleRef.current?.focus();
    }
  }, [state]);

  const noProjects = !projectId && projects && projects.length === 0;
  const titleId = `quick-add-title-${idSuffix}`;

  return (
    <form ref={formRef} onSubmit={keepValues(action)} className="flex flex-col gap-1.5" aria-label={`Add a ${taskLabel}`}>
      <input type="hidden" name="organizationId" value={organizationId} />
      {projectId ? <input type="hidden" name="projectId" value={projectId} /> : null}
      {status ? <input type="hidden" name="status" value={status} /> : null}
      <div className={`flex flex-wrap gap-2 ${compact ? "" : "sm:flex-nowrap"}`}>
        <label htmlFor={titleId} className="sr-only">
          New {taskLabel} title
        </label>
        <input
          ref={titleRef}
          id={titleId}
          name="title"
          required
          maxLength={200}
          placeholder={`Add a ${taskLabel}…`}
          className={`${inputClass} min-w-0 ${compact ? "basis-full" : "flex-[3]"}`}
          disabled={noProjects}
          aria-invalid={state.fieldErrors?.title ? true : undefined}
        />
        {!projectId && projects ? (
          <>
            <label htmlFor={`quick-add-project-${idSuffix}`} className="sr-only">
              {t("project")}
            </label>
            <select
              id={`quick-add-project-${idSuffix}`}
              name="projectId"
              className={`${inputClass} min-w-0 flex-[2]`}
              disabled={noProjects}
              defaultValue={projects[0]?.id}
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </>
        ) : null}
        {!compact ? (
          <>
            <label htmlFor={`quick-add-due-${idSuffix}`} className="sr-only">
              Due date
            </label>
            <input id={`quick-add-due-${idSuffix}`} name="dueDate" type="date" className={`${inputClass} w-auto flex-1`} />
          </>
        ) : null}
        <SubmitButton pending={pending} variant={compact ? "secondary" : "primary"} disabled={noProjects} aria-label={`Add ${taskLabel}`}>
          <Plus aria-hidden className="size-4" />
          {compact ? null : "Add"}
        </SubmitButton>
      </div>
      {noProjects ? (
        <p className="text-sm text-ink-muted">
          Create a {lower(t("project"))} first; every {taskLabel} belongs to one.
        </p>
      ) : null}
      <FormMessage state={state} />
    </form>
  );
}
