"use server";

import { z } from "zod";
import { getMembers, getOrgContext } from "@/lib/org";
import { queryActivity } from "@/lib/activity-log";
import { activityHref, describeActivity, timeAgo } from "@/lib/activity";

// The activity menu in the top bar (D110): the latest changes the viewer can
// see, read through the activity log's own RLS like the full page.

const slug = z.string().regex(/^[a-z0-9-]{1,48}$/);

export type RecentActivityItem = {
  id: string;
  entityType: string;
  sentence: string;
  label: string | null;
  href: string | null;
  at: string;
  ago: string;
};

export async function loadRecentActivity(input: { orgSlug: string }): Promise<{ ok: true; items: RecentActivityItem[] } | { ok: false }> {
  const parsed = z.object({ orgSlug: slug }).safeParse(input);
  if (!parsed.success) return { ok: false };
  const ctx = await getOrgContext(parsed.data.orgSlug);
  const [rows, members] = await Promise.all([queryActivity(ctx.org.id, {}, ctx.tz, { limit: 10 }), getMembers(ctx.org.id)]);
  const nameOf = new Map(members.map((m) => [m.id, m.name]));
  const now = Date.now();
  return {
    ok: true,
    items: rows.map((a) => {
      const who = (a.actor_membership_id && nameOf.get(a.actor_membership_id)) || a.metadata.actor_name || "Someone";
      return {
        id: a.id,
        entityType: a.entity_type,
        sentence: `${who} ${describeActivity(a, ctx.t)}`,
        label: a.metadata.label ?? null,
        href: activityHref(a, ctx.base),
        at: a.created_at,
        ago: timeAgo(a.created_at, now),
      };
    }),
  };
}
