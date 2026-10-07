import type { Metadata } from "next";
import Link from "next/link";
import { AuthFrame } from "@/components/auth/auth-frame";
import { CreateOrgForm, type PresetOption } from "@/components/auth/create-org-form";
import { requireUser } from "@/lib/org";
import { createTranslator, toLabelMap } from "@/lib/terminology/t";

export const metadata: Metadata = { title: "Create an organization" };

export default async function CreateOrganizationPage() {
  const { supabase, user } = await requireUser();
  const [{ data: presets }, { data: profile }, { count }] = await Promise.all([
    supabase.from("presets").select("key, name, labels").order("name"),
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
    supabase.from("memberships").select("id", { count: "exact", head: true }).eq("user_id", user.id),
  ]);

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
      subtitle="You'll be its admin. Invite your team once you're in."
    >
      <CreateOrgForm presets={options} defaultName={profile?.full_name ?? undefined} />
      {count ? (
        <p className="mt-6 text-sm">
          <Link href="/" className="underline underline-offset-4">
            Back to my organizations
          </Link>
        </p>
      ) : null}
    </AuthFrame>
  );
}
