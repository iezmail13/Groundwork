"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { dbFailure, failure, formObject, invalid, success, type ActionState } from "@/lib/action-state";
import { LOGO_EXTENSION, accentInput, id, logoUploadInput, logoVariant } from "@/lib/validation";
import { THEME_COOKIE, THEME_COOKIE_MAX_AGE, THEME_MODES } from "@/lib/theme/mode";
import { cookies } from "next/headers";

// Settings → Branding (owners and managers) and Settings → Profile (everyone).
// RLS and the column grants are the real guard; these checks give clear
// messages first.

const BUCKET = "branding";
const NOT_ALLOWED = "You don't have permission to change the organization's branding.";

function revalidateOrg() {
  revalidatePath("/[orgSlug]", "layout");
}

async function permissions(organizationId: string) {
  const supabase = await createClient();
  const [{ data: manager }, { data: owner }] = await Promise.all([
    supabase.rpc("has_permission", { org_id: organizationId, required: "manager" }),
    supabase.rpc("has_permission", { org_id: organizationId, required: "owner" }),
  ]);
  return { supabase, manager: Boolean(manager), owner: Boolean(owner) };
}

const checkbox = z
  .union([z.literal("on"), z.literal("")])
  .optional()
  .transform((v) => v === "on");

const brandingInput = z.object({
  organizationId: id,
  accent: accentInput,
  showIllustrations: checkbox,
  allowPersonalAccent: checkbox,
});

/** The accent, the illustrations switch and (owners only) whether people may pick their own accent. */
export async function updateBranding(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = brandingInput.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  const d = parsed.data;
  const { supabase, manager, owner } = await permissions(d.organizationId);
  if (!manager) return failure(NOT_ALLOWED);
  const { error } = await supabase
    .from("organizations")
    .update({
      accent: d.accent,
      show_illustrations: d.showIllustrations,
      ...(owner ? { allow_personal_accent: d.allowPersonalAccent } : {}),
    })
    .eq("id", d.organizationId);
  if (error) return dbFailure(error);
  revalidateOrg();
  return success("Branding saved. Everyone in the organization sees it on their next page.");
}

export type LogoTicket = { ok: true; path: string; token: string } | { ok: false; message: string };

/** Step 1 of a logo upload: checks type and size, and returns a signed upload link. */
export async function requestLogoUpload(input: z.input<typeof logoUploadInput>): Promise<LogoTicket> {
  const parsed = logoUploadInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "That file can't be used as a logo." };
  const { supabase, manager } = await permissions(parsed.data.organizationId);
  if (!manager) return { ok: false, message: NOT_ALLOWED };
  const path = `${parsed.data.organizationId}/branding/${crypto.randomUUID()}.${LOGO_EXTENSION[parsed.data.mimeType]}`;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, message: "Couldn't start the upload. Try again." };
  return { ok: true, path: data.path, token: data.token };
}

const finishInput = z.object({
  organizationId: id,
  variant: logoVariant,
  storagePath: z.string().min(1).max(300),
});

/** Step 2: points the organization at the uploaded file and deletes the one it replaces. */
export async function finishLogoUpload(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = finishInput.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  const d = parsed.data;
  if (!new RegExp(`^${d.organizationId}/branding/[A-Za-z0-9-]+\\.(png|jpg|webp)$`).test(d.storagePath)) {
    return failure("That upload doesn't belong to this organization.");
  }
  const { supabase, manager } = await permissions(d.organizationId);
  if (!manager) return failure(NOT_ALLOWED);

  const { data: org } = await supabase
    .from("organizations")
    .select("logo_path, logo_dark_path")
    .eq("id", d.organizationId)
    .single();
  const column = d.variant === "dark" ? "logo_dark_path" : "logo_path";
  const change = d.variant === "dark" ? { logo_dark_path: d.storagePath } : { logo_path: d.storagePath };
  const { error } = await supabase.from("organizations").update(change).eq("id", d.organizationId);
  if (error) {
    await supabase.storage.from(BUCKET).remove([d.storagePath]);
    return dbFailure(error);
  }
  const previous = org?.[column];
  if (previous && previous !== d.storagePath) await supabase.storage.from(BUCKET).remove([previous]);
  revalidateOrg();
  return success(d.variant === "dark" ? "Dark-mode logo saved." : "Logo saved. It replaces the Groundwork logo in the sidebar.");
}

const removeInput = z.object({ organizationId: id, variant: logoVariant });

/** Removes a logo; with no logo left, the Groundwork logo comes back. */
export async function removeLogo(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = removeInput.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  const d = parsed.data;
  const { supabase, manager } = await permissions(d.organizationId);
  if (!manager) return failure(NOT_ALLOWED);
  const { data: org } = await supabase.from("organizations").select("logo_path, logo_dark_path").eq("id", d.organizationId).single();
  const change = d.variant === "dark" ? { logo_dark_path: null } : { logo_path: null };
  const { error } = await supabase.from("organizations").update(change).eq("id", d.organizationId);
  if (error) return dbFailure(error);
  const previous = d.variant === "dark" ? org?.logo_dark_path : org?.logo_path;
  if (previous) await supabase.storage.from(BUCKET).remove([previous]);
  revalidateOrg();
  return success(d.variant === "dark" ? "Dark-mode logo removed." : "Logo removed. The Groundwork logo is back.");
}

const appearanceInput = z.object({
  themeMode: z.enum(THEME_MODES, { error: "Choose light, dark or system." }),
  accent: accentInput,
});

/** Settings → Profile: the viewer's own mode and accent. */
export async function updateMyAppearance(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = appearanceInput.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return failure("Sign in again to change this.");
  const { error } = await supabase
    .from("profiles")
    .update({ theme_mode: parsed.data.themeMode, accent: parsed.data.accent })
    .eq("id", data.user.id);
  if (error) return dbFailure(error);
  (await cookies()).set(THEME_COOKIE, parsed.data.themeMode, { path: "/", maxAge: THEME_COOKIE_MAX_AGE, sameSite: "lax" });
  revalidateOrg();
  return success("Saved. This only changes how Groundwork looks for you.");
}
