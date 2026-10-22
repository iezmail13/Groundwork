import "server-only";
import type { createClient } from "@/lib/supabase/server";

/** Is the signed-in person a temporary demo visitor (D115)? */
export async function inDemo(supabase: Awaited<ReturnType<typeof createClient>>): Promise<boolean> {
  const { data } = await supabase.auth.getUser();
  return Boolean(data.user?.is_anonymous);
}
