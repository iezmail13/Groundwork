"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
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
 * Inline quick-add: type a title and press Enter. When no project is fixed, a
 * project picker appears once there's a title (D112), so it isn't mistaken for
 * a filter; it starts on the project the list is filtered to.
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
  const [typed, setTyped] = useState(false);
  // a saved task clears the title, so the picker hides again until the next one
  const [lastState, setLastState] = useState(state);
  if (state !== lastState) {
    setLastState(state);
    if (state.status === "success") setTyped(false);
  }
  const filtered = useSearchParams().get("project");
  const startProject = projects?.some((p) => p.id === filtered) ? filtered! : projects?.[0]?.id;

  useEffect(() => {
    if (state.status === "success") {
      // clear title and due date so the next task doesn't inherit them
      formRef.current?.reset();
      titleRef.current?.focus();
    }
  }, [state]);

  const noProjects = !projectId && projects && projects.length === 0;
  const titleId = `quick-add-title-${idSuffix}`;

  return (
    <form ref={formRef} action={action} onSubmit={keepValues(action)} className="flex flex-col gap-1.5" aria-label={`Add a ${taskLabel}`}>
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
          onChange={(e) => setTyped(e.target.value.trim() !== "")}
          aria-invalid={state.fieldErrors?.title ? true : undefined}
        />
        {!projectId && projects ? (
          <div className={`flex min-w-0 items-center gap-2 ${compact ? "basis-full" : "flex-[2]"}`} hidden={!typed}>
            <label htmlFor={`quick-add-project-${idSuffix}`} className="shrink-0 text-sm font-semibold text-ink-muted">
              in {lower(t("project"))}
            </label>
            <select
              // starts again on the filtered program whenever the filter changes
              key={startProject}
              id={`quick-add-project-${idSuffix}`}
              name="projectId"
              className={`${inputClass} min-w-0 flex-1`}
              disabled={noProjects}
              defaultValue={startProject}
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        {!compact ? (
          <>
            <label htmlFor={`quick-add-priority-${idSuffix}`} className="sr-only">
              Priority
            </label>
            <select id={`quick-add-priority-${idSuffix}`} name="priority" defaultValue="medium" className={`${inputClass} w-auto flex-1`}>
              {(["critical", "high", "medium", "low"] as const).map((p) => (
                <option key={p} value={p}>
                  {t(`priority.${p}`)}
                </option>
              ))}
            </select>
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
