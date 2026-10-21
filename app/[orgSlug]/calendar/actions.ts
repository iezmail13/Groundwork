"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { dbFailure, failure, formObject, invalid, success, type ActionState } from "@/lib/action-state";
import { addDays, zonedTimeToUtc } from "@/lib/dates";
import { eventInput, id } from "@/lib/validation";
import { MAX_REPEAT_WEEKS, weeklyDates } from "@/lib/recurrence";

/** "Repeat weekly on these days for N weeks" (D112), only when adding an event. */
const repeatInput = z.discriminatedUnion("repeat", [
  z.object({ repeat: z.literal("none") }),
  z.object({
    repeat: z.literal("weekly"),
    repeatOn: z.array(z.coerce.number().int().min(0).max(6)).min(1, "Pick at least one day."),
    repeatWeeks: z.coerce
      .number({ error: "Say for how many weeks." })
      .int("Use a whole number of weeks.")
      .min(1, "Repeat for at least 1 week.")
      .max(MAX_REPEAT_WEEKS, `Repeat for ${MAX_REPEAT_WEEKS} weeks or fewer.`),
  }),
]);

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
  const repeat = repeatInput.safeParse({
    repeat: formData.get("repeat") === "weekly" && !parsed.data.id ? "weekly" : "none",
    repeatOn: formData.getAll("repeatOn"),
    repeatWeeks: formData.get("repeatWeeks") ?? undefined,
  });
  if (!repeat.success) return invalid(repeat.error);

  if (repeat.data.repeat === "weekly") {
    const d = parsed.data;
    const dates = weeklyDates(d.date, repeat.data.repeatOn, repeat.data.repeatWeeks);
    if (dates.length === 0) return failure("Check the highlighted fields.", { repeatOn: ["None of those days fall in that time."] });
    // an event that runs past midnight keeps its length on every occurrence
    const span = d.endDate ? Math.round((Date.parse(d.endDate) - Date.parse(d.date)) / 86_400_000) : 0;
    const seriesId = crypto.randomUUID();
    const rows = dates.map((date) => ({
      ...toRow({ ...d, date, endDate: span ? addDays(date, span) : undefined }),
      organization_id: d.organizationId,
      created_by: auth.user!.id,
      series_id: seriesId,
    }));
    // one statement: every occurrence is added, or none is
    const { error } = await supabase.from("events").insert(rows);
    if (error) return dbFailure(error);
    revalidatePath("/[orgSlug]", "layout");
    return success(`Added ${rows.length} ${rows.length === 1 ? "time" : "times"}.`);
  }

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
  const parsed = z
    .object({ id, seriesId: id.optional(), scope: z.enum(["one", "series"]).default("one") })
    .safeParse(formObject(formData));
  if (!parsed.success) return failure("Invalid request.");
  const supabase = await createClient();
  const { id: eventId, seriesId, scope } = parsed.data;
  let query = supabase.from("events").delete().eq("id", eventId);
  if (scope === "series" && seriesId) {
    // this time and every later one: earlier times, and the attendance taken
    // at them, stay. RLS still limits it to the times the caller may delete.
    const { data: from } = await supabase.from("events").select("starts_at").eq("id", eventId).eq("series_id", seriesId).maybeSingle();
    if (!from) return failure("This no longer exists. Refresh to see the latest.");
    query = supabase.from("events").delete().eq("series_id", seriesId).gte("starts_at", from.starts_at);
  }
  const { data, error } = await query.select("id");
  if (error) return dbFailure(error);
  if (!data?.length) return failure("Only the person who created this, or someone who manages the organization, can delete it.");
  revalidatePath("/[orgSlug]", "layout");
  return success(data.length === 1 ? "Deleted." : `Deleted ${data.length}.`);
}
