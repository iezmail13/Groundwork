import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

// Participants and attendance. RLS decides what each query returns: owners,
// and project admins and leads of programs that track participants.

export type AttendanceStatus = Database["public"]["Enums"]["attendance_status"];
export const ATTENDANCE_STATUSES: AttendanceStatus[] = ["present", "late", "absent", "excused"];

export type Program = { id: string; name: string; active: boolean };

/** Programs that keep a roster and where the viewer manages it (project admin, lead or owner). */
export async function getAttendancePrograms(orgId: string): Promise<Program[]> {
  const supabase = await createClient();
  const [{ data: projects, error }, { data: ranks }] = await Promise.all([
    supabase.from("projects").select("id, name, status").eq("organization_id", orgId).eq("tracks_participants", true).order("name"),
    supabase.rpc("my_project_ranks", { org_id: orgId }),
  ]);
  if (error) throw error;
  const manages = new Set((ranks ?? []).filter((r) => r.rank >= 2).map((r) => r.project_id));
  return (projects ?? []).filter((p) => manages.has(p.id)).map((p) => ({ id: p.id, name: p.name, active: p.status === "active" }));
}

export type ParticipantRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  date_of_birth: string | null;
  guardian_name: string | null;
  emergency_contact: string | null;
  care_notes: string | null;
  notes: string | null;
  archived_at: string | null;
  created_at: string;
  programs: { project_id: string; project: { id: string; name: string } | null }[];
};

const PARTICIPANT_SELECT =
  "id, name, email, phone, date_of_birth, guardian_name, emergency_contact, care_notes, notes, archived_at, created_at, programs:participant_programs(project_id, project:projects(id, name))";

export async function listParticipants(
  orgId: string,
  filters: { q?: string; programId?: string; archived?: boolean },
): Promise<ParticipantRow[]> {
  const supabase = await createClient();
  let query = supabase.from("participants").select(PARTICIPANT_SELECT).eq("organization_id", orgId).order("name").limit(1000);
  query = filters.archived ? query.not("archived_at", "is", null) : query.is("archived_at", null);
  if (filters.q) query = query.ilike("name", `%${escapeLike(filters.q)}%`);
  const { data, error } = await query;
  if (error) throw error;
  const rows = (data ?? []) as ParticipantRow[];
  return filters.programId ? rows.filter((p) => p.programs.some((g) => g.project_id === filters.programId)) : rows;
}

export async function getParticipant(orgId: string, participantId: string): Promise<ParticipantRow | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("participants").select(PARTICIPANT_SELECT).eq("organization_id", orgId).eq("id", participantId).maybeSingle();
  return (data as ParticipantRow | null) ?? null;
}

export type Session = { id: string; title: string; starts_at: string; all_day: boolean; project_id: string };

/** A program's sessions (its calendar items) starting in [fromIso, toIso). */
export async function getSessions(orgId: string, programId: string, fromIso: string, toIso: string): Promise<Session[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("events")
    .select("id, title, starts_at, all_day, project_id")
    .eq("organization_id", orgId)
    .eq("project_id", programId)
    .gte("starts_at", fromIso)
    .lt("starts_at", toIso)
    .order("starts_at");
  if (error) throw error;
  return (data ?? []).flatMap((e) => (e.project_id ? [{ ...e, project_id: e.project_id }] : []));
}

export type Mark = {
  id: string;
  event_id: string;
  participant_id: string | null;
  status: AttendanceStatus;
  note: string | null;
  event: { id: string; title: string; starts_at: string; all_day: boolean; project_id: string | null } | null;
};

const MARK_SELECT = "id, event_id, participant_id, status, note, event:events!inner(id, title, starts_at, all_day, project_id)";

export async function getMarksForSession(orgId: string, eventId: string): Promise<Mark[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("attendance").select(MARK_SELECT).eq("organization_id", orgId).eq("event_id", eventId);
  if (error) throw error;
  return (data ?? []) as Mark[];
}

export async function getMarksForParticipant(orgId: string, participantId: string): Promise<Mark[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("attendance")
    .select(MARK_SELECT)
    .eq("organization_id", orgId)
    .eq("participant_id", participantId)
    .order("starts_at", { referencedTable: "events", ascending: false });
  if (error) throw error;
  return ((data ?? []) as Mark[]).sort((a, b) => (b.event?.starts_at ?? "").localeCompare(a.event?.starts_at ?? ""));
}

/** Every mark at sessions starting in [fromIso, toIso), optionally for one program. */
export async function getMarksInRange(orgId: string, fromIso: string, toIso: string, programId?: string): Promise<Mark[]> {
  const supabase = await createClient();
  let query = supabase
    .from("attendance")
    .select(MARK_SELECT)
    .eq("organization_id", orgId)
    .gte("event.starts_at", fromIso)
    .lt("event.starts_at", toIso)
    .limit(20000);
  if (programId) query = query.eq("event.project_id", programId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as Mark[];
}

/** Names for every participant the viewer can see, archived ones included (reports count them). */
export async function getParticipantNames(orgId: string): Promise<Map<string, string>> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("participants").select("id, name").eq("organization_id", orgId).limit(5000);
  if (error) throw error;
  return new Map((data ?? []).map((p) => [p.id, p.name]));
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}
