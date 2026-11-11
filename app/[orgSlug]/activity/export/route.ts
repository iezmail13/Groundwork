import { NextResponse, type NextRequest } from "next/server";
import { getMembers, getOrgContext } from "@/lib/org";
import { getProjectOptions } from "@/lib/queries";
import { projectOf, queryActivity, readActivityFilters } from "@/lib/activity-log";
import { describeActivity } from "@/lib/activity";
import { toCsv } from "@/lib/attendance-report";
import { formatTimestamp } from "@/lib/dates";

const MAX_ROWS = 10_000;

/**
 * The activity log as CSV, with the page's filters (D103). Owners only:
 * anyone else gets a 404. Cells are formula-safe, as in the attendance export.
 */
export async function GET(request: NextRequest, route: RouteContext<"/[orgSlug]/activity/export">) {
  const { orgSlug } = await route.params;
  const ctx = await getOrgContext(orgSlug);
  if (ctx.role !== "owner") return new NextResponse("Not found", { status: 404 });
  const { org, t, tz, today } = ctx;
  const filters = readActivityFilters(Object.fromEntries(request.nextUrl.searchParams));
  const [rows, members, projects] = await Promise.all([
    queryActivity(org.id, filters, tz, { limit: MAX_ROWS }),
    getMembers(org.id),
    getProjectOptions(org.id, true),
  ]);
  const nameOf = new Map(members.map((m) => [m.id, m.name]));
  const projectName = new Map(projects.map((p) => [p.id, p.name]));
  const csv = toCsv([
    ["When (UTC)", "When (local)", "Who", "What", "Kind", "Change", "Item", t("project")],
    ...rows.map((a) => {
      const project = projectOf(a);
      return [
        a.created_at,
        formatTimestamp(a.created_at, tz),
        (a.actor_membership_id && nameOf.get(a.actor_membership_id)) || a.metadata.actor_name || "Someone",
        describeActivity(a, t),
        a.entity_type,
        a.action,
        a.metadata.label ?? "",
        project ? (projectName.get(project) ?? "") : "",
      ];
    }),
  ]);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="activity-${org.slug}-${today}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
