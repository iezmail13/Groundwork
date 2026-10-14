"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { dbFailure, failure, formObject, invalid, success, type ActionState } from "@/lib/action-state";
import { id, taskCreateInput, taskMoveInput, taskStatus, taskUpdateInput } from "@/lib/validation";
import { setAssignee } from "@/lib/task-assignees";

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

export async function updateTask(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = taskUpdateInput.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  const d = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .update({
      project_id: d.projectId ?? null,
      title: d.title,
      description: d.description ?? null,
      status: d.status,
      due_date: d.dueDate ?? null,
    })
    .eq("id", d.id)
    .select("id");
  if (error) return dbFailure(error);
  if (!data?.length) return failure("You can't edit this, or it no longer exists.");
  const assignError = await setAssignee(supabase, d.id, d.assignee ?? null);
  revalidateOrg();
  if (assignError) return dbFailure(assignError);
  return success("Saved.");
}

export type MoveResult = { ok: true } | { ok: false; message: string };

/** Board drag-and-drop and keyboard moves: new status and position. */
export async function moveTask(input: z.input<typeof taskMoveInput>): Promise<MoveResult> {
  const parsed = taskMoveInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: "That move isn't valid." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .update({ status: parsed.data.status, position: parsed.data.position })
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
