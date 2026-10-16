import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Mail, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { Avatar } from "@/components/people/avatar";
import { PresenceBadge } from "@/components/people/presence";
import { MuteSwitch } from "@/components/people/profile-controls";
import { DueBadge, PriorityFlag, ProjectDot, TaskStatusBadge } from "@/components/tasks/badges";
import { getMembers, getOrgContext, initials } from "@/lib/org";
import { getMemberPhotos } from "@/lib/members";
import { createClient } from "@/lib/supabase/server";
import { lower } from "@/lib/terminology/t";
import type { TaskPriority, TaskStatus } from "@/lib/queries";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function load(orgSlug: string, userId: string) {
  const ctx = await getOrgContext(orgSlug);
  if (!UUID.test(userId)) return { ctx, member: null };
  const members = await getMembers(ctx.org.id);
  return { ctx, member: members.find((m) => m.userId === userId) ?? null };
}

export async function generateMetadata({ params }: PageProps<"/[orgSlug]/members/[userId]">): Promise<Metadata> {
  const { orgSlug, userId } = await params;
  const { member } = await load(orgSlug, userId);
  return { title: member?.name ?? "Profile" };
}

type AssignedTask = {
  task: {
    id: string;
    title: string;
    status: TaskStatus;
    priority: TaskPriority;
    due_date: string | null;
    project: { id: string; name: string; color: string | null } | null;
  } | null;
};

/**
 * A member's profile (D104). Their programs and work are read through the
 * viewer's own access, so two people looking at the same profile can see
 * different lists.
 */
export default async function MemberPage({ params }: PageProps<"/[orgSlug]/members/[userId]">) {
  const { orgSlug, userId } = await params;
  const { ctx, member } = await load(orgSlug, userId);
  if (!member) notFound();
  const { t, org, base, today } = ctx;
  const supabase = await createClient();
  const own = member.userId === ctx.userId;

  const [{ data: profile }, photos, { data: programs }, { data: assigned }, { data: mute }] = await Promise.all([
    supabase.from("profiles").select("full_name, email, title, bio").eq("id", member.userId).maybeSingle(),
    getMemberPhotos(org.id),
    supabase
      .from("project_members")
      .select("role, project:projects(id, name, color, status)")
      .eq("membership_id", member.id),
    supabase
      .from("task_assignees")
      .select("task:tasks(id, title, status, priority, due_date, project:projects(id, name, color))")
      .eq("membership_id", member.id)
      .is("done_at", null),
    own
      ? Promise.resolve({ data: null })
      : supabase.from("notification_mutes").select("id").eq("organization_id", org.id).eq("user_id", ctx.userId).eq("muted_user_id", member.userId).maybeSingle(),
  ]);

  const tasks = ((assigned ?? []) as AssignedTask[])
    .map((a) => a.task)
    .filter((x): x is NonNullable<AssignedTask["task"]> => Boolean(x) && x!.status !== "done")
    .sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"));
  const projects = (programs ?? [])
    .filter((p) => p.project)
    .sort((a, b) => a.project!.name.localeCompare(b.project!.name));
  const name = profile?.full_name || member.name;

  return (
    <div className="flex flex-col gap-8">
      <Link href={`${base}/settings?view=members`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline">
        <ArrowLeft aria-hidden className="size-4" />
        All {lower(t("member", "other"))}
      </Link>

      <header className="flex flex-wrap items-start gap-5 border-b border-rule pb-6">
        <Avatar name={name} initials={initials(name)} photoUrl={photos.get(member.userId) ?? null} size="xl" />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <h1 className="font-heading text-3xl font-bold">{name}</h1>
          {profile?.title ? <p className="text-lg">{profile.title}</p> : null}
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="outline">{t(`role.${member.role}`)}</Badge>
            <PresenceBadge userId={member.userId} />
          </div>
          <a href={`mailto:${member.email}`} className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline">
            <Mail aria-hidden className="size-4" />
            {member.email}
          </a>
          {profile?.bio ? <p className="max-w-2xl whitespace-pre-line text-ink-muted">{profile.bio}</p> : null}
        </div>
        {own ? (
          <Link href={`${base}/settings?view=profile`} className={buttonClass("secondary")}>
            <Pencil aria-hidden className="size-4" />
            Edit your profile
          </Link>
        ) : null}
      </header>

      {!own ? <MuteSwitch organizationId={org.id} userId={member.userId} name={name} initial={Boolean(mute)} /> : null}

      <section aria-labelledby="member-projects" className="flex flex-col gap-3">
        <h2 id="member-projects" className="text-xl font-bold">
          {t("project", "other")}
        </h2>
        {projects.length === 0 ? (
          <p className="text-ink-muted">None that you can see.</p>
        ) : (
          <ul className="divide-y divide-rule border-y border-rule">
            {projects.map((p) => (
              <li key={p.project!.id} className="flex items-center justify-between gap-3 py-2">
                <Link href={`${base}/projects/${p.project!.id}`} className="inline-flex items-center gap-2 font-semibold hover:underline">
                  <ProjectDot color={p.project!.color} />
                  {p.project!.name}
                </Link>
                <span className="text-sm text-ink-muted">{t(`project_role.${p.role}`)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="member-tasks" className="flex flex-col gap-3">
        <h2 id="member-tasks" className="text-xl font-bold">
          Open {lower(t("task", "other"))}
        </h2>
        {tasks.length === 0 ? (
          <p className="text-ink-muted">None that you can see.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-left">
              <caption className="sr-only">
                Open {lower(t("task", "other"))} assigned to {name} that you can see
              </caption>
              <thead>
                <tr className="border-b border-ink font-heading text-sm">
                  <th scope="col" className="py-2 pr-4 font-semibold">Title</th>
                  <th scope="col" className="py-2 pr-4 font-semibold">{t("project")}</th>
                  <th scope="col" className="py-2 pr-4 font-semibold">Status</th>
                  <th scope="col" className="py-2 pr-4 font-semibold">Priority</th>
                  <th scope="col" className="py-2 font-semibold">Due</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((x) => (
                  <tr key={x.id} className="border-b border-rule">
                    <td className="py-2 pr-4">
                      <Link href={`${base}/tasks/${x.id}`} className="font-semibold hover:underline">
                        {x.title}
                      </Link>
                    </td>
                    <td className="py-2 pr-4 text-sm">{x.project?.name ?? `No ${lower(t("project"))}`}</td>
                    <td className="py-2 pr-4">
                      <TaskStatusBadge status={x.status} label={t(`status.${x.status}`)} />
                    </td>
                    <td className="py-2 pr-4">
                      <PriorityFlag priority={x.priority} label={t(`priority.${x.priority}`)} />
                    </td>
                    <td className="py-2">{x.due_date ? <DueBadge dueDate={x.due_date} today={today} status={x.status} /> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
