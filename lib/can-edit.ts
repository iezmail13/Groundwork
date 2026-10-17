import { rankOf, type Role } from "@/lib/roles";

// Who can act on what a dashboard mark leads to (D105). This mirrors the
// database's rules so edit links only appear for people who can use them; the
// database (RLS) stays the authority. Anyone else gets a read-only
// "View details" panel instead.

/**
 * A future per-person grant (not built: per-person permission grants are out
 * of scope). canEdit already checks them first, so adding grants later means
 * filling this list, not changing every caller.
 */
export type Grant = { target: EditTarget["kind"]; id: string };

export type Viewer = {
  role: Role;
  /** The viewer's rank on each program they can see: lead 3, admin 2, staff 1 (owners act as lead). */
  projectRanks: ReadonlyMap<string, number>;
  grants?: readonly Grant[];
};

export type EditTarget =
  /** A program's own page and settings. */
  | { kind: "project"; projectId: string }
  /** A program's work as a whole (or work outside any program, when projectId is null). */
  | { kind: "project_work"; projectId: string | null }
  /** The viewer's own work. */
  | { kind: "own_work" }
  /** A participant record on a program. */
  | { kind: "participant"; projectId: string }
  | { kind: "fund" }
  /** Someone's workload. */
  | { kind: "person" };

function targetId(t: EditTarget): string | null {
  return "projectId" in t ? t.projectId : null;
}

export function canEdit(target: EditTarget, viewer: Viewer): boolean {
  if (viewer.grants?.some((g) => g.target === target.kind && g.id === targetId(target))) return true;
  const rank = rankOf(viewer.role);
  const owner = viewer.role === "owner";
  const manager = rank >= rankOf("manager");
  const projectRank = (id: string | null) => (id ? (viewer.projectRanks.get(id) ?? 0) : 0);
  switch (target.kind) {
    case "project":
      // projects_update: project admins and leads (owners act as lead)
      return owner || projectRank(target.projectId) >= 2;
    case "project_work":
      // running a program's work: its admins and leads; work outside any program: managers and owners
      return target.projectId === null ? manager : owner || projectRank(target.projectId) >= 2;
    case "own_work":
      return true;
    case "participant":
      // can_manage_participants_in: the program's admins and leads, and owners
      return owner || projectRank(target.projectId) >= 2;
    case "fund":
    case "person":
      return manager;
  }
}
