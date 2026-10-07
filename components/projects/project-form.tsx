"use client";

import { useActionState, useEffect } from "react";
import { createProject, updateProject } from "@/app/[orgSlug]/projects/actions";
import { idle } from "@/lib/action-state";
import { PROJECT_COLORS, DEFAULT_PROJECT_COLOR } from "@/lib/palette";
import { useT } from "@/lib/terminology/context";
import { lower } from "@/lib/terminology/t";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/form-message";
import { Button } from "@/components/ui/button";
import { keepValues } from "@/lib/forms";

export type ProjectFormValues = {
  id?: string;
  name: string;
  description: string | null;
  color: string | null;
  owner_membership_id: string | null;
  start_date: string | null;
  end_date: string | null;
};

export function ProjectForm({
  organizationId,
  members,
  project,
  onDone,
}: {
  organizationId: string;
  members: { id: string; name: string }[];
  project?: ProjectFormValues;
  onDone: () => void;
}) {
  const t = useT();
  const [state, action, pending] = useActionState(project?.id ? updateProject : createProject, idle);
  const errors = state.fieldErrors ?? {};

  useEffect(() => {
    if (state.status === "success") onDone();
  }, [state, onDone]);

  return (
    <form onSubmit={keepValues(action)} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="organizationId" value={organizationId} />
      {project?.id ? <input type="hidden" name="id" value={project.id} /> : null}
      <Field label="Name" htmlFor="project-name" error={errors.name}>
        <Input
          id="project-name"
          name="name"
          required
          maxLength={120}
          defaultValue={project?.name}
          invalid={Boolean(errors.name)}
          autoFocus
        />
      </Field>
      <Field label="Description" htmlFor="project-description" error={errors.description}>
        <Textarea id="project-description" name="description" maxLength={4000} defaultValue={project?.description ?? ""} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Owner" htmlFor="project-owner" error={errors.ownerMembershipId}>
          <Select id="project-owner" name="ownerMembershipId" defaultValue={project?.owner_membership_id ?? ""}>
            <option value="">No owner</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
        </Field>
        <fieldset>
          <legend className="mb-1.5 font-heading text-sm font-semibold">Colour</legend>
          <div className="flex flex-wrap gap-2">
            {PROJECT_COLORS.map((c) => (
              <label key={c.value} className="cursor-pointer" title={c.name}>
                <input
                  type="radio"
                  name="color"
                  value={c.value}
                  defaultChecked={(project?.color ?? DEFAULT_PROJECT_COLOR) === c.value}
                  className="peer sr-only"
                />
                <span className="sr-only">{c.name}</span>
                <span
                  aria-hidden
                  className="block size-7 rounded-full border border-rule ring-ink ring-offset-2 ring-offset-canvas peer-checked:ring-2 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-ink"
                  style={{ background: c.value }}
                />
              </label>
            ))}
          </div>
        </fieldset>
        <Field label="Start date" htmlFor="project-start" error={errors.startDate}>
          <Input id="project-start" name="startDate" type="date" defaultValue={project?.start_date ?? ""} />
        </Field>
        <Field label="End date" htmlFor="project-end" error={errors.endDate}>
          <Input
            id="project-end"
            name="endDate"
            type="date"
            defaultValue={project?.end_date ?? ""}
            invalid={Boolean(errors.endDate)}
          />
        </Field>
      </div>
      <FormMessage state={state} />
      <div className="flex justify-end gap-2 border-t border-rule pt-4">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <SubmitButton pending={pending} pendingLabel="Saving…">
          {project?.id ? "Save changes" : `Create ${lower(t("project"))}`}
        </SubmitButton>
      </div>
    </form>
  );
}
