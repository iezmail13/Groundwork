import type { Metadata } from "next";
import { CircleCheck, Lock } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { InviteForm, OrganizationForm, PresetForm, TerminologyForm, ThemeForm, type PresetChoice } from "@/components/settings/forms";
import { MembersTable, PendingInvites, TransferOwnership } from "@/components/settings/members";
import { getMembers, getOrgContext } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";
import { createTranslator, lower, resolveAll, toLabelMap } from "@/lib/terminology/t";
import { grantableRoles, type Role } from "@/lib/roles";
import { dateInZone, formatRelativeDate } from "@/lib/dates";
import { siteOrigin } from "@/lib/urls";

const VIEWS = ["preset", "terminology", "theme", "members", "organization"] as const;
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
          tab("terminology", "Terminology"),
          tab("theme", "Theme"),
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
      {view === "terminology" ? <TerminologyPanel orgId={org.id} presetKey={org.preset_key} overrides={org.terminology_overrides} disabled={!canManage} /> : null}
      {view === "theme" ? <ThemeForm organizationId={org.id} navy={ctx.theme.navy} mode={ctx.theme.mode} disabled={!canManage} /> : null}
      {view === "members" ? <MembersPanel orgSlug={orgSlug} transferred={sp.notice === "transferred"} /> : null}
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

async function TerminologyPanel({
  orgId,
  presetKey,
  overrides,
  disabled,
}: {
  orgId: string;
  presetKey: string;
  overrides: unknown;
  disabled: boolean;
}) {
  const supabase = await createClient();
  const { data: preset } = await supabase.from("presets").select("labels").eq("key", presetKey).maybeSingle();
  const presetLabels = resolveAll(createTranslator(toLabelMap(preset?.labels)));
  return <TerminologyForm organizationId={orgId} presetLabels={presetLabels} overrides={toLabelMap(overrides)} disabled={disabled} />;
}

async function MembersPanel({ orgSlug, transferred }: { orgSlug: string; transferred: boolean }) {
  const ctx = await getOrgContext(orgSlug);
  const { t, org, canManage, role, today, tz } = ctx;
  const supabase = await createClient();
  const [members, { data: invitations }, origin] = await Promise.all([
    getMembers(org.id),
    canManage
      ? supabase.from("invitations").select("id, email, role, token, expires_at").eq("organization_id", org.id).is("accepted_at", null).order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as { id: string; email: string; role: Role; token: string; expires_at: string }[] }),
    siteOrigin(),
  ]);
  const now = new Date().toISOString();

  return (
    <div className="flex flex-col gap-8">
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
          <section aria-labelledby="invite-heading" className="flex flex-col gap-3">
            <h2 id="invite-heading" className="text-xl font-bold">
              Invite someone
            </h2>
            <p className="max-w-2xl text-ink-muted">
              Create an invitation, then copy the link and send it to them. They sign in with that email address to join.
              Links expire after 14 days.
            </p>
            <InviteForm organizationId={org.id} roles={grantableRoles(role)} />
          </section>
          <section aria-labelledby="pending-heading" className="flex flex-col gap-3">
            <h2 id="pending-heading" className="text-xl font-bold">
              Pending invitations
            </h2>
            <PendingInvites
              invites={(invitations ?? []).map((i) => ({
                id: i.id,
                email: i.email,
                role: i.role,
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
