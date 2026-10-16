import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { buildCsp, canonicalRedirect } from "@/lib/security";
import { hashToken, MAINTENANCE_HEADER, parseSetting, retryAfterSeconds, safeEqual, servedDuringMaintenance, toStored } from "@/lib/maintenance";
import { readMaintenance } from "@/lib/maintenance-source";
import { maintenancePageHtml } from "@/lib/maintenance-page";

const BYPASS_COOKIE = "gw_maintenance_bypass";

const PUBLIC_PATHS = ["/", "/login", "/auth/callback", "/auth/confirm"];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.includes(pathname) || pathname.startsWith("/invite/");
}

/**
 * Refreshes the Supabase session cookie on every request and sends signed-out
 * visitors to /login (except on public pages, such as the landing page at /). Authorization itself is enforced by RLS, not here.
 */
export async function proxy(request: NextRequest) {
  // the vercel.app address forwards to the custom domain once one is set up
  if (request.method === "GET" || request.method === "HEAD") {
    const target = canonicalRedirect(
      request.headers.get("host"),
      process.env.NEXT_PUBLIC_SITE_URL,
      request.nextUrl.pathname + request.nextUrl.search,
    );
    if (target) return NextResponse.redirect(target, 308);
  }

  const nonce = btoa(crypto.randomUUID());
  const https = request.nextUrl.protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";
  const csp = buildCsp({
    nonce,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    dev: process.env.NODE_ENV === "development",
    https,
  });

  // Maintenance (D87) comes before anything that needs the database.
  const maintenance = testMaintenance(request) ?? (await readMaintenance());
  const { pathname: path } = request.nextUrl;
  if (path === "/maintenance/status") {
    return NextResponse.json({ active: maintenance.active }, { headers: { "cache-control": "no-store" } });
  }
  let bypassed = false;
  if (maintenance.active) {
    const bypass = await bypassMaintenance(request, https);
    if (bypass instanceof NextResponse) return bypass;
    bypassed = bypass;
    if (!bypassed && (!servedDuringMaintenance(path) || path === "/maintenance")) {
      return new NextResponse(maintenancePageHtml(maintenance, nonce), {
        status: path === "/maintenance" ? 200 : 503,
        headers: {
          "content-type": "text/html; charset=utf-8",
          "content-security-policy": csp,
          "cache-control": "no-store",
          ...(path === "/maintenance" ? {} : { "retry-after": String(retryAfterSeconds(maintenance)) }),
        },
      });
    }
    // the landing page shows a banner and doesn't touch the database
  } else if (path === "/maintenance") {
    return NextResponse.redirect(new URL("/", request.url));
  }
  const maintenanceJson = JSON.stringify(toStored(maintenance));

  // Next.js reads the nonce from the request's CSP header and adds it to its scripts
  const next = () => {
    const headers = new Headers(request.headers);
    headers.set("content-security-policy", csp);
    headers.set(MAINTENANCE_HEADER, maintenanceJson);
    const res = NextResponse.next({ request: { headers } });
    res.headers.set("content-security-policy", csp);
    return res;
  };
  let response = next();
  // during maintenance the landing page is served without touching auth or the database
  if (maintenance.active && !bypassed) return response;

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
          response = next();
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
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    const redirect = NextResponse.redirect(url);
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    return redirect;
  }

  return response;
}

/**
 * End-to-end tests switch maintenance per browser with a header. Only in
 * development, and only when the test setup turns it on: never in production.
 */
function testMaintenance(request: NextRequest) {
  if (process.env.NODE_ENV === "production" || process.env.E2E_MAINTENANCE_OVERRIDE !== "1") return null;
  const raw = request.headers.get("x-gw-test-maintenance");
  if (!raw) return null;
  try {
    return parseSetting(JSON.parse(raw));
  } catch {
    return null;
  }
}

/**
 * The owner's way past maintenance: ?bypass=<MAINTENANCE_BYPASS_TOKEN> sets an
 * httpOnly session cookie holding a hash of the token (never the token), then
 * reloads the page without the parameter. Returns a redirect when it sets the
 * cookie, true when the cookie is valid, false otherwise. Never logs the token.
 */
async function bypassMaintenance(request: NextRequest, https: boolean): Promise<NextResponse | boolean> {
  const secret = process.env.MAINTENANCE_BYPASS_TOKEN;
  if (!secret || secret.length < 16) return false;
  const expected = await hashToken(secret);
  const offered = request.nextUrl.searchParams.get("bypass");
  if (offered !== null) {
    if (!safeEqual(await hashToken(offered), expected)) return false;
    const url = request.nextUrl.clone();
    url.searchParams.delete("bypass");
    const res = NextResponse.redirect(url);
    res.cookies.set(BYPASS_COOKIE, expected, { httpOnly: true, secure: https, sameSite: "lax", path: "/" });
    return res;
  }
  return safeEqual(request.cookies.get(BYPASS_COOKIE)?.value ?? "", expected);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|logo.svg|maintenance.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
