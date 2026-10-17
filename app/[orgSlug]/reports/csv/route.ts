import { NextResponse, type NextRequest } from "next/server";
import { getOrgContext } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";
import { getProjectOptions } from "@/lib/queries";
import { availableTemplates, buildReport } from "@/lib/reports";
import { readReportParams } from "@/lib/report-params";
import { reportCsvRows } from "@/lib/report-model";
import { toCsv } from "@/lib/attendance-report";

/** A report as CSV (D109): the same figures and tables, formula-safe. Recorded in the activity log. */
export async function GET(request: NextRequest, route: RouteContext<"/[orgSlug]/reports/csv">) {
  const { orgSlug } = await route.params;
  const ctx = await getOrgContext(orgSlug);
  const sp = Object.fromEntries(request.nextUrl.searchParams.entries());
  const settings = readReportParams(sp, ctx.today);
  if (!settings || !(await availableTemplates(ctx)).includes(settings.template)) return new NextResponse("Not found", { status: 404 });
  const project = settings.projectId ? (await getProjectOptions(ctx.org.id, true)).find((p) => p.id === settings.projectId) : null;
  const report = await buildReport(ctx, { ...settings, projectId: project?.id ?? null }, project?.name ?? "Everything you can see");
  if (!report) return new NextResponse("Not found", { status: 404 });
  const supabase = await createClient();
  await supabase.rpc("log_report", { org: ctx.org.id, action: "exported_csv", details: { template: report.template, from: report.from, to: report.to } });
  const file = `${report.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${report.from}-to-${report.to}.csv`;
  return new NextResponse(toCsv(reportCsvRows(report)), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${file}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
