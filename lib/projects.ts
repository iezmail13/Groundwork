import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getMembers } from "@/lib/org";
import type { ProjectRole, Role } from "@/lib/roles";

export type RosterRow = {
  id: string; // project_members id
  membershipId: string;
  role: ProjectRole;
  orgRole: Role;
  name: string;
  email: string;
};

/** Who is on a project (owners aren't listed: they see every project). */
export const getProjectRoster = cache(async (orgId: string, projectId: string): Promise<RosterRow[]> => {
  const supabase = await createClient();
  const [{ data, error }, members] = await Promise.all([
    supabase.from("project_members").select("id, membership_id, role").eq("project_id", projectId),
    getMembers(orgId),
  ]);
  if (error) throw error;
  const byId = new Map(members.map((m) => [m.id, m]));
  const order: Record<ProjectRole, number> = { lead: 0, admin: 1, staff: 2 };
  return (data ?? [])
    .flatMap((row) => {
      const m = byId.get(row.membership_id);
      return m ? [{ id: row.id, membershipId: m.id, role: row.role, orgRole: m.role, name: m.name, email: m.email }] : [];
    })
    .sort((a, b) => order[a.role] - order[b.role] || a.name.localeCompare(b.name));
});

/** The caller's rank on a project: 3 lead (or owner), 2 admin, 1 staff, 0 not on it. */
export const getMyProjectRank = cache(async (projectId: string): Promise<number> => {
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_project_rank", { project_id: projectId });
  return typeof data === "number" ? data : 0;
});

/** Lead names per visible project, for the projects table. */
export async function getProjectLeads(orgId: string): Promise<Map<string, string[]>> {
  const supabase = await createClient();
  const [{ data, error }, members] = await Promise.all([
    supabase.from("project_members").select("project_id, membership_id").eq("organization_id", orgId).eq("role", "lead"),
    getMembers(orgId),
  ]);
  if (error) throw error;
  const names = new Map(members.map((m) => [m.id, m.name]));
  const leads = new Map<string, string[]>();
  for (const row of data ?? []) {
    const name = names.get(row.membership_id);
    if (name) leads.set(row.project_id, [...(leads.get(row.project_id) ?? []), name]);
  }
  for (const list of leads.values()) list.sort((a, b) => a.localeCompare(b));
  return leads;
}

export type PendingInvitee = { id: string; name: string; projectIds: string[] };

/** Pending invitees on projects the caller can see. */
export const getPendingInvitees = cache(async (orgId: string): Promise<PendingInvitee[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("pending_invitees", { org_id: orgId });
  if (error) throw error;
  const byId = new Map<string, PendingInvitee>();
  for (const row of data ?? []) {
    const entry = byId.get(row.id) ?? { id: row.id, name: row.name || row.email, projectIds: [] };
    entry.projectIds.push(row.project_id);
    byId.set(row.id, entry);
  }
  return [...byId.values()];
});

/**
 * Display names for every assignee id a task can carry: members by
 * membership id, pending invitees by invitation id as "Name (pending)".
 */
export async function getAssigneeNames(orgId: string): Promise<Map<string, string>> {
  const [members, invitees] = await Promise.all([getMembers(orgId), getPendingInvitees(orgId)]);
  return new Map([
    ...members.map((m) => [m.id, m.name] as const),
    ...invitees.map((i) => [i.id, `${i.name} (pending)`] as const),
  ]);
}

export type AssigneeOption = { value: string; name: string; /** Members only: for their online status. */ userId?: string };

/**
 * Who each visible project's tasks can be assigned to: its members, the
 * organization's owners, and pending invitees granted the project. Values are
 * "m:<membership id>" or "i:<invitation id>".
 */
export async function getAssigneeOptions(orgId: string): Promise<Record<string, AssigneeOption[]>> {
  const supabase = await createClient();
  const [{ data, error }, { data: projects, error: projectsError }, members, invitees] = await Promise.all([
    supabase.from("project_members").select("project_id, membership_id").eq("organization_id", orgId),
    supabase.from("projects").select("id").eq("organization_id", orgId),
    getMembers(orgId),
    getPendingInvitees(orgId),
  ]);
  if (error) throw error;
  if (projectsError) throw projectsError;
  const byId = new Map(members.map((m) => [m.id, m]));
  const owners = members.filter((m) => m.role === "owner");
  const options: Record<string, AssigneeOption[]> = {};
  const add = (projectId: string, option: AssigneeOption) => {
    const list = (options[projectId] ??= []);
    if (!list.some((o) => o.value === option.value)) list.push(option);
  };
  for (const row of data ?? []) {
    const m = byId.get(row.membership_id);
    if (m) add(row.project_id, { value: `m:${m.id}`, name: m.name, userId: m.userId });
  }
  for (const project of projects ?? []) {
    options[project.id] ??= [];
    for (const o of owners) add(project.id, { value: `m:${o.id}`, name: o.name, userId: o.userId });
  }
  for (const i of invitees) for (const projectId of i.projectIds) add(projectId, { value: `i:${i.id}`, name: `${i.name} (pending)` });
  // work outside any project ("") can go to anyone in the organization
  options[""] = [];
  for (const m of members) add("", { value: `m:${m.id}`, name: m.name, userId: m.userId });
  for (const i of invitees) add("", { value: `i:${i.id}`, name: `${i.name} (pending)` });
  for (const list of Object.values(options)) list.sort((a, b) => a.name.localeCompare(b.name));
  return options;
}
