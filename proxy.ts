import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { buildCsp, canonicalRedirect } from "@/lib/security";

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
  const csp = buildCsp({
    nonce,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    dev: process.env.NODE_ENV === "development",
    https: request.nextUrl.protocol === "https:" || request.headers.get("x-forwarded-proto") === "https",
  });
  // Next.js reads the nonce from the request's CSP header and adds it to its scripts
  const next = () => {
    const headers = new Headers(request.headers);
    headers.set("content-security-policy", csp);
    const res = NextResponse.next({ request: { headers } });
    res.headers.set("content-security-policy", csp);
    return res;
  };
  let response = next();

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

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|logo.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
