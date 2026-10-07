"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { dbFailure, failure, formObject, invalid, success, type ActionState } from "@/lib/action-state";
import { addDays, zonedTimeToUtc } from "@/lib/dates";
import { eventInput, id } from "@/lib/validation";

function toRow(d: z.infer<typeof eventInput>) {
  const startsAt = d.allDay ? new Date(`${d.date}T00:00:00Z`) : zonedTimeToUtc(d.date, d.startTime!, d.timeZone);
  const endsAt = d.allDay
    ? new Date(`${addDays(d.endDate ?? d.date, 1)}T00:00:00Z`)
    : zonedTimeToUtc(d.endDate ?? d.date, d.endTime!, d.timeZone);
  return {
    title: d.title,
    description: d.description ?? null,
    location: d.location ?? null,
    project_id: d.projectId ?? null,
    all_day: d.allDay,
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
  };
}

function parse(formData: FormData) {
  const raw = formObject(formData);
  return eventInput.safeParse({ ...raw, allDay: raw.allDay === "on" || raw.allDay === "true" });
}

export async function saveEvent(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parse(formData);
  if (!parsed.success) return invalid(parsed.error);
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return failure("You've been signed out. Sign in again.");
  const row = toRow(parsed.data);

  if (parsed.data.id) {
    const { data, error } = await supabase.from("events").update(row).eq("id", parsed.data.id).select("id");
    if (error) return dbFailure(error);
    if (!data?.length) return failure("You can't edit this, or it no longer exists.");
  } else {
    const { error } = await supabase
      .from("events")
      .insert({ ...row, organization_id: parsed.data.organizationId, created_by: auth.user.id });
    if (error) return dbFailure(error);
  }
  revalidatePath("/[orgSlug]", "layout");
  return success("Saved.");
}

export async function deleteEvent(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({ id }).safeParse(formObject(formData));
  if (!parsed.success) return failure("Invalid request.");
  const supabase = await createClient();
  const { data, error } = await supabase.from("events").delete().eq("id", parsed.data.id).select("id");
  if (error) return dbFailure(error);
  if (!data?.length) return failure("Only an admin or the person who created this can delete it.");
  revalidatePath("/[orgSlug]", "layout");
  return success("Deleted.");
}
