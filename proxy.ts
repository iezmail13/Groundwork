import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/auth/callback", "/auth/confirm"];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.includes(pathname) || pathname.startsWith("/invite/");
}

/**
 * In production, serve the app from one host only (NEXT_PUBLIC_SITE_URL).
 * Sign-in redirects are allow-listed for that host and session cookies are
 * per host, so a visit on another alias (e.g. *.vercel.app next to a custom
 * domain) is redirected rather than left with sign-in links that can't work.
 */
function canonicalRedirect(request: NextRequest): NextResponse | null {
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.NODE_ENV !== "production" || !site) return null;
  let canonical: URL;
  try {
    canonical = new URL(site);
  } catch {
    return null;
  }
  // local production builds (npm start) may run on any port
  if (canonical.hostname === "localhost" || canonical.hostname === "127.0.0.1") return null;
  if (request.nextUrl.host === canonical.host) return null;
  const target = new URL(request.nextUrl.pathname + request.nextUrl.search, canonical.origin);
  return NextResponse.redirect(target, 308);
}

/**
 * Refreshes the Supabase session cookie on every request and sends signed-out
 * visitors to /login. Authorization itself is enforced by RLS, not here.
 */
export async function proxy(request: NextRequest) {
  const elsewhere = canonicalRedirect(request);
  if (elsewhere) return elsewhere;

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        },
      },
    },
  );

  // Validates the JWT (and refreshes it when needed). Do not remove.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);
  const { pathname, search } = request.nextUrl;

  if (!signedIn && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
    const redirect = NextResponse.redirect(url);
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    return redirect;
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|logo.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
