"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { dbFailure, failure, formObject, invalid, success, type ActionState } from "@/lib/action-state";
import { LABEL_KEYS, SINGLE_FORM_KEYS, type LabelMap } from "@/lib/terminology/defaults";
import { validateTheme } from "@/lib/theme/theme";
import { normalizeHex } from "@/lib/theme/color";
import { id, slugInput } from "@/lib/validation";
import { siteOrigin } from "@/lib/urls";

function revalidateOrg() {
  revalidatePath("/[orgSlug]", "layout");
}

/** Every settings change is admin-only; RLS enforces it, this gives a clear message first. */
async function requireAdmin(organizationId: string) {
  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("has_role", { org_id: organizationId, required: "admin" });
  return { supabase, isAdmin: Boolean(isAdmin) };
}

const NOT_ADMIN = "Only admins can change settings.";

export async function setPreset(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z
    .object({ organizationId: id, preset: z.string().regex(/^[a-z][a-z0-9_]{1,31}$/, "Choose a preset.") })
    .safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  const { supabase, isAdmin } = await requireAdmin(parsed.data.organizationId);
  if (!isAdmin) return failure(NOT_ADMIN);
  const { error } = await supabase
    .from("organizations")
    .update({ preset_key: parsed.data.preset })
    .eq("id", parsed.data.organizationId);
  if (error) return dbFailure(error);
  revalidateOrg();
  return success("Preset applied. Every label in the app now uses its words.");
}

const labelValue = z.string().max(40, "Keep labels under 40 characters.").optional();

export async function saveTerminology(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const raw = formObject(formData);
  const orgId = id.safeParse(raw.organizationId);
  if (!orgId.success) return failure("Invalid request.");

  const overrides: LabelMap = {};
  const fieldErrors: Record<string, string[]> = {};
  for (const key of LABEL_KEYS) {
    const one = labelValue.safeParse(raw[`${key}.one`]);
    const other = labelValue.safeParse(SINGLE_FORM_KEYS.has(key) ? raw[`${key}.one`] : raw[`${key}.other`]);
    if (!one.success) fieldErrors[`${key}.one`] = [one.error.issues[0]!.message];
    if (!other.success) fieldErrors[`${key}.other`] = [other.error.issues[0]!.message];
    if (one.success && other.success && (one.data || other.data)) {
      overrides[key] = { ...(one.data ? { one: one.data } : {}), ...(other.data ? { other: other.data } : {}) };
    }
  }
  if (Object.keys(fieldErrors).length) return failure("Some labels are too long.", fieldErrors);

  const { supabase, isAdmin } = await requireAdmin(orgId.data);
  if (!isAdmin) return failure(NOT_ADMIN);
  const { error } = await supabase.from("organizations").update({ terminology_overrides: overrides }).eq("id", orgId.data);
  if (error) return dbFailure(error);
  revalidateOrg();
  return success(Object.keys(overrides).length ? "Labels saved." : "Custom labels cleared. The preset's words are back.");
}

export async function saveTheme(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z
    .object({
      organizationId: id,
      navy: z.string().regex(/^#?[0-9a-fA-F]{6}$/, "Enter a colour as six hex digits, like #1F2D4D."),
      mode: z.enum(["light", "dark"], { error: "Choose light or dark." }),
    })
    .safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  const settings = { navy: normalizeHex(parsed.data.navy), mode: parsed.data.mode };
  const check = validateTheme(settings);
  if (!check.ok) return failure(check.reason, { navy: [check.reason] });

  const { supabase, isAdmin } = await requireAdmin(parsed.data.organizationId);
  if (!isAdmin) return failure(NOT_ADMIN);
  const { error } = await supabase.from("organizations").update({ theme: settings }).eq("id", parsed.data.organizationId);
  if (error) return dbFailure(error);
  revalidateOrg();
  return success("Theme saved.");
}

export async function updateOrganization(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z
    .object({
      organizationId: id,
      currentSlug: z.string(),
      name: z.string({ error: "Add a name." }).min(1, "Add a name.").max(120, "Use 120 characters or fewer."),
      slug: slugInput,
    })
    .safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  const { supabase, isAdmin } = await requireAdmin(parsed.data.organizationId);
  if (!isAdmin) return failure(NOT_ADMIN);
  const { error } = await supabase
    .from("organizations")
    .update({ name: parsed.data.name, slug: parsed.data.slug })
    .eq("id", parsed.data.organizationId);
  if (error?.code === "23505") return failure("That address is taken.", { slug: ["That address is taken."] });
  if (error) return dbFailure(error);
  revalidateOrg();
  if (parsed.data.slug !== parsed.data.currentSlug) redirect(`/${parsed.data.slug}/settings?view=organization`);
  return success("Saved.");
}

export async function inviteMember(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z
    .object({
      organizationId: id,
      email: z.email("Enter a valid email address.").max(254),
      role: z.enum(["admin", "member"], { error: "Choose a role." }),
    })
    .safeParse({ ...formObject(formData), email: String(formData.get("email") ?? "").trim().toLowerCase() });
  if (!parsed.success) return invalid(parsed.error);
  const { supabase, isAdmin } = await requireAdmin(parsed.data.organizationId);
  if (!isAdmin) return failure(NOT_ADMIN);
  const d = parsed.data;

  const { data: existing } = await supabase
    .from("memberships")
    .select("id, profile:profiles!inner(email)")
    .eq("organization_id", d.organizationId)
    .eq("profile.email", d.email)
    .maybeSingle();
  if (existing) return failure("That person is already in this organization.", { email: ["Already in this organization."] });

  const { data: auth } = await supabase.auth.getUser();
  // one pending invitation per address: refresh it instead of duplicating
  await supabase.from("invitations").delete().eq("organization_id", d.organizationId).ilike("email", d.email).is("accepted_at", null);
  const { data: invite, error } = await supabase
    .from("invitations")
    .insert({ organization_id: d.organizationId, email: d.email, role: d.role, invited_by: auth.user?.id })
    .select("token")
    .single();
  if (error || !invite) return dbFailure(error);
  revalidateOrg();
  const link = `${await siteOrigin()}/invite/${invite.token}`;
  return success(`Invitation created for ${d.email}. Copy the link and send it to them.`, { link });
}

export async function revokeInvitation(formData: FormData): Promise<void> {
  const parsed = z.object({ id }).safeParse(formObject(formData));
  if (!parsed.success) throw new Error("Invalid request.");
  const supabase = await createClient();
  await supabase.from("invitations").delete().eq("id", parsed.data.id);
  revalidateOrg();
}

export async function changeRole(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({ membershipId: id, role: z.enum(["admin", "member"]) }).safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("memberships")
    .update({ role: parsed.data.role })
    .eq("id", parsed.data.membershipId)
    .select("id");
  if (error?.hint === "last_admin" || error?.message?.includes("at least one admin")) {
    return failure("An organization must keep at least one admin. Promote someone else first.");
  }
  if (error) return dbFailure(error);
  if (!data?.length) return failure(NOT_ADMIN);
  revalidateOrg();
  return success("Role updated.");
}

export async function removeMember(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({ membershipId: id }).safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  const supabase = await createClient();
  const { data, error } = await supabase.from("memberships").delete().eq("id", parsed.data.membershipId).select("id");
  if (error?.hint === "last_admin" || error?.message?.includes("at least one admin")) {
    return failure("An organization must keep at least one admin. Promote someone else first.");
  }
  if (error) return dbFailure(error);
  if (!data?.length) return failure(NOT_ADMIN);
  revalidateOrg();
  return success("Removed.");
}
