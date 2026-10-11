import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Landing } from "@/components/marketing/landing";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: { absolute: "Groundwork: run your organization on solid ground" },
  description:
    "One place for your team's work, files and calendar, built for youth and community organizations.",
};

/**
 * Signed-out visitors get the landing page. Signed-in people go to their
 * last-used organization, or to create one.
 */
export default async function Home() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return <Landing />;

  const { data: memberships } = await supabase
    .from("memberships")
    .select("organization:organizations(slug)")
    .eq("user_id", user.id)
    .order("created_at");
  const slugs = (memberships ?? []).map((m) => m.organization?.slug).filter((s): s is string => Boolean(s));
  if (slugs.length === 0) redirect("/create-organization");
  const last = (await cookies()).get("last_org")?.value;
  redirect(`/${last && slugs.includes(last) ? last : slugs[0]}/dashboard`);
}
