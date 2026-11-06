"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { dbFailure, failure, formObject, invalid, success, type ActionState } from "@/lib/action-state";
import { LOGO_EXTENSION, MAX_PHOTO_BYTES, PRESENCE_MODES, id, photoUploadInput, profileInput } from "@/lib/validation";
import { DEMO_ONLY } from "@/lib/demo";
import { inDemo } from "@/lib/demo-server";

// Member profiles (D104). People change only their own profile and photo;
// the database enforces it (profiles RLS, column grants, set_my_photo()).

const BUCKET = "profile-photos";

function revalidateOrg() {
  revalidatePath("/[orgSlug]", "layout");
}

async function me() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return { supabase, user: data.user };
}

/** Settings → Profile: name (the display name), title and bio. Email comes from sign-in. */
export async function updateMyProfile(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = profileInput.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  const { supabase, user } = await me();
  if (!user) return failure("Sign in again to change this.");
  const { error } = await supabase
    .from("profiles")
    .update({ full_name: parsed.data.fullName, title: parsed.data.title, bio: parsed.data.bio })
    .eq("id", user.id);
  if (error) return dbFailure(error);
  revalidateOrg();
  return success("Saved.");
}

/** Online, Do not disturb (which also mutes notifications), or Appear offline. */
export async function setPresenceMode(input: { mode: string }): Promise<{ ok: boolean }> {
  const parsed = z.object({ mode: z.enum(PRESENCE_MODES) }).safeParse(input);
  if (!parsed.success) return { ok: false };
  const { supabase, user } = await me();
  if (!user) return { ok: false };
  const { error } = await supabase.from("profiles").update({ presence_mode: parsed.data.mode }).eq("id", user.id);
  revalidateOrg();
  return { ok: !error };
}

export type PhotoTicket = { ok: true; path: string; token: string } | { ok: false; message: string };

/** Step 1 of a photo upload: a signed upload URL in the caller's own folder. */
export async function requestPhotoUpload(input: { organizationId: string; size: number; mimeType: string }): Promise<PhotoTicket> {
  const parsed = photoUploadInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "That photo can't be used." };
  const { supabase, user } = await me();
  if (!user) return { ok: false, message: "Sign in again to change this." };
  const ext = LOGO_EXTENSION[parsed.data.mimeType];
  const path = `${parsed.data.organizationId}/profiles/${user.id}/${crypto.randomUUID()}.${ext}`;
  if (await inDemo(supabase)) return { ok: false, message: DEMO_ONLY };
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, message: "Couldn't start the upload. Try again." };
  return { ok: true, path: data.path, token: data.token };
}

/** Step 2: check what storage received, make it the photo, and delete the one it replaces. */
export async function finishPhotoUpload(input: { organizationId: string; path: string }): Promise<ActionState> {
  const parsed = z.object({ organizationId: id, path: z.string().min(1).max(300) }).safeParse(input);
  if (!parsed.success) return failure("Invalid request.");
  const { supabase, user } = await me();
  if (!user) return failure("Sign in again to change this.");
  const { organizationId, path } = parsed.data;
  if (!path.startsWith(`${organizationId}/profiles/${user.id}/`)) return failure("That upload doesn't belong to you.");
  const { data: info } = await supabase.storage.from(BUCKET).info(path);
  const mime = (info?.contentType ?? "").split(";")[0]!.trim();
  if (!info || (info.size ?? 0) > MAX_PHOTO_BYTES || !(mime in LOGO_EXTENSION)) {
    await supabase.storage.from(BUCKET).remove([path]);
    return failure("Use a PNG, JPG or WebP image up to 5 MB.");
  }
  const { data: old, error } = await supabase.rpc("set_my_photo", { org_id: organizationId, path });
  if (error) {
    await supabase.storage.from(BUCKET).remove([path]);
    return dbFailure(error);
  }
  if (old) await supabase.storage.from(BUCKET).remove([old]);
  revalidateOrg();
  return success("Photo saved.");
}

export async function removePhoto(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({ organizationId: id }).safeParse(formObject(formData));
  if (!parsed.success) return failure("Invalid request.");
  const { supabase, user } = await me();
  if (!user) return failure("Sign in again to change this.");
  const { data: old, error } = await supabase.rpc("set_my_photo", { org_id: parsed.data.organizationId, path: null as unknown as string });
  if (error) return dbFailure(error);
  if (old) await supabase.storage.from(BUCKET).remove([old]);
  revalidateOrg();
  return success("Photo removed. Your initials show instead.");
}

/** "Mute notifications from [name]": only the viewer sees or changes it. */
export async function setPersonMuted(input: { organizationId: string; userId: string; muted: boolean }): Promise<{ ok: boolean }> {
  const parsed = z.object({ organizationId: id, userId: id, muted: z.boolean() }).safeParse(input);
  if (!parsed.success) return { ok: false };
  const { supabase, user } = await me();
  if (!user) return { ok: false };
  const { organizationId, userId, muted } = parsed.data;
  const { error } = muted
    ? await supabase.from("notification_mutes").insert({ organization_id: organizationId, user_id: user.id, muted_user_id: userId })
    : await supabase.from("notification_mutes").delete().eq("organization_id", organizationId).eq("user_id", user.id).eq("muted_user_id", userId);
  revalidatePath("/[orgSlug]/members/[userId]", "page");
  return { ok: !error || error.code === "23505" };
}
