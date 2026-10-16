import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase/env";
import { buildCalendar } from "@/lib/ics";

export const dynamic = "force-dynamic";

const NOT_FOUND = () =>
  new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });

/**
 * A person's private calendar feed (D57, D102). The URL is the key, so it is
 * never logged here, never cached, and an unknown or revoked token is a plain
 * 404. The database finds the person from the token's digest and gathers
 * only what they can see.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/calendar/[token]">) {
  const { token: raw } = await ctx.params;
  const token = raw.endsWith(".ics") ? raw.slice(0, -4) : raw;
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return NOT_FOUND();

  // no session: calendar apps can't sign in
  const supabase = createClient<Database>(supabaseUrl(), supabasePublishableKey(), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await supabase.rpc("calendar_feed", { feed_token: token });
  if (error) {
    if (error.code === "P0002") return NOT_FOUND();
    console.error("Calendar feed failed", error.code, error.message);
    return new Response("The calendar couldn't be loaded. Try again later.", {
      status: 503,
      headers: { "Cache-Control": "no-store", "Retry-After": "300" },
    });
  }

  const host = new URL(request.url).hostname;
  return new Response(buildCalendar(data ?? [], host), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="groundwork.ics"',
      // a revoked token must stop working at once, so nothing may keep a copy
      "Cache-Control": "no-store, private",
      "X-Robots-Tag": "noindex, nofollow",
      "Referrer-Policy": "no-referrer",
    },
  });
}
