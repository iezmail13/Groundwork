import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

type Role = Database["public"]["Enums"]["member_role"];

export type TaskStatus = Database["public"]["Enums"]["task_status"];
export type TaskKind = Database["public"]["Enums"]["task_kind"];
export type TaskPriority = Database["public"]["Enums"]["task_priority"];
export type TaskCompletion = Database["public"]["Enums"]["task_completion"];

/** Someone on a task: a member, or a pending invitee (D70, D100). */
export type TaskAssignee = {
  membership_id: string | null;
  invitation_id: string | null;
  kind: Database["public"]["Enums"]["task_assignee_kind"];
  done_at: string | null;
};
export type ProjectStatus = Database["public"]["Enums"]["project_status"];
export const TASK_STATUSES: TaskStatus[] = ["todo", "in_progress", "done"];

export type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  due_date: string | null;
  position: number;
  /** Null for personal and org-level tasks outside a project. */
  project_id: string | null;
  kind: TaskKind;
  priority: TaskPriority;
  hidden: boolean;
  claim_limit: number | null;
  completion: TaskCompletion;
  assignees: TaskAssignee[];
  needs_assignee: boolean;
  completed_at: string | null;
  created_by: string | null;
  /** The org role its creator held when they made it (see guard_creator_rank). */
  created_by_role: Role | null;
  project: { id: string; name: string; color: string | null; status: ProjectStatus } | null;
};

export const TASK_SELECT =
  "id, title, description, status, due_date, position, project_id, kind, priority, hidden, claim_limit, completion, needs_assignee, completed_at, created_by, created_by_role, project:projects(id, name, color, status), assignees:task_assignees(membership_id, invitation_id, kind, done_at)";

export type ProjectOption = { id: string; name: string };

export async function getProjectOptions(orgId: string, includeArchived = false): Promise<ProjectOption[]> {
  const supabase = await createClient();
  let query = supabase.from("projects").select("id, name").eq("organization_id", orgId).order("name");
  if (!includeArchived) query = query.eq("status", "active");
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export type ProjectProgress = { total: number; done: number };

/** Task counts per project, for progress bars. */
export async function getProjectProgress(orgId: string): Promise<Map<string, ProjectProgress>> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("tasks").select("project_id, status").eq("organization_id", orgId);
  if (error) throw error;
  const map = new Map<string, ProjectProgress>();
  for (const row of data ?? []) {
    // personal and org-level tasks belong to no project
    if (!row.project_id) continue;
    const entry = map.get(row.project_id) ?? { total: 0, done: 0 };
    entry.total += 1;
    if (row.status === "done") entry.done += 1;
    map.set(row.project_id, entry);
  }
  return map;
}

export type EventRow = {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  location: string | null;
  project_id: string | null;
  created_by: string | null;
  created_by_role: Role | null;
  project: { id: string; name: string } | null;
};

export const EVENT_SELECT =
  "id, title, description, starts_at, ends_at, all_day, location, project_id, created_by, created_by_role, project:projects(id, name)";

/** Events overlapping [fromIso, toIso). */
export async function getEvents(orgId: string, fromIso: string, toIso: string): Promise<EventRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("events")
    .select(EVENT_SELECT)
    .eq("organization_id", orgId)
    .lt("starts_at", toIso)
    .gte("ends_at", fromIso)
    .order("starts_at");
  if (error) throw error;
  return (data ?? []) as EventRow[];
}

export type DocumentRow = {
  id: string;
  name: string;
  mime_type: string;
  size_bytes: number;
  tags: string[];
  pinned: boolean;
  project_id: string | null;
  uploaded_by: string | null;
  created_by_role: Role | null;
  created_at: string;
  project: { id: string; name: string } | null;
  uploader: { full_name: string | null; email: string } | null;
};

export const DOCUMENT_SELECT =
  "id, name, mime_type, size_bytes, tags, pinned, project_id, uploaded_by, created_by_role, created_at, project:projects(id, name), uploader:profiles(full_name, email)";

export type ActivityRow = {
  id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  metadata: { label?: string; project_id?: string; from?: string; to?: string; actor_name?: string };
  created_at: string;
  actor_membership_id: string | null;
};

/** Turns a free-text search into a prefix tsquery: "bud 26" -> "bud:* & 26:*". */
export function toPrefixQuery(text: string): string | null {
  const terms = text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .slice(0, 8);
  return terms.length ? terms.map((term) => `${term}:*`).join(" & ") : null;
}
