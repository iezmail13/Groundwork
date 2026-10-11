import type { Database } from "@/lib/supabase/database.types";

// The organization role ladder, mirroring role_rank(), can_grant_role() and
// can_manage_member() in the database. RLS is what enforces it; these let the
// UI offer only the choices the database will accept.

export type Role = Database["public"]["Enums"]["member_role"];

/** Highest first, the order role pickers list them in. */
export const ROLES = ["owner", "manager", "admin", "staff"] as const satisfies readonly Role[];

const RANKS: Record<Role, number> = { owner: 4, manager: 3, admin: 2, staff: 1 };

export function rankOf(role: Role): number {
  return RANKS[role];
}

/** Owners and managers handle settings, members and invitations. */
export function canManageOrg(viewer: Role): boolean {
  return rankOf(viewer) >= RANKS.manager;
}

/** Owners can give any role; managers only roles below their own. */
export function canGrant(viewer: Role, role: Role): boolean {
  if (viewer === "owner") return true;
  if (viewer === "manager") return rankOf(role) < RANKS.manager;
  return false;
}

/** Owners can change or remove anyone; managers only people ranked below them. */
export function canManageMember(viewer: Role, target: Role): boolean {
  return canGrant(viewer, target);
}

/** The roles this viewer can hand out, highest first. */
export function grantableRoles(viewer: Role): Role[] {
  return ROLES.filter((r) => canGrant(viewer, r));
}
