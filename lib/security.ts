// Response-hardening helpers used by proxy.ts. Pure, so they can be unit-tested.

/** Third-party origins the app may talk to. Stripe is listed for the planned billing. */

function originOrNull(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * Content-Security-Policy for one response. Scripts need this request's nonce
 * (Next.js adds it to its own scripts); style attributes stay allowed because
 * React renders them inline. Supabase is reachable for the API, storage
 * uploads and realtime.
 */
export function buildCsp({
  nonce,
  supabaseUrl,
  dev,
  https,
}: {
  nonce: string;
  supabaseUrl?: string;
  dev: boolean;
  https: boolean;
}): string {
  const supabase = originOrNull(supabaseUrl);
  const supabaseWs = supabase ? supabase.replace(/^http/, "ws") : null;
  const connect = ["'self'", supabase, supabaseWs].filter(Boolean).join(" ");
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' blob: data:${supabase ? ` ${supabase}` : ""}`,
    "font-src 'self'",
    // Realtime keeps its heartbeat in a small inline worker, so background tabs stay connected (D104)
    "worker-src 'self' blob:",
    `connect-src ${connect}`,
    // only the demo's bot check is framed (Cloudflare Turnstile, D115); its script loads from
    // our own nonce'd code, which 'strict-dynamic' allows. Billing is out of scope (D113).
    "frame-src https://challenges.cloudflare.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];
  // only over https, so a local production build on http://localhost still works
  if (https) directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}

/**
 * Where a request on a *.vercel.app host should go when the app has a custom
 * domain (NEXT_PUBLIC_SITE_URL). Only vercel.app hosts are redirected, so a
 * custom-domain setup (apex/www) can never loop; null means serve as is.
 */
export function canonicalRedirect(host: string | null, siteUrl: string | undefined, pathAndQuery: string): string | null {
  const site = originOrNull(siteUrl);
  if (!host || !site) return null;
  const siteHost = new URL(site).host;
  const bareHost = host.toLowerCase();
  if (!bareHost.endsWith(".vercel.app") || siteHost.endsWith(".vercel.app") || bareHost === siteHost) return null;
  return `${site}${pathAndQuery}`;
}
