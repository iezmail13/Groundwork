import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { DueBadge, NeedsAssigneeBadge, TaskStatusBadge } from "@/components/tasks/badges";
import { Lock } from "lucide-react";
import { TaskEditForm } from "@/components/tasks/task-edit-form";
import { getOrgContext } from "@/lib/org";
import { getAssigneeOptions } from "@/lib/projects";
import { canManageOrg } from "@/lib/roles";
import { getProjectOptions, TASK_SELECT, type TaskRow } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";
import { formatTimestamp } from "@/lib/dates";
import { lower } from "@/lib/terminology/t";
import { creatorLock } from "@/lib/creator-lock";
import { TaskCheckbox } from "@/components/tasks/task-checkbox";

const UUID = /^[0-9a-f-]{36}$/i;

async function loadTask(orgId: string, taskId: string) {
  if (!UUID.test(taskId)) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("tasks").select(TASK_SELECT).eq("organization_id", orgId).eq("id", taskId).maybeSingle();
  return data as TaskRow | null;
}

export async function generateMetadata({ params }: PageProps<"/[orgSlug]/tasks/[taskId]">): Promise<Metadata> {
  const { orgSlug, taskId } = await params;
  const ctx = await getOrgContext(orgSlug);
  const task = await loadTask(ctx.org.id, taskId);
  return { title: task?.title ?? ctx.t("task") };
}

export default async function TaskPage({ params }: PageProps<"/[orgSlug]/tasks/[taskId]">) {
  const { orgSlug, taskId } = await params;
  const ctx = await getOrgContext(orgSlug);
  const { t, base, org, today } = ctx;
  const task = await loadTask(org.id, taskId);
  if (!task) notFound();

  const supabase = await createClient();
  const [projects, assigneeOptions, { data: ranks }] = await Promise.all([
    getProjectOptions(org.id),
    getAssigneeOptions(org.id),
    supabase.rpc("my_project_ranks", { org_id: org.id }),
  ]);
  // an archived project's tasks can't be edited, but it still shows as the current project
  const projectChoices =
    task.project && !projects.some((p) => p.id === task.project_id)
      ? [...projects, { id: task.project.id, name: task.project.name }]
      : projects;
  // inviting from a task grants its project, which needs project admin or lead there
  const invite = canManageOrg(ctx.role)
    ? {
        href: `${base}/settings?view=members`,
        projectIds: (ranks ?? []).filter((r) => r.rank >= 2).map((r) => r.project_id),
      }
    : null;

  // someone ranked above the viewer made it: read-only, though its assignee can still mark it done
  const locked = creatorLock(t, ctx, task.created_by, task.created_by_role);

  return (
    <div className="flex flex-col gap-6">
      <Link href={`${base}/tasks`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline">
        <ArrowLeft aria-hidden className="size-4" />
        All {lower(t("task", "other"))}
      </Link>
      <PageHeader
        title={task.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <TaskStatusBadge status={task.status} label={t(`status.${task.status}`)} />
            <DueBadge dueDate={task.due_date} status={task.status} today={today} />
            {task.needs_assignee && !task.assignee_membership_id && !task.assignee_invitation_id && task.status !== "done" ? (
              <NeedsAssigneeBadge />
            ) : null}
            {task.project ? (
              <Link href={`${base}/projects/${task.project.id}`} className="text-sm hover:underline">
                in {task.project.name}
              </Link>
            ) : null}
            {task.completed_at ? (
              <span className="text-sm">Completed {formatTimestamp(task.completed_at, ctx.tz)}</span>
            ) : null}
          </span>
        }
      />
      {task.project?.status === "archived" ? (
        <div className="flex max-w-2xl flex-col gap-3">
          <p className="flex items-center gap-2 border-l-4 border-ink pl-3 text-sm">
            <Lock aria-hidden className="size-4" />
            {task.project.name} is {lower(t("status.archived"))}, so this {lower(t("task"))} is read-only.
          </p>
          {task.description ? <p className="whitespace-pre-wrap">{task.description}</p> : null}
        </div>
      ) : locked ? (
        <div className="flex max-w-2xl flex-col gap-4">
          <p className="flex items-start gap-2 border-l-4 border-ink pl-3 text-sm">
            <Lock aria-hidden className="mt-0.5 size-4 shrink-0" />
            {locked}
            {task.assignee_membership_id === ctx.membershipId ? " As its assignee, you can still mark it done." : ""}
          </p>
          {task.assignee_membership_id === ctx.membershipId ? (
            <p className="flex items-center gap-2 font-semibold">
              <TaskCheckbox id={task.id} title={task.title} done={task.status === "done"} />
              {task.status === "done" ? t("status.done") : `Mark ${lower(t("status.done"))}`}
            </p>
          ) : null}
          {task.description ? <p className="whitespace-pre-wrap">{task.description}</p> : null}
        </div>
      ) : (
      <TaskEditForm
        task={task}
        projects={projectChoices}
        assigneeOptions={assigneeOptions}
        invite={invite}
        orgSlug={org.slug}
      />
      )}
    </div>
  );
}
