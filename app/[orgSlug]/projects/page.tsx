import Link from "next/link";
import type { Metadata } from "next";
import { Archive, FolderKanban } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { ProjectDot } from "@/components/tasks/badges";
import { ProgressBar } from "@/components/projects/progress";
import { NewProjectButton } from "@/components/projects/project-dialogs";
import { getMembers, getOrgContext } from "@/lib/org";
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
    .select("id, name, description, status, color, owner_membership_id, start_date, end_date, updated_at")
    .eq("organization_id", org.id)
    .order("status")
    .order("name");
  if (view === "archived") query = query.eq("status", "archived");
  const [{ data: projects, error }, progress, members] = await Promise.all([
    query,
    getProjectProgress(org.id),
    getMembers(org.id),
  ]);
  if (error) throw error;
  const memberName = new Map(members.map((m) => [m.id, m.name]));
  const plural = t("project", "other");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={plural}
        tabsLabel={`${plural} views`}
        tabs={[
          { label: "All", href: `${base}/projects`, active: view === "all" },
          { label: t("status.archived"), href: `${base}/projects?view=archived`, active: view === "archived" },
        ]}
        actions={<NewProjectButton organizationId={org.id} members={members.map((m) => ({ id: m.id, name: m.name }))} />}
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
            title={`No ${lower(plural)} yet`}
            action={<NewProjectButton organizationId={org.id} members={members.map((m) => ({ id: m.id, name: m.name }))} />}
          >
            {plural} group your {lower(t("task", "other"))}, {lower(t("event", "other"))} and{" "}
            {lower(t("document", "other"))}. Create the first one to get started.
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
                <th scope="col" className="py-2 pr-4 font-semibold">Owner</th>
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
                      {p.owner_membership_id ? memberName.get(p.owner_membership_id) : <span className="text-ink-muted">None</span>}
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
                        <Badge variant="outline">{t("status.active")}</Badge>
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
