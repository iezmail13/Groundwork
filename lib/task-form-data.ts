import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getMembers, type OrgContext } from "@/lib/org";
import { getAssigneeOptions } from "@/lib/projects";
import { getProjectOptions } from "@/lib/queries";
import { canManageOrg } from "@/lib/roles";

/** What the full task form needs to offer, for this viewer (D101). */
export async function getTaskFormData(ctx: OrgContext) {
  const supabase = await createClient();
  const [projects, people, members, { data: ranks }] = await Promise.all([
    getProjectOptions(ctx.org.id),
    getAssigneeOptions(ctx.org.id),
    getMembers(ctx.org.id),
    supabase.rpc("my_project_ranks", { org_id: ctx.org.id }),
  ]);
  const manager = canManageOrg(ctx.role);
  // leads (project rank 3), managers and owners may hide work
  const canHide: Record<string, boolean> = { "": manager };
  for (const p of projects) canHide[p.id] = manager || (ranks ?? []).some((r) => r.project_id === p.id && r.rank >= 3);
  return {
    projects,
    people,
    members: members.map((m) => ({ id: m.id, name: m.name })),
    canHide,
    canOrgLevel: manager,
    // inviting from a task grants its project, which needs project admin or lead there
    invite: manager
      ? { href: `${ctx.base}/settings?view=members`, projectIds: (ranks ?? []).filter((r) => r.rank >= 2).map((r) => r.project_id) }
      : null,
  };
}
