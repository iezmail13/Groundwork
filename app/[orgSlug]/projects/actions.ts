"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { dbFailure, failure, formObject, invalid, success, type ActionState } from "@/lib/action-state";
import { id, projectInput } from "@/lib/validation";

function revalidateOrg() {
  revalidatePath("/[orgSlug]", "layout");
}

function projectValues(data: z.infer<typeof projectInput>) {
  return {
    name: data.name,
    description: data.description ?? null,
    color: data.color ?? null,
    owner_membership_id: data.ownerMembershipId ?? null,
    start_date: data.startDate ?? null,
    end_date: data.endDate ?? null,
  };
}

export async function createProject(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = projectInput.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return failure("Your session has ended. Sign in again.");

  const { data, error } = await supabase
    .from("projects")
    .insert({ organization_id: parsed.data.organizationId, created_by: auth.user.id, ...projectValues(parsed.data) })
    .select("id, organization:organizations(slug)")
    .single();
  if (error || !data) return dbFailure(error);
  revalidateOrg();
  redirect(`/${data.organization?.slug}/projects/${data.id}`);
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
  if (!data?.length) return failure("Only an admin or the person who created this can delete it.");
  revalidateOrg();
  redirect(`/${parsed.data.orgSlug}/projects`);
}
