import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, ExternalLink, EyeOff } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { DueBadge, NeedsAssigneeBadge, PriorityFlag, TaskStatusBadge } from "@/components/tasks/badges";
import { Lock } from "lucide-react";
import { TaskForm } from "@/components/tasks/task-form";
import { ClaimButton } from "@/components/tasks/claim-button";
import { getTaskFormData } from "@/lib/task-form-data";
import { getOrgContext } from "@/lib/org";
import { getAssigneeNames } from "@/lib/projects";
import { TASK_SELECT, type TaskRow } from "@/lib/queries";
import { assigneeIds, isAssignee } from "@/lib/task-filters";
import { getAvatars } from "@/lib/members";
import { getChatPeople } from "@/lib/chat";
import { getTaskComments } from "@/lib/comments";
import { CommentThread } from "@/components/comments/comment-thread";
import { createClient } from "@/lib/supabase/server";
import { formatTimestamp } from "@/lib/dates";
import { lower } from "@/lib/terminology/t";
import { creatorLock } from "@/lib/creator-lock";
import { TaskDoneBox } from "@/components/tasks/task-checkbox";

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
  const [form, { data: shares }, memberName] = await Promise.all([
    getTaskFormData(ctx),
    supabase.from("task_shares").select("membership_id").eq("task_id", task.id),
    getAssigneeNames(org.id),
  ]);
  // an archived project's tasks can't be edited, but it still shows as the current project
  const projectChoices =
    task.project && !form.projects.some((p) => p.id === task.project_id)
      ? [...form.projects, { id: task.project.id, name: task.project.name }]
      : form.projects;
  const [avatars, chatPeople, comments] = await Promise.all([getAvatars(org.id, base), getChatPeople(ctx), getTaskComments(ctx, task.id)]);
  const people = assigneeIds(task).map((id) => ({ id, name: memberName.get(id) ?? "Someone", href: avatars[id]?.href ?? null }));

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
            <PriorityFlag priority={task.priority} label={t(`priority.${task.priority}`)} />
            <DueBadge dueDate={task.due_date} status={task.status} today={today} />
            <span className="text-sm">{t(`task_kind.${task.kind}`)}</span>
            {task.hidden ? (
              <span className="inline-flex items-center gap-1 text-sm">
                <EyeOff aria-hidden className="size-4" />
                Hidden from other collaborators
              </span>
            ) : null}
            {task.needs_assignee && task.assignees.length === 0 && task.status !== "done" ? (
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
      {task.link_url ? (
        <a
          href={task.link_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-accent hover:underline"
        >
          <ExternalLink aria-hidden className="size-4" />
          Open the link for this work
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      ) : null}
      <section aria-label="People and progress" className="flex flex-wrap items-center gap-x-4 gap-y-2 border-y border-rule py-3">
        <TaskDoneBox task={task} />
        <span className="text-sm">
          {people.length ? (
            <>
              <span className="font-semibold">On it:</span>{" "}
              {people.map((p, i) => (
                <span key={p.id}>
                  {i > 0 ? ", " : ""}
                  {p.href ? (
                    <Link href={p.href} className="hover:underline">
                      {p.name}
                    </Link>
                  ) : (
                    p.name
                  )}
                </span>
              ))}
              {task.completion === "all" && people.length > 1
                ? ` (${task.assignees.filter((a) => a.done_at).length} of ${people.length} done)`
                : ""}
            </>
          ) : (
            <span className="text-ink-muted">Nobody is on it yet.</span>
          )}
          {task.claim_limit !== null ? <span className="text-ink-muted"> · {task.assignees.length} of {task.claim_limit} spots taken</span> : null}
        </span>
        <ClaimButton task={task} size="md" />
      </section>
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
            {isAssignee(task, ctx.membershipId) ? " As its assignee, you can still mark it done." : ""}
          </p>
          {task.description ? <p className="whitespace-pre-wrap">{task.description}</p> : null}
        </div>
      ) : (
      <TaskForm
        task={task}
        organizationId={org.id}
        orgSlug={org.slug}
        projects={projectChoices}
        people={form.people}
        members={form.members}
        canHide={form.canHide}
        canOrgLevel={form.canOrgLevel}
        invite={form.invite}
        sharedWith={(shares ?? []).map((x) => x.membership_id)}
      />
      )}
      <section id="comments" aria-labelledby="comments-heading" className="flex max-w-3xl scroll-mt-20 flex-col gap-3">
        <h2 id="comments-heading" className="font-heading text-lg font-bold">
          Comments <span className="font-normal text-ink-muted">({comments.items.filter((c) => !c.deleted).length})</span>
        </h2>
        <CommentThread
          orgSlug={org.slug}
          kind="task"
          targetId={task.id}
          items={comments.items}
          people={chatPeople}
          me={ctx.userId}
          mentionable={comments.mentionable}
          noun="comment"
          emptyText="No comments yet. Ask a question or share an update; the people on it will hear about it."
        />
      </section>
    </div>
  );
}
