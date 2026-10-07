import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { DueBadge, TaskStatusBadge } from "@/components/tasks/badges";
import { TaskEditForm } from "@/components/tasks/task-edit-form";
import { getMembers, getOrgContext } from "@/lib/org";
import { getProjectOptions, TASK_SELECT, type TaskRow } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";
import { formatTimestamp } from "@/lib/dates";
import { lower } from "@/lib/terminology/t";

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

  const [projects, members] = await Promise.all([getProjectOptions(org.id, true), getMembers(org.id)]);

  return (
    <div className="flex flex-col gap-6">
      <Link href={`${base}/tasks`} className="inline-flex items-center gap-1.5 text-sm font-semibold hover:underline">
        <ArrowLeft aria-hidden className="size-4" />
        All {lower(t("task", "other"))}
      </Link>
      <PageHeader
        title={task.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <TaskStatusBadge status={task.status} label={t(`status.${task.status}`)} />
            <DueBadge dueDate={task.due_date} status={task.status} today={today} />
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
      <TaskEditForm
        task={task}
        projects={projects}
        members={members.map((m) => ({ id: m.id, name: m.name }))}
        orgSlug={org.slug}
      />
    </div>
  );
}
