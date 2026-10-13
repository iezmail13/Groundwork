import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Archive, ArrowLeft, CalendarDays, Download, FileText, ListChecks, Lock, Users } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { ProjectDot } from "@/components/tasks/badges";
import { ProgressBar } from "@/components/projects/progress";
import { ArchiveProjectButton, DeleteProjectButton, EditProjectButton } from "@/components/projects/project-dialogs";
import { TaskTable } from "@/components/tasks/task-table";
import { QuickAddTask } from "@/components/tasks/quick-add";
import { NewEventButton, EventRowButton } from "@/components/calendar/event-buttons";
import { UploadButton } from "@/components/documents/upload-form";
import { FileIcon, formatBytes } from "@/components/documents/file-icon";
import { getMembers, getOrgContext } from "@/lib/org";
import { getAssigneeNames, getMyProjectRank, getProjectRoster } from "@/lib/projects";
import { ProjectPeople } from "@/components/projects/people";
import { rankOf } from "@/lib/roles";
import { DOCUMENT_SELECT, EVENT_SELECT, getProjectOptions, TASK_SELECT, type DocumentRow, type EventRow, type TaskRow } from "@/lib/queries";
import { sortTasks } from "@/lib/task-filters";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatTime, eventStartDate, formatRelativeDate } from "@/lib/dates";
import { toEventFormValues } from "@/lib/event-values";
import { creatorLock } from "@/lib/creator-lock";
import { lower } from "@/lib/terminology/t";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function loadProject(orgId: string, projectId: string) {
  if (!UUID.test(projectId)) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("projects").select("*").eq("organization_id", orgId).eq("id", projectId).maybeSingle();
  return data;
}

export async function generateMetadata({ params }: PageProps<"/[orgSlug]/projects/[projectId]">): Promise<Metadata> {
  const { orgSlug, projectId } = await params;
  const ctx = await getOrgContext(orgSlug);
  const project = await loadProject(ctx.org.id, projectId);
  return { title: project?.name ?? ctx.t("project") };
}

