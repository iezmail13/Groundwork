import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { ReportView } from "@/components/reports/report-view";
import { ReportExports, SharePanel } from "@/components/reports/report-tools";
import { inputClass } from "@/components/ui/field";
import { getMembers, getOrgContext } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";
import { getProjectOptions } from "@/lib/queries";
import { availableTemplates, buildReport, templateName } from "@/lib/reports";
import { readReportParams } from "@/lib/report-params";
import { lower } from "@/lib/terminology/t";

export const metadata: Metadata = { title: "Reports" };

/**
 * Templated reports (D109): progress, people and workload, costs against
 * budget (owners and managers) and attendance (whoever runs a roster). Each
 * holds only what its author can see; print it, save it as PDF, download CSV
 * or share a read-only link.
 */
export default async function ReportsPage({ params, searchParams }: PageProps<"/[orgSlug]/reports">) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const ctx = await getOrgContext(orgSlug);
  const { t, org, base, today } = ctx;
  const [templates, projects] = await Promise.all([availableTemplates(ctx), getProjectOptions(org.id, true)]);
  const chosen = readReportParams(sp, today);
  const settings = chosen && templates.includes(chosen.template) ? chosen : null;
  const project = settings?.projectId ? projects.find((p) => p.id === settings.projectId) : null;
  const report =
    settings && typeof sp.template === "string"
      ? await buildReport(ctx, { ...settings, projectId: project?.id ?? null }, project?.name ?? "Everything you can see")
      : null;

  const supabase = await createClient();
  if (report) {
    await supabase.rpc("log_report", { org: org.id, action: "generated", details: { template: report.template, from: report.from, to: report.to } });
  }
  const [{ data: shares }, members] = await Promise.all([
    supabase.from("report_shares").select("id, title, created_at, expires_at, revoked_at, created_by").eq("organization_id", org.id).order("created_at", { ascending: false }).limit(20),
    getMembers(org.id),
  ]);
  const nameOf = new Map(members.map((m) => [m.userId, m.name]));
  const qs = settings ? `template=${settings.template}&project=${settings.projectId ?? ""}&from=${settings.from}&to=${settings.to}` : "";

  return (
    <div className="flex flex-col gap-6">
      <div className="print:hidden">
        <PageHeader
          title="Reports"
          description={`Progress, people, costs and ${lower(t("section.attendance"))}, built from what you can see. Print them, save them as PDF, download CSV, or share a read-only link.`}
        />
      </div>
      <form method="get" className="flex flex-wrap items-end gap-3 border-b border-rule pb-5 print:hidden" aria-label="Report settings">
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Report
          <select name="template" defaultValue={settings?.template ?? "progress"} className={inputClass}>
            {templates.map((tpl) => (
              <option key={tpl} value={tpl}>
                {templateName(tpl, t)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          {t("project")}
          <select name="project" defaultValue={settings?.projectId ?? ""} className={inputClass}>
            <option value="">All you can see</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          From
          <input type="date" name="from" defaultValue={settings?.from} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          To
          <input type="date" name="to" defaultValue={settings?.to} max={today} className={inputClass} />
        </label>
        <button type="submit" className="rounded-md bg-accent px-4 py-2 font-heading text-sm font-semibold text-on-accent">
          Show report
        </button>
        {chosen === null && typeof sp.template === "string" ? (
          <p role="alert" className="w-full text-sm font-semibold text-bad-ink">
            Check the dates: the end must be on or after the start.
          </p>
        ) : null}
      </form>

      {report && settings ? (
        <>
          <ReportExports
            params={{ orgSlug: org.slug, template: settings.template, projectId: settings.projectId ?? "", from: settings.from, to: settings.to }}
            csvHref={`${base}/reports/csv?${qs}`}
          />
          <ReportView report={report} />
          {report.template !== "attendance" ? (
            <SharePanel
              params={{ orgSlug: org.slug, template: settings.template, projectId: settings.projectId ?? "", from: settings.from, to: settings.to }}
              links={(shares ?? []).map((s) => ({
                id: s.id,
                title: s.title,
                createdAt: s.created_at,
                expiresAt: s.expires_at,
                revoked: s.revoked_at !== null,
                mine: s.created_by === ctx.userId,
                by: nameOf.get(s.created_by ?? "") ?? "Someone who left",
              }))}
            />
          ) : (
            <p className="text-sm text-ink-muted print:hidden">
              {t("section.attendance")} reports hold personal details, so they can be printed or downloaded but not shared by link.
            </p>
          )}
        </>
      ) : (
        <p className="text-sm text-ink-muted">Pick a report and the dates it covers, then choose Show report.</p>
      )}
    </div>
  );
}
