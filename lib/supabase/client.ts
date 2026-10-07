"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";
import { supabasePublishableKey, supabaseUrl } from "./env";

let browserClient: ReturnType<typeof createBrowserClient<Database>> | undefined;

/** Browser Supabase client, used only for direct-to-storage uploads. */
export function createClient() {
  browserClient ??= createBrowserClient<Database>(supabaseUrl(), supabasePublishableKey());
  return browserClient;
}
