import "server-only";
import { createClient } from "@/lib/supabase/server";
import { addDays, isIsoDate, zonedTimeToUtc } from "@/lib/dates";
import type { ActivityRow } from "@/lib/queries";

// The full activity log (D103). RLS decides what each person sees (owners see
// everything; others see their programs' activity, filtered by
// can_view_task, with funds and participants following their own rules).
// These helpers only apply the viewer's filters.

export const ACTIVITY_ACTIONS = [
  "created",
  "uploaded",
  "updated",
  "moved",
  "completed",
  "archived",
  "restored",
  "pinned",
  "unpinned",
  "deleted",
] as const;
export type ActivityAction = (typeof ACTIVITY_ACTIONS)[number];

export type ActivityFilters = {
  person?: string;
  project?: string;
  action?: ActivityAction;
  from?: string;
  to?: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function readActivityFilters(sp: Record<string, string | string[] | undefined>): ActivityFilters {
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const person = one("person");
  const project = one("project");
  const action = one("action");
  const from = one("from");
  const to = one("to");
  return {
    person: person && UUID.test(person) ? person : undefined,
    project: project && UUID.test(project) ? project : undefined,
    action: (ACTIVITY_ACTIONS as readonly string[]).includes(action ?? "") ? (action as ActivityAction) : undefined,
    from: from && isIsoDate(from) ? from : undefined,
    to: to && isIsoDate(to) ? to : undefined,
  };
}

export function filterQuery(f: ActivityFilters): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v) p.set(k, v);
  return p.toString();
}

export async function queryActivity(
  orgId: string,
  f: ActivityFilters,
  tz: string,
  { limit, before }: { limit: number; before?: string },
): Promise<ActivityRow[]> {
  const supabase = await createClient();
  let q = supabase
    .from("activity_log")
    .select("id, entity_type, entity_id, action, metadata, created_at, actor_membership_id")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (f.person) q = q.eq("actor_membership_id", f.person);
  if (f.action) q = q.eq("action", f.action);
  // a program's activity is everything about it and in it
  if (f.project) q = q.or(`metadata->>project_id.eq.${f.project},and(entity_type.eq.project,entity_id.eq.${f.project})`);
  // dates are days where the viewer is
  if (f.from) q = q.gte("created_at", zonedTimeToUtc(f.from, "00:00", tz).toISOString());
  if (f.to) q = q.lt("created_at", zonedTimeToUtc(addDays(f.to, 1), "00:00", tz).toISOString());
  if (before && !Number.isNaN(Date.parse(before))) q = q.lt("created_at", new Date(before).toISOString());
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as ActivityRow[];
}

/** The program an entry is about or in, if any. */
export function projectOf(a: ActivityRow): string | null {
  if (a.entity_type === "project") return a.entity_id;
  return a.metadata.project_id ?? null;
}
