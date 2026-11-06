"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Live updates for dashboards (D105). The database broadcasts a signal with
 * no content ("this program changed") on private channels only the program's
 * people may join. On a signal, the page re-fetches its own filtered numbers
 * through the server, once per burst of changes.
 */
export function LiveRefresh({ topics, debounceMs = 1000 }: { topics: string[]; debounceMs?: number }) {
  const router = useRouter();
  const [refreshes, setRefreshes] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const key = topics.join("|");

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    const channels = key.split("|").filter(Boolean).map((topic) =>
      supabase.channel(topic, { config: { private: true } }).on("broadcast", { event: "changed" }, () => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          if (cancelled) return;
          setRefreshes((n) => n + 1);
          router.refresh();
        }, debounceMs);
      }),
    );
    void (async () => {
      await supabase.realtime.setAuth();
      if (!cancelled) for (const c of channels) c.subscribe();
    })();
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
      for (const c of channels) void supabase.removeChannel(c);
    };
  }, [key, debounceMs, router]);

  // how many times other people's changes refreshed this view (for tests and support)
  return <span hidden data-live-refreshes={refreshes} />;
}
