"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { siteOrigin } from "@/lib/urls";

export type FeedResult = { ok: true; url: string | null } | { ok: false; message: string };

/**
 * Turns the viewer's calendar feed on, or replaces its link (the old one stops
 * working at once). The link is returned only here, once: only its digest is
 * stored (D102). These actions take no input.
 */
export async function makeCalendarFeed(): Promise<FeedResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("regenerate_calendar_feed");
  if (error || !data) return { ok: false, message: "Couldn't make a calendar link. Try again." };
  revalidatePath("/[orgSlug]/settings", "page");
  return { ok: true, url: `${await siteOrigin()}/api/calendar/${data}.ics` };
}

/** Turns the viewer's calendar feed off: its link stops working at once. */
export async function turnOffCalendarFeed(): Promise<FeedResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_calendar_feed");
  if (error) return { ok: false, message: "Couldn't turn the calendar feed off. Try again." };
  revalidatePath("/[orgSlug]/settings", "page");
  return { ok: true, url: null };
}
