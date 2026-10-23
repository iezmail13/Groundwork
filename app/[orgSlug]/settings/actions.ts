"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { dbFailure, failure, formObject, invalid, success, type ActionState } from "@/lib/action-state";
import { id, slugInput } from "@/lib/validation";
import { siteOrigin } from "@/lib/urls";
import { getOrgContext } from "@/lib/org";
import { PROJECT_ROLES, ROLES } from "@/lib/roles";
import { lower } from "@/lib/terminology/t";
import { setAssignee } from "@/lib/task-assignees";
import { DEMO_ONLY } from "@/lib/demo";
import { inDemo } from "@/lib/demo-server";

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
      lowAttendancePercent: z.coerce
        .number({ error: "Enter a percentage." })
        .int("Use a whole number.")
        .min(0, "Use a number from 0 to 99.")
        .max(99, "Use a number from 0 to 99."),
      highAttendancePercent: z.coerce
        .number({ error: "Enter a percentage." })
        .int("Use a whole number.")
        .min(1, "Use a number from 1 to 100.")
        .max(100, "Use a number from 1 to 100."),
    })
    // the database checks this too
    .refine((d) => d.lowAttendancePercent < d.highAttendancePercent, {
      path: ["highAttendancePercent"],
      message: "Make the high mark above the low one.",
    })
    .safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  const { supabase, allowed } = await requireManager(parsed.data.organizationId);
  if (!allowed) return failure(NOT_ALLOWED);
  const { error } = await supabase
    .from("organizations")
    .update({ name: parsed.data.name, slug: parsed.data.slug, low_attendance_percent: parsed.data.lowAttendancePercent, high_attendance_percent: parsed.data.highAttendancePercent })
    .eq("id", parsed.data.organizationId);
  if (error?.code === "23505") return failure("That address is taken.", { slug: ["That address is taken."] });
  if (error) return dbFailure(error);
  revalidateOrg();
  if (parsed.data.slug !== parsed.data.currentSlug) redirect(`/${parsed.data.slug}/settings?view=organization`);
  return success("Saved.");
}

const grantRole = z.enum(PROJECT_ROLES);

/**
 * Creates an invitation (or refreshes the pending one for that address, so
 * work already assigned to it stays put) with a name, an org role and project
 * grants. Grants arrive as `grant.<projectId>` = role; an empty value means
 * not included.
 */
