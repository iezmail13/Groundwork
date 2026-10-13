import type { Metadata } from "next";
import { CircleCheck, Lock } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { InviteForm, OrganizationForm, PresetForm, type PresetChoice } from "@/components/settings/forms";
import { MembersTable, PendingInvites, TransferOwnership } from "@/components/settings/members";
import { getMembers, getOrgContext } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";
import { createTranslator, lower, toLabelMap } from "@/lib/terminology/t";
import { grantableRoles } from "@/lib/roles";
import { dateInZone, formatRelativeDate } from "@/lib/dates";
import { siteOrigin } from "@/lib/urls";
import { getProjectOptions } from "@/lib/queries";

const VIEWS = ["preset", "members", "organization"] as const;
type View = (typeof VIEWS)[number];

export async function generateMetadata({ params }: PageProps<"/[orgSlug]/settings">): Promise<Metadata> {
  const { t } = await getOrgContext((await params).orgSlug);
  return { title: t("section.settings") };
}

export default async function SettingsPage({ params, searchParams }: PageProps<"/[orgSlug]/settings">) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const view: View = VIEWS.find((v) => v === sp.view) ?? "preset";
  const ctx = await getOrgContext(orgSlug);
  const { t, org, base, canManage } = ctx;
  const tab = (v: View, label: string) => ({ label, href: `${base}/settings?view=${v}`, active: view === v });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("section.settings")}
        tabsLabel="Settings sections"
        tabs={[
          tab("preset", "Preset"),
          tab("members", t("member", "other")),
          tab("organization", "Organization"),
        ]}
      />
      {!canManage ? (
        <p className="flex items-center gap-2 border-l-4 border-ink pl-3 text-sm">
          <Lock aria-hidden className="size-4" />
          Only {lower(t("role.owner", "other"))} and {lower(t("role.manager", "other"))} can change settings. You can see them here.
        </p>
      ) : null}
      {view === "preset" ? <PresetPanel orgId={org.id} current={org.preset_key} disabled={!canManage} /> : null}
      {view === "members" ? (
        <MembersPanel
          orgSlug={orgSlug}
          transferred={sp.notice === "transferred"}
          removed={sp.notice === "removed" ? { handed: count(sp.handed), flagged: count(sp.flagged) } : null}
          fromTask={typeof sp.task === "string" && UUID.test(sp.task) ? sp.task : null}
        />
      ) : null}
      {view === "organization" ? <OrganizationForm organizationId={org.id} name={org.name} slug={org.slug} disabled={!canManage} /> : null}
    </div>
  );
}

async function PresetPanel({ orgId, current, disabled }: { orgId: string; current: string; disabled: boolean }) {
  const supabase = await createClient();
  const { data: presets } = await supabase.from("presets").select("key, name, labels");
  const order = ["nonprofit", "business", "tutoring"];
  const choices: PresetChoice[] = (presets ?? [])
    .sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key))
    .map((p) => {
      const t = createTranslator(toLabelMap(p.labels));
      return { key: p.key, name: p.name, words: [t("project", "other"), t("task", "other"), t("event", "other"), t("document", "other"), t("member", "other")] };
    });
  return <PresetForm organizationId={orgId} current={current} presets={choices} disabled={disabled} />;
}

const UUID = /^[0-9a-f-]{36}$/i;

/** A small non-negative count from the query string. */
function count(value: string | string[] | undefined): number {
  const n = Number(typeof value === "string" ? value : 0);
  return Number.isInteger(n) && n >= 0 && n < 100000 ? n : 0;
}

