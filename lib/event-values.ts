import { dateInZone, eventEndDate, timeInZone } from "@/lib/dates";
import type { EventRow } from "@/lib/queries";
import type { EventFormValues } from "@/components/calendar/event-form";

/** Prepares an event for the edit form, in the viewer's time zone. */
export function toEventFormValues(e: EventRow, tz: string, canDelete: boolean): EventFormValues {
  const start = new Date(e.starts_at);
  const end = new Date(e.ends_at);
  return {
    id: e.id,
    title: e.title,
    description: e.description,
    location: e.location,
    projectId: e.project_id,
    allDay: e.all_day,
    date: e.all_day ? dateInZone(start, "UTC") : dateInZone(start, tz),
    endDate: eventEndDate(e.ends_at, e.all_day, tz),
    startTime: e.all_day ? "09:00" : timeInZone(start, tz),
    endTime: e.all_day ? "10:00" : timeInZone(end, tz),
    canDelete,
  };
}

export function newEventValues(date: string, projectId: string | null = null): EventFormValues {
  return {
    title: "",
    description: null,
    location: null,
    projectId,
    allDay: false,
    date,
    endDate: date,
    startTime: "09:00",
    endTime: "10:00",
  };
}

