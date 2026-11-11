import Link from "next/link";
import type { Metadata } from "next";
import { Archive, CircleDot, FolderKanban } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { ProjectDot } from "@/components/tasks/badges";
import { ProgressBar } from "@/components/projects/progress";
import { NewProjectButton } from "@/components/projects/project-dialogs";
import { getOrgContext } from "@/lib/org";
import { getProjectLeads } from "@/lib/projects";
import { rankOf } from "@/lib/roles";
import { getProjectProgress } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/dates";
import { lower } from "@/lib/terminology/t";

export async function generateMetadata({ params }: PageProps<"/[orgSlug]/projects">): Promise<Metadata> {
  const { t } = await getOrgContext((await params).orgSlug);
  return { title: t("project", "other") };
}

export default async function ProjectsPage({ params, searchParams }: PageProps<"/[orgSlug]/projects">) {
  const { orgSlug } = await params;
  const view = (await searchParams).view === "archived" ? "archived" : "all";
  const ctx = await getOrgContext(orgSlug);
  const { t, org, base } = ctx;
  const supabase = await createClient();

  let query = supabase
    .from("projects")
    .select("id, name, description, status, color, start_date, end_date, updated_at")
    .eq("organization_id", org.id)
    .order("status")
    .order("name");
  if (view === "archived") query = query.eq("status", "archived");
  const [{ data: projects, error }, progress, leads] = await Promise.all([
    query,
    getProjectProgress(org.id),
    getProjectLeads(org.id),
  ]);
  if (error) throw error;
  const plural = t("project", "other");
  // creating a project needs org admin or above
  const newButton = rankOf(ctx.role) >= 2 ? <NewProjectButton organizationId={org.id} /> : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={plural}
        tabsLabel={`${plural} views`}
        tabs={[
          { label: "All", href: `${base}/projects`, active: view === "all" },
          { label: t("status.archived"), href: `${base}/projects?view=archived`, active: view === "archived" },
        ]}
        actions={newButton}
      />

      {!projects?.length ? (
        view === "archived" ? (
          <EmptyState icon={<Archive />} title={`No ${lower(t("status.archived"))} ${lower(plural)}`}>
            When you archive a {lower(t("project"))}, it moves here. Archived {lower(plural)} keep all of their{" "}
            {lower(t("task", "other"))} and can be restored at any time.
          </EmptyState>
        ) : (
          <EmptyState
            icon={<FolderKanban />}
            illustration="projects"
            title={`No ${lower(plural)} yet`}
            action={newButton}
          >
            {plural} group your {lower(t("task", "other"))}, {lower(t("event", "other"))} and{" "}
            {lower(t("document", "other"))}.{" "}
            {newButton
              ? "Create the first one to get started."
              : `You'll see the ones you're added to here.`}
          </EmptyState>
        )
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left">
            <caption className="sr-only">
              {view === "archived" ? `${t("status.archived")} ${lower(plural)}` : `All ${lower(plural)}`}
            </caption>
            <thead>
              <tr className="border-b border-ink font-heading text-sm">
                <th scope="col" className="py-2 pr-4 font-semibold">Name</th>
                <th scope="col" className="py-2 pr-4 font-semibold">{t("project_role.lead", "other")}</th>
                <th scope="col" className="py-2 pr-4 font-semibold">Progress</th>
                <th scope="col" className="py-2 pr-4 font-semibold">Dates</th>
                <th scope="col" className="py-2 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => {
                const prog = progress.get(p.id) ?? { done: 0, total: 0 };
                return (
                  <tr key={p.id} className="border-b border-rule hover:bg-tint">
                    <th scope="row" className="py-3 pr-4 font-normal">
                      <Link href={`${base}/projects/${p.id}`} className="flex items-center gap-2 font-semibold hover:underline">
                        <ProjectDot color={p.color} />
                        {p.name}
                      </Link>
                      {p.description ? (
                        <p className="mt-0.5 line-clamp-1 max-w-md pl-4.5 text-sm text-ink-muted">{p.description}</p>
                      ) : null}
                    </th>
                    <td className="py-3 pr-4 text-sm">
                      {leads.get(p.id)?.join(", ") || <span className="text-ink-muted">None</span>}
                    </td>
                    <td className="py-3 pr-4">
                      <ProgressBar done={prog.done} total={prog.total} label={`${p.name} progress`} />
                    </td>
                    <td className="py-3 pr-4 text-sm whitespace-nowrap text-ink-muted">
                      {p.start_date ? formatDate(p.start_date) : "—"} – {p.end_date ? formatDate(p.end_date, { month: "short", day: "numeric", year: "numeric" }) : "—"}
                    </td>
                    <td className="py-3">
                      {p.status === "archived" ? (
                        <Badge variant="quiet" icon={<Archive aria-hidden className="size-3.5" />}>
                          {t("status.archived")}
                        </Badge>
                      ) : (
                        <Badge variant="good" icon={<CircleDot aria-hidden className="size-3.5" />}>{t("status.active")}</Badge>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
