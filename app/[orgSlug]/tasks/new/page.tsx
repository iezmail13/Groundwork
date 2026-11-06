import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { TaskForm } from "@/components/tasks/task-form";
import { getOrgContext } from "@/lib/org";
import { getTaskFormData } from "@/lib/task-form-data";
import { lower } from "@/lib/terminology/t";

export async function generateMetadata({ params }: PageProps<"/[orgSlug]/tasks/new">): Promise<Metadata> {
  const { t } = await getOrgContext((await params).orgSlug);
  return { title: `New ${lower(t("task"))}` };
}

/** The full form for a new task: kind, priority, people, sharing and more (D101). */
export default async function NewTaskPage({ params, searchParams }: PageProps<"/[orgSlug]/tasks/new">) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const ctx = await getOrgContext(orgSlug);
  const { t, base, org } = ctx;
  const form = await getTaskFormData(ctx);
  const projectParam = typeof sp.project === "string" ? sp.project : undefined;
  const defaultProjectId = form.projects.some((p) => p.id === projectParam) ? projectParam : undefined;
  return (
    <div className="flex flex-col gap-6">
      <Link href={`${base}/tasks`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline">
        <ArrowLeft aria-hidden className="size-4" />
        All {lower(t("task", "other"))}
      </Link>
      <PageHeader title={`New ${lower(t("task"))}`} />
      <TaskForm
        organizationId={org.id}
        orgSlug={org.slug}
        defaultProjectId={defaultProjectId}
        projects={form.projects}
        people={form.people}
        members={form.members}
        canHide={form.canHide}
        canOrgLevel={form.canOrgLevel}
        invite={null}
      />
    </div>
  );
}
