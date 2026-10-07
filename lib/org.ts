import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createTranslator, resolveAll, toLabelMap, type Translate } from "@/lib/terminology/t";
import { deriveTokens, readTheme, type ThemeSettings, type ThemeTokens } from "@/lib/theme/theme";
import { DEFAULT_TZ, isValidTimeZone, todayIn } from "@/lib/dates";
import type { Database } from "@/lib/supabase/database.types";

export type Organization = Database["public"]["Tables"]["organizations"]["Row"];
export type Role = Database["public"]["Enums"]["member_role"];

export type Member = {
  id: string; // membership id
  userId: string;
  role: Role;
  name: string;
  email: string;
};

/** The signed-in user for this request, or a redirect to /login. */
export const requireUser = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) redirect("/login");
  return { supabase, user: data.user };
});

export const getTimeZone = cache(async () => {
  const tz = (await cookies()).get("tz")?.value;
  return tz && isValidTimeZone(tz) ? tz : DEFAULT_TZ;
});

export type OrgContext = {
  org: Organization;
  membershipId: string;
  role: Role;
  isAdmin: boolean;
  userId: string;
  userEmail: string;
  t: Translate;
  labels: ReturnType<typeof resolveAll>;
  theme: ThemeSettings;
  tokens: ThemeTokens;
  tz: string;
  today: string;
  base: string; // "/{slug}"
};

/**
 * Everything a page in /[orgSlug] needs: the org (via RLS, so non-members
 * get a 404), the viewer's membership, t(), theme and time zone.
 * Cached per request, so the layout and page share one lookup.
 */
export const getOrgContext = cache(async (slug: string): Promise<OrgContext> => {
  const { supabase, user } = await requireUser();

  const { data: org } = await supabase.from("organizations").select("*").eq("slug", slug).maybeSingle();
  if (!org) notFound();

  const [{ data: membership }, { data: preset }, tz] = await Promise.all([
    supabase.from("memberships").select("id, role").eq("organization_id", org.id).eq("user_id", user.id).single(),
    supabase.from("presets").select("labels").eq("key", org.preset_key).maybeSingle(),
    getTimeZone(),
  ]);
  if (!membership) notFound();

  const t = createTranslator(toLabelMap(preset?.labels), toLabelMap(org.terminology_overrides));
  const theme = readTheme(org.theme);

  return {
    org,
    membershipId: membership.id,
    role: membership.role,
    isAdmin: membership.role === "admin",
    userId: user.id,
    userEmail: user.email ?? "",
    t,
    labels: resolveAll(t),
    theme,
    tokens: deriveTokens(theme),
    tz,
    today: todayIn(tz),
    base: `/${org.slug}`,
  };
});

/** Members of the organization with their display names. */
export const getMembers = cache(async (orgId: string): Promise<Member[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("memberships")
    .select("id, user_id, role, created_at, profile:profiles(full_name, email)")
    .eq("organization_id", orgId)
    .order("created_at");
  return (data ?? []).map((m) => ({
    id: m.id,
    userId: m.user_id,
    role: m.role,
    name: m.profile?.full_name || m.profile?.email || "Unknown",
    email: m.profile?.email ?? "",
  }));
});

export function initials(name: string): string {
  const parts = name.split(/[\s@._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}
