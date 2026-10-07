"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Keeps two cookies current: the viewer's time zone (so server-rendered
 * times and "today" match the browser) and the last organization visited.
 */
export function ClientCookies({ tz, orgSlug }: { tz: string; orgSlug: string }) {
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
  return null;
}
