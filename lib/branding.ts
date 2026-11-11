import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { accentStyleSheet, resolveAccent } from "@/lib/theme/theme";
import { parseThemeMode, type ThemeMode } from "@/lib/theme/mode";
import type { Organization } from "@/lib/org";

/** Signed logo links last half a day; every navigation re-signs them. */
const LOGO_URL_SECONDS = 60 * 60 * 12;

export type Branding = {
  /** The accent in force for this viewer (personal → org → default). */
  accent: string;
  /** A style sheet overriding the accent tokens, or "" for the default. */
  accentCss: string;
  themeMode: ThemeMode;
  personalAccent: string | null;
  logoUrl: string | null;
  logoDarkUrl: string | null;
  showIllustrations: boolean;
};

/** The viewer's theme and the organization's branding, once per request. */
export const getBranding = cache(async (org: Organization, userId: string): Promise<Branding> => {
  const supabase = await createClient();
  const paths = [org.logo_path, org.logo_dark_path].filter((p): p is string => Boolean(p));
  const [{ data: profile }, signed] = await Promise.all([
    supabase.from("profiles").select("theme_mode, accent").eq("id", userId).maybeSingle(),
    paths.length ? supabase.storage.from("branding").createSignedUrls(paths, LOGO_URL_SECONDS) : Promise.resolve({ data: [] }),
  ]);
  const urlFor = (path: string | null) => (path ? (signed.data ?? []).find((s) => s.path === path)?.signedUrl ?? null : null);
  const accent = resolveAccent({ accent: org.accent, allowPersonalAccent: org.allow_personal_accent }, profile?.accent ?? null);
  return {
    accent,
    accentCss: accentStyleSheet(accent),
    themeMode: parseThemeMode(profile?.theme_mode),
    personalAccent: profile?.accent ?? null,
    logoUrl: urlFor(org.logo_path),
    logoDarkUrl: urlFor(org.logo_dark_path),
    showIllustrations: org.show_illustrations,
  };
});
