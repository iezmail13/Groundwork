import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/org";

/** Sends people to their last-used organization, or to create one. */
export default async function Home() {
  const { supabase, user } = await requireUser();
  const { data } = await supabase
    .from("memberships")
    .select("organization:organizations(slug)")
    .eq("user_id", user.id)
    .order("created_at");
  const slugs = (data ?? []).map((m) => m.organization?.slug).filter((s): s is string => Boolean(s));
  if (slugs.length === 0) redirect("/create-organization");
  const last = (await cookies()).get("last_org")?.value;
  redirect(`/${last && slugs.includes(last) ? last : slugs[0]}/dashboard`);
}
