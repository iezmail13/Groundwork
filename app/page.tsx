import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Landing } from "@/components/marketing/landing";
import { createClient } from "@/lib/supabase/server";
import { getMaintenance } from "@/lib/maintenance-request";
import { getTimeZone } from "@/lib/org";

export const metadata: Metadata = {
  title: { absolute: "Groundwork: run your organization on solid ground" },
  description:
    "One place for your team's work, files and calendar, built for youth and community organizations.",
};

/**
 * Signed-out visitors get the landing page. Signed-in people see any pending
 * invitations first, then go to their last-used organization, or to create one.
 */
export default async function Home({ searchParams }: PageProps<"/">) {
  // during maintenance the landing page is all there is, and it needs no database
  const maintenance = await getMaintenance();
  const timeZone = await getTimeZone();
  if (maintenance.active) return <Landing maintenance={maintenance} timeZone={timeZone} />;

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return <Landing maintenance={maintenance} timeZone={timeZone} />;

  // invitations waiting for their verified email come first
  if ((await searchParams).skip !== "invitations") {
    const { data: pending } = await supabase.rpc("my_pending_invitations");
    if (pending?.length) redirect("/invitations");
  }

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

