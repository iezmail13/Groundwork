"use client";

import { CalendarPlus, MapPin } from "lucide-react";
import { DialogButton } from "@/components/ui/modal";
import { useT } from "@/lib/terminology/context";
import { lower } from "@/lib/terminology/t";
import { newEventValues } from "@/lib/event-values";
import type { ProjectOption } from "@/lib/queries";
import { EventForm, type EventFormValues } from "./event-form";

export function NewEventButton({
  organizationId,
  projects,
  date,
  projectId,
  variant = "secondary",
}: {
  organizationId: string;
  projects: ProjectOption[];
  date: string;
  projectId?: string;
  variant?: "primary" | "secondary";
}) {
  const t = useT();
  return (
    <DialogButton
      variant={variant}
      label={`Add ${lower(t("event"))}`}
      icon={<CalendarPlus aria-hidden className="size-4" />}
      title={`New ${lower(t("event"))}`}
    >
      {(close) => (
        <EventForm
          organizationId={organizationId}
          projects={projects}
          event={newEventValues(date, projectId ?? null)}
          onDone={close}
        />
      )}
    </DialogButton>
  );
}

/** A row in an event list that opens the edit dialog. */
export function EventRowButton({
  organizationId,
  projects,
  values,
  when,
  location,
}: {
  organizationId: string;
  projects: ProjectOption[];
  values: EventFormValues;
  when: string;
  location: string | null;
}) {
  const t = useT();
  return (
    <DialogButton
      variant="ghost"
      className="h-auto w-full justify-start px-2 py-2 text-left font-sans font-normal whitespace-normal"
      label={
        <span className="flex flex-col">
          <span className="font-heading font-semibold">{values.title}</span>
          <span className="flex flex-wrap items-center gap-x-2 text-sm text-ink-muted">
            {when}
            {location ? (
              <span className="inline-flex items-center gap-1">
                <MapPin aria-hidden className="size-3.5" />
                {location}
              </span>
            ) : null}
          </span>
        </span>
      }
      title={`Edit ${lower(t("event"))}`}
    >
      {(close) => <EventForm organizationId={organizationId} projects={projects} event={values} onDone={close} />}
    </DialogButton>
  );
}
