"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { dbFailure, failure, formObject, invalid, success, type ActionState } from "@/lib/action-state";
import { id, projectInput } from "@/lib/validation";
import { PROJECT_ROLES } from "@/lib/roles";

function revalidateOrg() {
  revalidatePath("/[orgSlug]", "layout");
}

function projectValues(data: z.infer<typeof projectInput>) {
  return {
    name: data.name,
    description: data.description ?? null,
    color: data.color ?? null,
    start_date: data.startDate ?? null,
    end_date: data.endDate ?? null,
    tracks_participants: data.tracksParticipants === "on",
  };
}

export async function createProject(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = projectInput.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return failure("You've been signed out. Sign in again.");

  // The new row isn't read back: visibility is checked against the project
  // roster, which its creator joins only once the insert has finished.
  const projectId = crypto.randomUUID();
  const { error } = await supabase
    .from("projects")
    .insert({ id: projectId, organization_id: parsed.data.organizationId, created_by: auth.user.id, ...projectValues(parsed.data) });
  if (error) return dbFailure(error);
  const { data: org } = await supabase.from("organizations").select("slug").eq("id", parsed.data.organizationId).single();
  revalidateOrg();
  redirect(`/${org?.slug}/projects/${projectId}`);
}

export async function updateProject(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const raw = formObject(formData);
  const projectId = id.safeParse(raw.id);
  const parsed = projectInput.safeParse(raw);
  if (!projectId.success) return failure("This item no longer exists.");
  if (!parsed.success) return invalid(parsed.error);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .update(projectValues(parsed.data))
    .eq("id", projectId.data)
    .select("id");
  if (error) return dbFailure(error);
  if (!data?.length) return failure("You can't edit this, or it no longer exists.");
  revalidateOrg();
  return success("Saved.");
}

const statusInput = z.object({ id, status: z.enum(["active", "archived"]) });

export async function setProjectStatus(formData: FormData): Promise<void> {
  const parsed = statusInput.safeParse(formObject(formData));
  if (!parsed.success) throw new Error("Invalid request.");
  const supabase = await createClient();
  const { error } = await supabase.from("projects").update({ status: parsed.data.status }).eq("id", parsed.data.id);
  if (error) throw new Error("Couldn't change the status. Try again.");
  revalidateOrg();
}

export async function deleteProject(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({ id, orgSlug: z.string().min(1) }).safeParse(formObject(formData));
  if (!parsed.success) return failure("Invalid request.");
  const supabase = await createClient();
  const { data, error } = await supabase.from("projects").delete().eq("id", parsed.data.id).select("id");
  if (error) return dbFailure(error);
  if (!data?.length) return failure("Only the person who created this, or someone who manages the organization, can delete it.");
  revalidateOrg();
  redirect(`/${parsed.data.orgSlug}/projects`);
}

// Project roster ---------------------------------------------------------------

const projectRole = z.enum(PROJECT_ROLES, { error: "Choose a role." });

export async function addProjectMember(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z
    .object({ organizationId: id, projectId: id, membershipId: z.guid("Choose a person."), role: projectRole })
    .safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  const d = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase
    .from("project_members")
    .insert({ organization_id: d.organizationId, project_id: d.projectId, membership_id: d.membershipId, role: d.role });
  if (error?.code === "23505") return failure("They're already on it.", { membershipId: ["Already added."] });
  if (error) return dbFailure(error);
  revalidateOrg();
  return success("Added.");
}

/** Adds every org admin who isn't on the project yet, as a project admin. */
export async function addAllAdmins(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({ organizationId: id, projectId: id }).safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  const d = parsed.data;
  const supabase = await createClient();
  const [{ data: admins, error: adminsError }, { data: current, error: currentError }] = await Promise.all([
    supabase.from("memberships").select("id").eq("organization_id", d.organizationId).eq("role", "admin"),
    supabase.from("project_members").select("membership_id").eq("project_id", d.projectId),
  ]);
  if (adminsError || currentError) return dbFailure(adminsError ?? currentError);
  const on = new Set((current ?? []).map((r) => r.membership_id));
  const rows = (admins ?? [])
    .filter((a) => !on.has(a.id))
    .map((a) => ({ organization_id: d.organizationId, project_id: d.projectId, membership_id: a.id, role: "admin" as const }));
  if (rows.length === 0) return success("Everyone with that role is already on it.");
  const { error } = await supabase.from("project_members").insert(rows);
  if (error) return dbFailure(error);
  revalidateOrg();
  return success(rows.length === 1 ? "Added 1 person." : `Added ${rows.length} people.`);
}

export async function changeProjectRole(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({ projectMemberId: id, role: projectRole }).safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_members")
    .update({ role: parsed.data.role })
    .eq("id", parsed.data.projectMemberId)
    .select("id");
  if (error?.code === "42501") return failure("You can't give that role.");
  if (error) return dbFailure(error);
  if (!data?.length) return failure("You can't change that person's role.");
  revalidateOrg();
  return success("Role updated.");
}

export async function removeProjectMember(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({ projectMemberId: id, orgSlug: z.string().min(1), leaving: z.enum(["true", "false"]) }).safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  const supabase = await createClient();
  const { data, error } = await supabase.from("project_members").delete().eq("id", parsed.data.projectMemberId).select("id");
  if (error) return dbFailure(error);
  if (!data?.length) return failure("You can't remove that person.");
  revalidateOrg();
  // after leaving, the project is no longer yours to view
  if (parsed.data.leaving === "true") redirect(`/${parsed.data.orgSlug}/projects`);
  return success("Removed. Their open work here is flagged for a new assignee.");
}
