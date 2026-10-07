import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/safe-next";

/**
 * PKCE code exchange, for links in Supabase's default email format
 * (/auth/v1/verify -> /auth/confirm?code= -> here). These only work in the
 * browser that asked for the link, because the exchange needs its verifier
 * cookie. Groundwork's own templates (supabase/templates) link to
 * /auth/confirm with a token hash instead, which works on any device and
 * survives mail scanners.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = safeNext(searchParams.get("next"));
  const code = searchParams.get("code");

  let ok = false;
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    ok = !error;
  }

  return NextResponse.redirect(new URL(ok ? next : "/login?error=link", origin));
}
