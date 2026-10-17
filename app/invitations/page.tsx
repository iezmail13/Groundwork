import type { Metadata } from "next";
import Link from "next/link";
import { AuthFrame } from "@/components/auth/auth-frame";
import { AcceptInviteForm, DeclineInviteForm } from "@/components/auth/accept-invite-form";
import { requireUser } from "@/lib/org";
import { createTranslator, lower, toLabelMap } from "@/lib/terminology/t";

export const metadata: Metadata = { title: "Invitations" };

/**
 * Invitations waiting for the signed-in person's verified email. Shown right
 * after sign-in when there are any, and linked from organization setup.
 */
export default async function InvitationsPage() {
  const { supabase } = await requireUser();
  const [{ data: invites }, { count }] = await Promise.all([
    supabase.rpc("my_pending_invitations"),
    supabase.from("memberships").select("id", { count: "exact", head: true }),
  ]);
  const pending = invites ?? [];
  // before joining, an organization's custom labels aren't readable, but its preset's words are
  const { data: presets } = pending.length
    ? await supabase.from("presets").select("key, labels").in("key", [...new Set(pending.map((i) => i.preset_key))])
    : { data: [] };
  const translators = new Map((presets ?? []).map((p) => [p.key, createTranslator(toLabelMap(p.labels))]));
  const t = createTranslator();
  const hasOrgs = (count ?? 0) > 0;

  return (
    <AuthFrame
      title={pending.length ? "You've been invited" : "No pending invitations"}
      subtitle={
        pending.length
          ? "Join an organization below, or decline if it isn't for you."
          : "Invitations sent to your email address will appear here."
      }
    >
      {pending.length ? (
        <ul className="divide-y divide-rule border-y border-rule">
          {pending.map((inv) => {
            const words = translators.get(inv.preset_key) ?? t;
            return (
            <li key={inv.token} className="flex flex-col gap-3 py-4">
              <div>
                <p className="font-heading text-lg font-bold">{inv.organization_name}</p>
                <p className="text-sm text-ink-muted">
                  {words(`role.${inv.role}`)}
                  {inv.invited_by_name ? ` · invited by ${inv.invited_by_name}` : ""}
                </p>
                {inv.project_names.length ? (
                  <p className="text-sm text-ink-muted">
                    {words("project", inv.project_names.length === 1 ? "one" : "other")}: {inv.project_names.join(", ")}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap items-start gap-2">
                <AcceptInviteForm token={inv.token} orgName={inv.organization_name} />
                <DeclineInviteForm token={inv.token} orgName={inv.organization_name} />
              </div>
            </li>
            );
          })}
        </ul>
      ) : null}
      <p className="mt-6 text-sm">
        {hasOrgs ? (
          <Link href="/?skip=invitations" className="text-accent underline underline-offset-4">
            Continue to your {lower(t("section.dashboard"))}
          </Link>
        ) : (
          <Link href="/create-organization" className="text-accent underline underline-offset-4">
            Set up a new organization instead
          </Link>
        )}
      </p>
    </AuthFrame>
  );
}
