"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { THEME_COOKIE, THEME_COOKIE_MAX_AGE, type ThemeMode } from "@/lib/theme/mode";

/**
 * Keeps three cookies current: the viewer's time zone (so server-rendered
 * times and "today" match the browser), the last organization visited, and
 * the theme saved on their profile (so a new device renders the right mode
 * from its next page on).
 */
export function ClientCookies({ tz, orgSlug, themeMode }: { tz: string; orgSlug: string; themeMode: ThemeMode }) {
  const router = useRouter();
  useEffect(() => {
    // marks the shell as interactive (the e2e tests wait for this)
    document.documentElement.dataset.hydrated = "true";
    const year = 60 * 60 * 24 * 365;
    document.cookie = `last_org=${encodeURIComponent(orgSlug)}; path=/; max-age=${year}; samesite=lax`;
    const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (browserTz && browserTz !== tz) {
      document.cookie = `tz=${encodeURIComponent(browserTz)}; path=/; max-age=${year}; samesite=lax`;
      router.refresh();
    }
  }, [tz, orgSlug, router]);

  useEffect(() => {
    const saved = document.cookie.match(new RegExp(`(?:^|; )${THEME_COOKIE}=([^;]*)`))?.[1];
    if (saved !== themeMode) {
      document.cookie = `${THEME_COOKIE}=${themeMode}; path=/; max-age=${THEME_COOKIE_MAX_AGE}; samesite=lax`;
      document.documentElement.dataset.theme = themeMode;
    }
  }, [themeMode]);
  return null;
}
