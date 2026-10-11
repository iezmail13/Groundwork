"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { dbFailure, failure, formObject, invalid, success, type ActionState } from "@/lib/action-state";
import { id, slugInput } from "@/lib/validation";
import { siteOrigin } from "@/lib/urls";
import { getOrgContext } from "@/lib/org";
import { ROLES } from "@/lib/roles";
import { lower } from "@/lib/terminology/t";

function revalidateOrg() {
  revalidatePath("/[orgSlug]", "layout");
}

/** Settings changes need manager rank or above; RLS enforces it, this gives a clear message first. */
async function requireManager(organizationId: string) {
  const supabase = await createClient();
  const { data: allowed } = await supabase.rpc("has_permission", { org_id: organizationId, required: "manager" });
  return { supabase, allowed: Boolean(allowed) };
}

const NOT_ALLOWED = "You don't have permission to change settings.";
const NOT_ALLOWED_MEMBER = "You don't have permission to change that person's access.";

const role = z.enum(ROLES, { error: "Choose a role." });

/** The database refused because the organization would be left without an owner. */
function isLastOwner(error: { hint?: string; message?: string } | null): boolean {
  return error?.hint === "last_owner" || Boolean(error?.message?.includes("at least one owner"));
}

async function lastOwnerMessage(orgSlug: string): Promise<string> {
  const { t } = await getOrgContext(orgSlug);
  return `An organization must keep at least one ${lower(t("role.owner"))}. Transfer ownership or make someone else ${lower(t("role.owner"))} first.`;
}

export async function setPreset(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z
    .object({ organizationId: id, preset: z.string().regex(/^[a-z][a-z0-9_]{1,31}$/, "Choose a preset.") })
    .safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  const { supabase, allowed } = await requireManager(parsed.data.organizationId);
  if (!allowed) return failure(NOT_ALLOWED);
  const { error } = await supabase
    .from("organizations")
    // custom labels can no longer be edited, so applying a preset clears any left from before
    .update({ preset_key: parsed.data.preset, terminology_overrides: {} })
    .eq("id", parsed.data.organizationId);
  if (error) return dbFailure(error);
  revalidateOrg();
  return success("Preset applied. Every label in the app now uses its words.");
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
  const { supabase, allowed } = await requireManager(parsed.data.organizationId);
  if (!allowed) return failure(NOT_ALLOWED);
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
      role,
    })
    .safeParse({ ...formObject(formData), email: String(formData.get("email") ?? "").trim().toLowerCase() });
  if (!parsed.success) return invalid(parsed.error);
  const { supabase, allowed } = await requireManager(parsed.data.organizationId);
  if (!allowed) return failure(NOT_ALLOWED);
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
  // (exact match: emails are stored lowercase, and ilike would treat "_" as a wildcard)
  await supabase.from("invitations").delete().eq("organization_id", d.organizationId).eq("email", d.email).is("accepted_at", null);
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
  const parsed = z.object({ membershipId: id, orgSlug: z.string().min(1), role }).safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("memberships")
    .update({ role: parsed.data.role })
    .eq("id", parsed.data.membershipId)
    .select("id");
  if (isLastOwner(error)) return failure(await lastOwnerMessage(parsed.data.orgSlug));
  // a role above the caller's own fails the policy's check
  if (error?.code === "42501") return failure(NOT_ALLOWED_MEMBER);
  if (error) return dbFailure(error);
  if (!data?.length) return failure(NOT_ALLOWED_MEMBER);
  revalidateOrg();
  return success("Role updated.");
}

export async function removeMember(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({ membershipId: id, orgSlug: z.string().min(1) }).safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("memberships")
    .delete()
    .eq("id", parsed.data.membershipId)
    .select("id, user_id");
  if (isLastOwner(error)) return failure(await lastOwnerMessage(parsed.data.orgSlug));
  if (error) return dbFailure(error);
  if (!data?.length) return failure(NOT_ALLOWED_MEMBER);
  revalidateOrg();
  // leaving yourself: this organization is no longer yours to view
  if (data[0]!.user_id === auth.user?.id) redirect("/");
  return success("Removed.");
}

export async function transferOwnership(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z
    .object({ organizationId: id, orgSlug: z.string().min(1), membershipId: z.guid("Choose who takes over.") })
    .safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.rpc("transfer_ownership", {
    org_id: parsed.data.organizationId,
    new_owner_membership_id: parsed.data.membershipId,
  });
  if (error?.code === "42501") {
    const { t } = await getOrgContext(parsed.data.orgSlug);
    return failure(`Only ${lower(t("role.owner", "other"))} can transfer ownership.`);
  }
  if (error?.code === "P0002" || error?.code === "22023") {
    return failure(error.message, { membershipId: [error.message] });
  }
  if (error) return dbFailure(error);
  revalidateOrg();
  // the caller is no longer an owner, so the dialog they used is gone; say so on the page
  redirect(`/${parsed.data.orgSlug}/settings?view=members&notice=transferred`);
}
