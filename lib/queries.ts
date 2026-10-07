import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

export type TaskStatus = Database["public"]["Enums"]["task_status"];
export type ProjectStatus = Database["public"]["Enums"]["project_status"];
export const TASK_STATUSES: TaskStatus[] = ["todo", "in_progress", "done"];

export type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  due_date: string | null;
  position: number;
  project_id: string;
  assignee_membership_id: string | null;
  completed_at: string | null;
  created_by: string | null;
  project: { id: string; name: string; color: string | null; status: ProjectStatus } | null;
};

export const TASK_SELECT =
  "id, title, description, status, due_date, position, project_id, assignee_membership_id, completed_at, created_by, project:projects(id, name, color, status)";

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
  project: { id: string; name: string } | null;
};

export const EVENT_SELECT =
  "id, title, description, starts_at, ends_at, all_day, location, project_id, created_by, project:projects(id, name)";

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
  created_at: string;
  project: { id: string; name: string } | null;
  uploader: { full_name: string | null; email: string } | null;
};

export const DOCUMENT_SELECT =
  "id, name, mime_type, size_bytes, tags, pinned, project_id, uploaded_by, created_at, project:projects(id, name), uploader:profiles(full_name, email)";

export type ActivityRow = {
  id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  metadata: { label?: string; project_id?: string; from?: string; to?: string };
  created_at: string;
  actor_membership_id: string | null;
};

export async function getActivity(orgId: string, limit = 12): Promise<ActivityRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("activity_log")
    .select("id, entity_type, entity_id, action, metadata, created_at, actor_membership_id")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as ActivityRow[];
}

/** Turns a free-text search into a prefix tsquery: "bud 26" -> "bud:* & 26:*". */
export function toPrefixQuery(text: string): string | null {
  const terms = text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .slice(0, 8);
  return terms.length ? terms.map((term) => `${term}:*`).join(" & ") : null;
}