async function MembersPanel({
  orgSlug,
  transferred,
  removed,
  fromTask,
}: {
  orgSlug: string;
  transferred: boolean;
  removed: { handed: number; flagged: number } | null;
  /** The task whose assignee picker sent them here: the invitee gets its project and the task. */
  fromTask: string | null;
}) {
  const ctx = await getOrgContext(orgSlug);
  const { t, org, canManage, role, today, tz } = ctx;
  const supabase = await createClient();
  const [members, { data: invitations }, origin, projects, { data: ranks }, { data: task }] = await Promise.all([
    getMembers(org.id),
    canManage
      ? supabase
          .from("invitations")
          .select("id, email, name, role, token, expires_at, grants:invitation_projects(role, project:projects(name))")
          .eq("organization_id", org.id)
          .is("accepted_at", null)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    siteOrigin(),
    getProjectOptions(org.id),
    supabase.rpc("my_project_ranks", { org_id: org.id }),
    fromTask && canManage
      ? supabase.from("tasks").select("id, title, project_id").eq("organization_id", org.id).eq("id", fromTask).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const rankOfProject = new Map((ranks ?? []).map((r) => [r.project_id, r.rank]));
  // granting a project needs project admin or lead there
  const grantable = projects
    .map((p) => ({ id: p.id, name: p.name, myRank: rankOfProject.get(p.id) ?? 0 }))
    .filter((p) => p.myRank >= 2);
  const now = new Date().toISOString();
  // only a task on a project they can grant can be handed to the invitee
  const assignTask =
    task && grantable.some((p) => p.id === task.project_id)
      ? { id: task.id, title: task.title, projectId: task.project_id, href: `${ctx.base}/tasks/${task.id}` }
      : null;

  return (
    <div className="flex flex-col gap-8">
      {removed ? (
        <p role="status" className="flex items-center gap-2 border-l-4 border-ink pl-3 font-semibold">
          <CircleCheck aria-hidden className="size-4" />
          Removed.
          {removed.handed ? ` ${removed.handed} open ${lower(t("task", removed.handed === 1 ? "one" : "other"))} handed over.` : ""}
          {removed.flagged ? ` ${removed.flagged} flagged for a new assignee.` : ""}
        </p>
      ) : null}
      {transferred ? (
        <p role="status" className="flex items-center gap-2 border-l-4 border-ink pl-3 font-semibold">
          <CircleCheck aria-hidden className="size-4" />
          Ownership transferred. You&apos;re now {lower(t("role.manager"))}.
        </p>
      ) : null}
      <section aria-labelledby="members-heading" className="flex flex-col gap-3">
        <h2 id="members-heading" className="text-xl font-bold">
          {t("member", "other")} ({members.length})
        </h2>
        <MembersTable
          viewerRole={role}
          orgSlug={org.slug}
          members={members.map((m) => ({ id: m.id, name: m.name, email: m.email, role: m.role, isYou: m.userId === ctx.userId }))}
        />
      </section>
      {role === "owner" ? (
        <section aria-labelledby="transfer-heading" className="flex flex-col gap-3">
          <h2 id="transfer-heading" className="text-xl font-bold">
            Ownership
          </h2>
          <p className="max-w-2xl text-ink-muted">
            Hand the organization to someone else. They become {lower(t("role.owner"))} and you step down to{" "}
            {lower(t("role.manager"))}. An organization always keeps at least one {lower(t("role.owner"))}.
          </p>
          <TransferOwnership
            organizationId={org.id}
            orgSlug={org.slug}
            candidates={members.filter((m) => m.role !== "owner").map((m) => ({ id: m.id, name: m.name }))}
          />
        </section>
      ) : null}
      {canManage ? (
        <>
          <section id="invite" aria-labelledby="invite-heading" className="flex scroll-mt-6 flex-col gap-3">
            <h2 id="invite-heading" className="text-xl font-bold">
              Invite someone
            </h2>
            <p className="max-w-2xl text-ink-muted">
              Create an invitation, then copy the link and send it to them. They sign in with that email address to join.
              Links expire after 14 days.
            </p>
            <InviteForm organizationId={org.id} roles={grantableRoles(role)} projects={grantable} assignTask={assignTask} />
          </section>
          <section aria-labelledby="pending-heading" className="flex flex-col gap-3">
            <h2 id="pending-heading" className="text-xl font-bold">
              Pending invitations
            </h2>
            <PendingInvites
              invites={(invitations ?? []).map((i) => ({
                id: i.id,
                email: i.email,
                name: i.name,
                role: i.role,
                projects: (i.grants ?? []).flatMap((g) => (g.project ? [`${g.project.name} (${t(`project_role.${g.role}`)})`] : [])),
                link: `${origin}/invite/${i.token}`,
                expires: formatRelativeDate(dateInZone(new Date(i.expires_at), tz), today),
                expired: i.expires_at < now,
              }))}
            />
          </section>
        </>
      ) : null}
    </div>
  );
}
