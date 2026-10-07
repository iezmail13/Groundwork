import type { Metadata } from "next";
import { ListChecks, SearchX } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { TaskBoard } from "@/components/tasks/task-board";
import { TaskTable, type SortKey } from "@/components/tasks/task-table";
import { FilterBar } from "@/components/tasks/filter-bar";
import { QuickAddTask } from "@/components/tasks/quick-add";
import { getMembers, getOrgContext, initials } from "@/lib/org";
import { getProjectOptions, TASK_SELECT, type TaskRow } from "@/lib/queries";
import { filterTasks, readFilters, readSort, sortTasks } from "@/lib/task-filters";
import { createClient } from "@/lib/supabase/server";
import { lower } from "@/lib/terminology/t";

export async function generateMetadata({ params }: PageProps<"/[orgSlug]/tasks">): Promise<Metadata> {
  const { t } = await getOrgContext((await params).orgSlug);
  return { title: t("task", "other") };
}

export default async function TasksPage({ params, searchParams }: PageProps<"/[orgSlug]/tasks">) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const view = sp.view === "list" ? "list" : "board";
  const ctx = await getOrgContext(orgSlug);
  const { t, org, base, today } = ctx;
  const supabase = await createClient();

  const [{ data, error }, members, projects] = await Promise.all([
    supabase.from("tasks").select(TASK_SELECT).eq("organization_id", org.id).order("position").limit(2000),
    getMembers(org.id),
    getProjectOptions(org.id),
  ]);
  if (error) throw error;
  const all = (data ?? []) as TaskRow[];
  const filters = readFilters(sp);
  const sort = readSort(sp);
  const memberName = new Map(members.map((m) => [m.id, m.name]));
  // the board shows every status as a column, so the status filter is list-only
  const visible = filterTasks(all, view === "board" ? { ...filters, status: undefined } : filters, today, ctx.membershipId);
  const plural = t("task", "other");

  const sortHref = (key: SortKey) => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (typeof v === "string") next.set(k, v);
    next.set("view", "list");
    next.set("sort", key);
    next.set("dir", sort.key === key && sort.dir === "asc" ? "desc" : "asc");
    return `${base}/tasks?${next.toString()}`;
  };

  const tabHref = (v: string) => {
    const next = new URLSearchParams();
    for (const k of ["project", "assignee", "due"]) if (typeof sp[k] === "string") next.set(k, sp[k] as string);
    if (v === "list") next.set("view", "list");
    const qs = next.toString();
    return `${base}/tasks${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={plural}
        tabsLabel={`${plural} views`}
        tabs={[
          { label: "Board", href: tabHref("board"), active: view === "board" },
          { label: "List", href: tabHref("list"), active: view === "list" },
        ]}
      />

      {all.length === 0 && projects.length === 0 ? (
        <EmptyState icon={<ListChecks />} title={`No ${lower(plural)} yet`}>
          Every {lower(t("task"))} belongs to a {lower(t("project"))}. Create a {lower(t("project"))} first, then add{" "}
          {lower(plural)} here or on its page.
        </EmptyState>
      ) : (
        <>
          <FilterBar
            showStatus={view === "list"}
            projects={projects.map((p) => ({ value: p.id, label: p.name }))}
            members={members.map((m) => ({ value: m.id, label: m.name }))}
          />
          {view === "board" ? (
            <TaskBoard
              tasks={visible}
              base={base}
              today={today}
              organizationId={org.id}
              projects={projects}
              memberInitials={Object.fromEntries(members.map((m) => [m.id, { initials: initials(m.name), name: m.name }]))}
            />
          ) : (
            <div className="flex flex-col gap-4">
              <QuickAddTask organizationId={org.id} projects={projects} idSuffix="list" />
              {visible.length === 0 ? (
                <EmptyState icon={<SearchX />} title={`No ${lower(plural)} match`}>
                  {all.length === 0
                    ? `Add your first ${lower(t("task"))} above.`
                    : "Try clearing a filter to see more."}
                </EmptyState>
              ) : (
                <TaskTable
                  tasks={sortTasks(visible, sort, memberName)}
                  base={base}
                  today={today}
                  t={t}
                  memberName={memberName}
                  sort={sort}
                  sortHref={sortHref}
                  caption={`${plural}, ${visible.length} shown`}
                />
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
