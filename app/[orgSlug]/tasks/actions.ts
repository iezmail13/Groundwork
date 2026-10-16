"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { dbFailure, failure, formObject, invalid, success, type ActionState } from "@/lib/action-state";
import { id, slugInput, taskCreateInput, taskFormInput, taskMoveInput, taskStatus } from "@/lib/validation";
import { setAssignee, setAssignees, setShares } from "@/lib/task-assignees";

function revalidateOrg() {
  revalidatePath("/[orgSlug]", "layout");
}

export async function createTask(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = taskCreateInput.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return failure("You've been signed out. Sign in again.");
  const d = parsed.data;

  // the id is chosen here so the new row needn't be read back (D76)
  const taskId = crypto.randomUUID();
  const { error } = await supabase.from("tasks").insert({
    id: taskId,
    organization_id: d.organizationId,
    project_id: d.projectId!,
    title: d.title,
    status: d.status ?? "todo",
    due_date: d.dueDate ?? null,
    priority: d.priority ?? "medium",
    created_by: auth.user.id,
  });
  if (error) return dbFailure(error);
  if (d.assigneeMembershipId) {
    const assignError = await setAssignee(supabase, taskId, `m:${d.assigneeMembershipId}`);
    if (assignError) {
      revalidateOrg();
      return dbFailure(assignError);
    }
  }
  revalidateOrg();
  return success(`Added “${d.title}”.`);
}

/** The full task form: creates a task (no id) or saves one, with its people and share list (D101). */
export async function saveTask(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const raw = formObject(formData);
  const parsed = taskFormInput.safeParse({
    ...raw,
    hidden: formData.get("hidden") === "on",
    assignees: formData.getAll("assignee").map(String),
    shares: formData.getAll("share").map(String),
  });
  if (!parsed.success) return invalid(parsed.error);
  const d = parsed.data;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return failure("You've been signed out. Sign in again.");

  const fields = {
    project_id: d.projectId ?? null,
    title: d.title,
    description: d.description ?? null,
    kind: d.kind,
    priority: d.priority,
    hidden: d.hidden,
    claim_limit: d.claimLimit ?? null,
    completion: d.completion,
    due_date: d.dueDate ?? null,
  };
  const taskId = d.id ?? crypto.randomUUID();
  if (d.id) {
    const { data, error } = await supabase.from("tasks").update(fields).eq("id", d.id).select("id");
    if (error) return dbFailure(error);
    if (!data?.length) return failure("You can't edit this, or it no longer exists.");
  } else {
    // the id is chosen here so the new row needn't be read back (D76)
    const { error } = await supabase
      .from("tasks")
      .insert({ id: taskId, organization_id: d.organizationId, created_by: auth.user.id, status: "todo", ...fields });
    if (error) return dbFailure(error);
  }

  // personal work is the creator's own: they're its only assignee
  let people = d.assignees;
  if (d.kind === "personal") {
    const { data: me } = await supabase.rpc("my_membership_id", { org_id: d.organizationId });
    people = me ? [`m:${me}`] : [];
  }
  const assignError = await setAssignees(supabase, taskId, people);
  const shareError = assignError ? null : await setShares(supabase, taskId, d.organizationId, d.shares);
  revalidateOrg();
  if (assignError || shareError) {
    const failed = dbFailure(assignError ?? shareError);
    return d.id ? failed : { ...failed, data: { taskId } };
  }
  const orgSlug = slugInput.safeParse(formData.get("orgSlug"));
  if (!d.id && orgSlug.success) redirect(`/${orgSlug.data}/tasks/${taskId}`);
  return success("Saved.");
}

export type MoveResult = { ok: true } | { ok: false; message: string };

/**
 * Board ordering within a column. Status isn't set here: it follows who's on
 * the task, and done is a tick (D100, D101).
 */
export async function moveTask(input: z.input<typeof taskMoveInput>): Promise<MoveResult> {
  const parsed = taskMoveInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: "That move isn't valid." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .update({ position: parsed.data.position })
    .eq("id", parsed.data.id)
    .select("id");
  if (error || !data?.length) return { ok: false, message: "Couldn't move it. Refresh and try again." };
  revalidateOrg();
  return { ok: true };
}

/** Checkbox toggle: done, or not (back to in progress or to do, by its assignees). */
export async function setTaskStatus(input: { id: string; status: string }): Promise<MoveResult> {
  const parsed = z.object({ id, status: taskStatus }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "That change isn't valid." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_task_done", { task_id: parsed.data.id, done: parsed.data.status === "done" });
  if (error) {
    const failed = dbFailure(error);
    return { ok: false, message: failed.message ?? "Couldn't update it. Refresh and try again." };
  }
  revalidateOrg();
  return { ok: true };
}

/** Claim an open task, or take yourself off one you claimed (D100). */
export async function claimTask(input: { id: string; claim: boolean }): Promise<MoveResult> {
  const parsed = z.object({ id, claim: z.boolean() }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "That change isn't valid." };
  const supabase = await createClient();
  const { error } = await supabase.rpc(parsed.data.claim ? "claim_task" : "unclaim_task", { task_id: parsed.data.id });
  if (error) return { ok: false, message: dbFailure(error).message ?? "Couldn't update it. Refresh and try again." };
  revalidateOrg();
  return { ok: true };
}

export async function deleteTask(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({ id, orgSlug: z.string().min(1) }).safeParse(formObject(formData));
  if (!parsed.success) return failure("Invalid request.");
  const supabase = await createClient();
  const { data, error } = await supabase.from("tasks").delete().eq("id", parsed.data.id).select("id");
  if (error) return dbFailure(error);
  if (!data?.length) return failure("Only the person who created this, or someone who manages the organization, can delete it.");
  revalidateOrg();
  redirect(`/${parsed.data.orgSlug}/tasks`);
}
