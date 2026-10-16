"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";
import { supabasePublishableKey, supabaseUrl } from "./env";

let browserClient: ReturnType<typeof createBrowserClient<Database>> | undefined;

/** Browser Supabase client: direct-to-storage uploads and Realtime (presence). */
export function createClient() {
  browserClient ??= createBrowserClient<Database>(supabaseUrl(), supabasePublishableKey(), {
    // heartbeats from a worker aren't throttled in background tabs, so presence stays accurate
    realtime: { worker: true },
  });
  return browserClient;
}
