import "server-only";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;
type Person = { membership_id: string | null; invitation_id: string | null };

const key = (p: Person) => (p.membership_id ? `m:${p.membership_id}` : `i:${p.invitation_id}`);

/**
 * Makes `desired` ("m:<membership>", "i:<invitation>" or nothing) the task's
 * assignee, through the database functions that check who may claim, appoint
 * and remove (D100): someone choosing themselves claims an open task; anyone
 * else is appointed. The page offers one assignee until the multi-assignee
 * form arrives.
 */
export async function setAssignee(supabase: Supabase, taskId: string, desired: string | null): Promise<{ message?: string; hint?: string | null; code?: string } | null> {
  const [{ data: task }, { data: current }] = await Promise.all([
    supabase.from("tasks").select("organization_id, kind").eq("id", taskId).maybeSingle(),
    supabase.from("task_assignees").select("membership_id, invitation_id, kind").eq("task_id", taskId),
  ]);
  if (!task) return { message: "That no longer exists." };
  const { data: me } = await supabase.rpc("my_membership_id", { org_id: task.organization_id });
  for (const person of current ?? []) {
    if (key(person) === desired) continue;
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
  if (!desired || (current ?? []).some((p) => key(p) === desired)) return null;
  const target = desired.slice(2);
  const { error } =
    desired === `m:${me}` && task.kind === "general"
      ? await supabase.rpc("claim_task", { task_id: taskId })
      : await supabase.rpc("appoint_to_task", {
          task_id: taskId,
          membership_id: desired.startsWith("m:") ? target : undefined,
          invitation_id: desired.startsWith("i:") ? target : undefined,
        });
  return error ?? null;
}