export async function inviteMember(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const raw = formObject(formData);
  const parsed = z
    .object({
      organizationId: id,
      email: z.email("Enter a valid email address.").max(254),
      name: z.string().max(120, "Use 120 characters or fewer.").optional(),
      role,
      // sent from a task's assignee picker: the invitee is assigned that task
      assignTaskId: id.optional(),
    })
    .safeParse({ ...raw, email: String(formData.get("email") ?? "").trim().toLowerCase() });
  if (!parsed.success) return invalid(parsed.error);
  const grants: { projectId: string; role: z.infer<typeof grantRole> }[] = [];
  for (const [key, value] of Object.entries(raw)) {
    if (!key.startsWith("grant.") || !value) continue;
    const projectId = id.safeParse(key.slice("grant.".length));
    const grant = grantRole.safeParse(value);
    if (!projectId.success || !grant.success) return failure("Check the roles you chose.");
    grants.push({ projectId: projectId.data, role: grant.data });
  }
  const { supabase, allowed } = await requireManager(parsed.data.organizationId);
  if (!allowed) return failure(NOT_ALLOWED);
  if (await inDemo(supabase)) return failure(DEMO_ONLY);
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
  const { data: pending } = await supabase
    .from("invitations")
    .select("id")
    .eq("organization_id", d.organizationId)
    .eq("email", d.email)
    .is("accepted_at", null)
    .maybeSingle();
  const values = {
    role: d.role,
    name: d.name ?? null,
    expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
  };
  const { data: invite, error } = pending
    ? await supabase.from("invitations").update(values).eq("id", pending.id).select("id, token").single()
    : await supabase
        .from("invitations")
        .insert({ organization_id: d.organizationId, email: d.email, invited_by: auth.user?.id, ...values })
        .select("id, token")
        .single();
  if (error?.code === "42501" || error?.code === "PGRST116") return failure("You can't give that role.", { role: ["You can't give that role."] });
  if (error || !invite) return dbFailure(error);

  if (grants.length) {
    const { error: grantError } = await supabase.from("invitation_projects").upsert(
      grants.map((g) => ({ organization_id: d.organizationId, invitation_id: invite.id, project_id: g.projectId, role: g.role })),
      { onConflict: "invitation_id,project_id" },
    );
    if (grantError) {
      // a brand-new invitation without the access it was meant to grant is no use
      if (!pending) await supabase.from("invitations").delete().eq("id", invite.id);
      return dbFailure(grantError);
    }
  }
  // The task's project was granted above, so the invitee can be appointed to
  // it; appoint_to_task still checks this person may give it to them (D100).
  let assigned: { id: string; title: string; organization_id: string } | null = null;
  let assignError: ActionState | null = null;
  if (d.assignTaskId) {
    const { data: task } = await supabase
      .from("tasks")
      .select("id, title, organization_id")
      .eq("organization_id", d.organizationId)
      .eq("id", d.assignTaskId)
      .maybeSingle();
    const taskError = task ? await setAssignee(supabase, task.id, `i:${invite.id}`) : { message: "That no longer exists." };
    if (taskError) assignError = dbFailure(taskError);
    else assigned = task;
  }
  revalidateOrg();
  const link = `${await siteOrigin()}/invite/${invite.token}`;
  const verb = pending ? "updated" : "created";
  const data: Record<string, string> = { link, invitationId: invite.id, name: d.name || d.email };
  if (assigned) {
    const { data: org } = await supabase.from("organizations").select("slug").eq("id", assigned.organization_id).single();
    if (org) {
      data.taskHref = `/${org.slug}/tasks/${assigned.id}`;
      data.taskTitle = assigned.title;
    }
    return success(`Invitation ${verb} for ${d.email} and “${assigned.title}” assigned to them. Copy the link and send it to them.`, data);
  }
  if (d.assignTaskId) {
    const reason = assignError?.message ?? "You can't change that work.";
    return success(`Invitation ${verb} for ${d.email}, but it wasn't assigned: ${reason} Copy the link and send it to them.`, data);
  }
  return success(`Invitation ${verb} for ${d.email}. Copy the link and send it to them.`, data);
}

export async function revokeInvitation(formData: FormData): Promise<void> {
  const parsed = z.object({ id }).safeParse(formObject(formData));
  if (!parsed.success) throw new Error("Invalid request.");
  const supabase = await createClient();
  await supabase.from("invitations").delete().eq("id", parsed.data.id);
  revalidateOrg();
}

export async function changeRole(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({ membershipId: id, orgSlug: slugInput, role }).safeParse(formObject(formData));
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

/**
 * Removes someone, or lets you leave. Their open work goes to the person
 * chosen (where that person can see it) and the rest is flagged for a new
 * assignee; finished work and their history stay.
 */
export async function removeMember(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z
    .object({ membershipId: id, orgSlug: slugInput, reassignTo: id.optional() })
    .safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const { data: target } = await supabase.from("memberships").select("user_id").eq("id", parsed.data.membershipId).maybeSingle();
  const { data, error } = await supabase.rpc("remove_member", {
    membership_id: parsed.data.membershipId,
    reassign_to: parsed.data.reassignTo,
  });
  if (isLastOwner(error)) return failure(await lastOwnerMessage(parsed.data.orgSlug));
  if (error?.code === "42501" || error?.code === "P0002") return failure(NOT_ALLOWED_MEMBER);
  if (error) return dbFailure(error);
  revalidateOrg();
  // leaving yourself: this organization is no longer yours to view
  if (target?.user_id === auth.user?.id) redirect("/");
  // their row (and this dialog) is gone, so report on the page
  const result = (data ?? {}) as { reassigned?: number; flagged?: number };
  redirect(
    `/${parsed.data.orgSlug}/settings?view=members&notice=removed&handed=${result.reassigned ?? 0}&flagged=${result.flagged ?? 0}`,
  );
}

export async function transferOwnership(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z
    .object({ organizationId: id, orgSlug: slugInput, membershipId: z.guid("Choose who takes over.") })
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
