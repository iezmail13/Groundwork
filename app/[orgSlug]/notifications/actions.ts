"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/org";
import { getNotifications, getUnreadCount, NOTIFICATION_TYPES, type NotificationItem } from "@/lib/notifications";
import { failure, formObject, success, type ActionState } from "@/lib/action-state";
import { id } from "@/lib/validation";

// Recipients read and mark only their own notifications (RLS); these actions
// validate input and shape the result for the bell and the full page.

const slug = z.string().regex(/^[a-z0-9-]{1,48}$/);

export type PanelData = { ok: true; items: NotificationItem[]; unread: number } | { ok: false };

/** The latest notifications and the unread count, for the bell's panel. */
export async function loadNotifications(input: { orgSlug: string }): Promise<PanelData> {
  const parsed = z.object({ orgSlug: slug }).safeParse(input);
  if (!parsed.success) return { ok: false };
  const ctx = await getOrgContext(parsed.data.orgSlug);
  const [items, unread] = await Promise.all([getNotifications(ctx.org.id, ctx.base, ctx.t, { limit: 20 }), getUnreadCount(ctx.org.id)]);
  return { ok: true, items, unread };
}

export async function unreadCount(input: { orgSlug: string }): Promise<number | null> {
  const parsed = z.object({ orgSlug: slug }).safeParse(input);
  if (!parsed.success) return null;
  const ctx = await getOrgContext(parsed.data.orgSlug);
  return getUnreadCount(ctx.org.id);
}

export async function markNotification(input: { id: string; read: boolean }): Promise<{ ok: boolean }> {
  const parsed = z.object({ id, read: z.boolean() }).safeParse(input);
  if (!parsed.success) return { ok: false };
  const supabase = await createClient();
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: parsed.data.read ? new Date().toISOString() : null })
    .eq("id", parsed.data.id);
  revalidatePath("/[orgSlug]/notifications", "page");
  return { ok: !error };
}

export async function markAllNotificationsRead(input: { orgSlug: string }): Promise<{ ok: boolean }> {
  const parsed = z.object({ orgSlug: slug }).safeParse(input);
  if (!parsed.success) return { ok: false };
  const ctx = await getOrgContext(parsed.data.orgSlug);
  const supabase = await createClient();
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("organization_id", ctx.org.id)
    .is("read_at", null);
  revalidatePath("/[orgSlug]/notifications", "page");
  return { ok: !error };
}

/**
 * Settings → Notifications: `notify.<type>` is "on" for each kind the viewer
 * wants; every other kind is muted (D103).
 */
export async function saveNotificationSettings(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const raw = formObject(formData);
  const parsed = z.object({ organizationId: id }).safeParse(raw);
  if (!parsed.success) return failure("Invalid request.");
  const org = parsed.data.organizationId;
  const muted = NOTIFICATION_TYPES.filter((type) => raw[`notify.${type}`] !== "on");
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return failure("You've been signed out. Sign in again.");
  const { error: clearError } = await supabase.from("notification_mutes").delete().eq("organization_id", org).eq("user_id", auth.user.id);
  if (clearError) return failure("Couldn't save. Try again.");
  if (muted.length) {
    const { error } = await supabase
      .from("notification_mutes")
      .insert(muted.map((type) => ({ organization_id: org, user_id: auth.user.id, type })));
    if (error) return failure("Couldn't save. Try again.");
  }
  revalidatePath("/[orgSlug]/settings", "page");
  return success("Saved.");
}
