import type { Metadata } from "next";
import Link from "next/link";
import { AuthFrame } from "@/components/auth/auth-frame";
import { CreateOrgForm, type PresetOption } from "@/components/auth/create-org-form";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/org";
import { createTranslator, lower, toLabelMap } from "@/lib/terminology/t";

export const metadata: Metadata = { title: "Create an organization" };

export default async function CreateOrganizationPage() {
  const { supabase, user } = await requireUser();
  // a demo visitor can't make a real organization (D115)
  if (user.is_anonymous) redirect("/demo");
  const [{ data: presets }, { data: profile }, { count }, { data: pending }] = await Promise.all([
    supabase.from("presets").select("key, name, labels").order("name"),
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
    supabase.from("memberships").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    supabase.rpc("my_pending_invitations"),
  ]);
  const owner = lower(createTranslator()("role.owner"));

  // Describe each preset with its own words, resolved through t().
  const order = ["nonprofit", "business", "tutoring"];
  const options: PresetOption[] = (presets ?? [])
    .sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key))
    .map((p) => {
      const t = createTranslator(toLabelMap(p.labels));
      return {
        key: p.key,
        name: p.name,
        example: [t("project", "other"), t("task", "other"), t("event", "other"), t("member", "other")].join(" · "),
      };
    });

  return (
    <AuthFrame
      title="Set up your organization"
      subtitle={`You'll be its ${owner}. Invite your team once you're in.`}
    >
      {pending?.length ? (
        <p className="mb-5 border-l-4 border-ink pl-3 text-sm">
          You have {pending.length === 1 ? "an invitation" : `${pending.length} invitations`} waiting.{" "}
          <Link href="/invitations" className="font-semibold text-accent underline underline-offset-4">
            See {pending.length === 1 ? "it" : "them"}
          </Link>
        </p>
      ) : null}
      <CreateOrgForm presets={options} defaultName={profile?.full_name ?? undefined} />
      {count ? (
        <p className="mt-6 text-sm">
          <Link href="/" className="text-accent underline underline-offset-4">
            Back to my organizations
          </Link>
        </p>
      ) : null}
    </AuthFrame>
  );
}
