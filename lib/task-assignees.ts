import "server-only";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;
type Person = { membership_id: string | null; invitation_id: string | null };
type DbError = { message?: string; hint?: string | null; code?: string };

const key = (p: Person) => (p.membership_id ? `m:${p.membership_id}` : `i:${p.invitation_id}`);

/**
 * Makes `desired` ("m:<membership>" and "i:<invitation>" values) the people
 * on a task, through the database functions that check who may claim,
 * appoint and remove (D100). Someone choosing themselves claims open (or
 * their own personal) work; anyone else is appointed. People being taken off
 * go first, so a full claim limit has room for whoever replaces them.
 */
export async function setAssignees(supabase: Supabase, taskId: string, desired: string[]): Promise<DbError | null> {
  const [{ data: task }, { data: current }] = await Promise.all([
    supabase.from("tasks").select("organization_id, kind").eq("id", taskId).maybeSingle(),
    supabase.from("task_assignees").select("membership_id, invitation_id, kind").eq("task_id", taskId),
  ]);
  if (!task) return { message: "That no longer exists." };
  const { data: me } = await supabase.rpc("my_membership_id", { org_id: task.organization_id });
  const wanted = new Set(desired);
  for (const person of current ?? []) {
    if (wanted.has(key(person))) continue;
    const { error } =
      person.membership_id === me && person.kind === "claimed"
        ? await supabase.rpc("unclaim_task", { task_id: taskId })
        : await supabase.rpc("remove_task_assignee", {
            task_id: taskId,
            membership_id: person.membership_id ?? undefined,
            invitation_id: person.invitation_id ?? undefined,
          });
    if (error) return error;
  }
  const already = new Set((current ?? []).map(key));
  for (const value of desired) {
    if (already.has(value)) continue;
    const target = value.slice(2);
    const { error } =
      value === `m:${me}` && (task.kind === "general" || task.kind === "personal")
        ? await supabase.rpc("claim_task", { task_id: taskId })
        : await supabase.rpc("appoint_to_task", {
            task_id: taskId,
            membership_id: value.startsWith("m:") ? target : undefined,
            invitation_id: value.startsWith("i:") ? target : undefined,
          });
    if (error) return error;
  }
  return null;
}

/** One assignee or none: the invite-to-assign path (D79). */
export async function setAssignee(supabase: Supabase, taskId: string, desired: string | null): Promise<DbError | null> {
  return setAssignees(supabase, taskId, desired ? [desired] : []);
}

/** Makes `membershipIds` the task's share list (the database checks who may share). */
export async function setShares(supabase: Supabase, taskId: string, organizationId: string, membershipIds: string[]): Promise<DbError | null> {
  const { data: current, error: readError } = await supabase.from("task_shares").select("membership_id").eq("task_id", taskId);
  if (readError) return readError;
  const have = new Set((current ?? []).map((s) => s.membership_id));
  const want = new Set(membershipIds);
  const remove = [...have].filter((m) => !want.has(m));
  const add = [...want].filter((m) => !have.has(m));
  if (remove.length) {
    const { error } = await supabase.from("task_shares").delete().eq("task_id", taskId).in("membership_id", remove);
    if (error) return error;
  }
  if (add.length) {
    const { error } = await supabase
      .from("task_shares")
      .insert(add.map((membership_id) => ({ organization_id: organizationId, task_id: taskId, membership_id })));
    if (error) return error;
  }
  return null;
}