export default async function ProjectPage({ params }: PageProps<"/[orgSlug]/projects/[projectId]">) {
  const { orgSlug, projectId } = await params;
  const ctx = await getOrgContext(orgSlug);
  const { t, org, base, today, tz } = ctx;
  const project = await loadProject(org.id, projectId);
  if (!project) notFound();

  const supabase = await createClient();
  const [{ data: taskData }, { data: eventData }, { data: docData }, members, projects, roster, myRank, assigneeNames] = await Promise.all([
    supabase.from("tasks").select(TASK_SELECT).eq("project_id", project.id).order("position"),
    supabase.from("events").select(EVENT_SELECT).eq("project_id", project.id).order("starts_at"),
    supabase.from("documents").select(DOCUMENT_SELECT).eq("project_id", project.id).order("pinned", { ascending: false }).order("created_at", { ascending: false }),
    getMembers(org.id),
    getProjectOptions(org.id),
    getProjectRoster(org.id, project.id),
    getMyProjectRank(project.id),
    getAssigneeNames(org.id),
  ]);
  const tasks = (taskData ?? []) as TaskRow[];
  const events = (eventData ?? []) as EventRow[];
  const docs = (docData ?? []) as DocumentRow[];
  const done = tasks.filter((x) => x.status === "done").length;
  const archived = project.status === "archived";
  // project admins and leads edit it; leads (and owners) delete it; unless
  // someone ranked above them made it
  const projectLock = creatorLock(t, ctx, project.created_by, project.created_by_role);
  const canEdit = myRank >= 2 && !projectLock;
  const canDelete = myRank >= 3 && !projectLock;
  // anyone's items: project admins and leads, owners, and org managers on the project
  const canManageItems = !archived && (myRank >= 2 || (myRank >= 1 && rankOf(ctx.role) >= 3));
  const onProject = new Set(roster.map((r) => r.membershipId));
  const leads = roster.filter((r) => r.role === "lead").map((r) => r.name);
  const nowIso = new Date().toISOString();
  const upcoming = events.filter((e) => e.ends_at >= nowIso);
  const past = events.filter((e) => e.ends_at < nowIso).reverse().slice(0, 5);
  const projectsForForms = archived ? [...projects, { id: project.id, name: project.name }] : projects;

  const eventWhen = (e: EventRow) =>
    `${formatRelativeDate(eventStartDate(e.starts_at, e.all_day, tz), today)}${e.all_day ? ", all day" : `, ${formatTime(e.starts_at, tz)}`}`;

  return (
    <div className="flex flex-col gap-8">
      <Link href={`${base}/projects`} className="inline-flex items-center gap-1.5 text-sm font-semibold hover:underline">
        <ArrowLeft aria-hidden className="size-4" />
        All {lower(t("project", "other"))}
      </Link>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <ProjectDot color={project.color} />
            {project.name}
          </span>
        }
        description={
          <span className="flex flex-col gap-2">
            {project.description ? <span>{project.description}</span> : null}
            <span className="flex flex-wrap items-center gap-3 text-sm">
              {archived ? (
                <Badge variant="filled" icon={<Archive aria-hidden className="size-3.5" />}>
                  {t("status.archived")}
                </Badge>
              ) : (
                <Badge variant="outline">{t("status.active")}</Badge>
              )}
              {project.tracks_participants && myRank >= 2 ? (
                <Link href={`${base}/attendance?program=${project.id}`} className="font-semibold hover:underline">
                  {t("participant", "other")} and {lower(t("section.attendance"))}
                </Link>
              ) : null}
              {leads.length ? (
                <span>
                  {t("project_role.lead", leads.length === 1 ? "one" : "other")}: {leads.join(", ")}
                </span>
              ) : null}
              {project.start_date || project.end_date ? (
                <span>
                  {project.start_date ? formatDate(project.start_date) : "—"} to{" "}
                  {project.end_date ? formatDate(project.end_date, { month: "short", day: "numeric", year: "numeric" }) : "—"}
                </span>
              ) : null}
            </span>
          </span>
        }
        actions={
          <>
            {canEdit && !archived ? (
              <EditProjectButton
                organizationId={org.id}
                project={{
                  id: project.id,
                  name: project.name,
                  description: project.description,
                  color: project.color,
                  start_date: project.start_date,
                  end_date: project.end_date,
                  tracks_participants: project.tracks_participants,
                }}
              />
            ) : null}
            {canEdit ? <ArchiveProjectButton id={project.id} archived={archived} /> : null}
            {canDelete ? <DeleteProjectButton id={project.id} orgSlug={org.slug} name={project.name} /> : null}
          </>
        }
      />

      {projectLock && myRank >= 2 ? (
        <p className="flex items-center gap-2 border-l-4 border-ink pl-3 text-sm">
          <Lock aria-hidden className="size-4" />
          {projectLock}
        </p>
      ) : null}
      {archived ? (
        <p className="flex items-center gap-2 border-l-4 border-ink pl-3 text-sm">
          <Lock aria-hidden className="size-4" />
          This {lower(t("project"))} is {lower(t("status.archived"))}, so everything in it is read-only.
          {canEdit ? " Restore it to make changes." : ""}
        </p>
      ) : null}

      <section aria-labelledby="project-tasks" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="project-tasks" className="flex items-center gap-2 text-xl font-bold">
            <ListChecks aria-hidden className="size-5" />
            {t("task", "other")}
          </h2>
          <div className="w-56">
            <ProgressBar done={done} total={tasks.length} label={`${project.name} progress`} />
          </div>
        </div>
        {archived ? null : <QuickAddTask organizationId={org.id} projectId={project.id} idSuffix="project" />}
        {tasks.length ? (
          <TaskTable
            tasks={sortTasks(tasks, { key: "status", dir: "asc" }, assigneeNames)}
            base={base}
            today={today}
            t={t}
            memberName={assigneeNames}
            showProject={false}
            caption={`${t("task", "other")} in ${project.name}`}
          />
        ) : (
          <p className="border-y border-dashed border-rule py-6 text-center text-ink-muted">
            No {lower(t("task", "other"))} yet. Add the first one above.
          </p>
        )}
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        <section aria-labelledby="project-events" className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 id="project-events" className="flex items-center gap-2 text-xl font-bold">
              <CalendarDays aria-hidden className="size-5" />
              {t("event", "other")}
            </h2>
            {archived ? null : <NewEventButton organizationId={org.id} projects={projectsForForms} date={today} projectId={project.id} />}
          </div>
          {upcoming.length === 0 && past.length === 0 ? (
            <p className="border-y border-dashed border-rule py-6 text-center text-ink-muted">
              No {lower(t("event", "other"))} linked yet.
            </p>
          ) : (
            <>
              <h3 className="font-heading text-sm font-bold text-ink-muted">Upcoming</h3>
              {upcoming.length ? (
                <ul className="divide-y divide-rule border-y border-rule">
                  {upcoming.map((e) => (
                    <li key={e.id}>
                      <EventRowButton
                        organizationId={org.id}
                        projects={projectsForForms}
                        values={toEventFormValues(e, tz, canManageItems || (!archived && e.created_by === ctx.userId), creatorLock(t, ctx, e.created_by, e.created_by_role))}
                        when={eventWhen(e)}
                        location={e.location}
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-ink-muted">Nothing coming up.</p>
              )}
              {past.length ? (
                <>
                  <h3 className="font-heading text-sm font-bold text-ink-muted">Recent</h3>
                  <ul className="divide-y divide-rule border-y border-rule">
                    {past.map((e) => (
                      <li key={e.id}>
                        <EventRowButton
                          organizationId={org.id}
                          projects={projectsForForms}
                          values={toEventFormValues(e, tz, canManageItems || (!archived && e.created_by === ctx.userId), creatorLock(t, ctx, e.created_by, e.created_by_role))}
                          when={eventWhen(e)}
                          location={e.location}
                        />
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </>
          )}
        </section>

        <section aria-labelledby="project-docs" className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 id="project-docs" className="flex items-center gap-2 text-xl font-bold">
              <FileText aria-hidden className="size-5" />
              {t("document", "other")}
            </h2>
            {archived ? null : (
              <UploadButton organizationId={org.id} projects={projectsForForms} projectId={project.id} variant="secondary" />
            )}
          </div>
          {docs.length ? (
            <ul className="divide-y divide-rule border-y border-rule">
              {docs.map((d) => (
                <li key={d.id} className="flex items-center gap-3 py-2">
                  <FileIcon mime={d.mime_type} />
                  <div className="min-w-0 flex-1">
                    <a href={`${base}/documents/${d.id}/download`} className="font-semibold break-all hover:underline">
                      {d.name}
                    </a>
                    <p className="text-sm text-ink-muted">
                      {formatBytes(d.size_bytes)}
                      {d.tags.length ? ` · ${d.tags.map((x) => `#${x}`).join(" ")}` : ""}
                    </p>
                  </div>
                  <a href={`${base}/documents/${d.id}/download`} aria-label={`Download ${d.name}`} className="rounded p-1.5 hover:bg-panel">
                    <Download aria-hidden className="size-4" />
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="border-y border-dashed border-rule py-6 text-center text-ink-muted">
              No {lower(t("document", "other"))} linked yet.
            </p>
          )}
        </section>
      </div>

      <section aria-labelledby="project-people" className="flex flex-col gap-3">
        <h2 id="project-people" className="flex items-center gap-2 text-xl font-bold">
          <Users aria-hidden className="size-5" />
          People
        </h2>
        <ProjectPeople
          organizationId={org.id}
          projectId={project.id}
          orgSlug={org.slug}
          myRank={myRank}
          myMembershipId={ctx.membershipId}
          roster={roster}
          candidates={members
            .filter((m) => m.role !== "owner" && !onProject.has(m.id))
            .map((m) => ({ membershipId: m.id, name: m.name, orgRole: m.role }))}
          owners={members.filter((m) => m.role === "owner").map((m) => m.name)}
          adminsToAdd={members.filter((m) => m.role === "admin" && !onProject.has(m.id)).length}
          archived={archived}
        />
      </section>
    </div>
  );
}
