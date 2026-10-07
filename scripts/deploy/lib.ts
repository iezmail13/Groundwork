// Pure helpers for the deploy pipeline (.github/workflows/deploy.yml).
// Kept free of I/O so they can be unit-tested; the scripts beside this file
// do the network calls.

/** An entry from `supabase projects api-keys -o json`. Shapes vary by CLI version. */
export type ApiKeyEntry = { name?: string; type?: string; api_key?: string; apiKey?: string };

/**
 * The browser-safe key: the new publishable key when the project has one,
 * otherwise the legacy anon JWT. Never returns a secret or service-role key.
 */
export function pickPublishableKey(entries: unknown): string {
  if (!Array.isArray(entries)) throw new Error("Unexpected api-keys output: not a list.");
  const list = entries as ApiKeyEntry[];
  const value = (e: ApiKeyEntry) => e.api_key ?? e.apiKey ?? "";
  const publishable = list.find((e) => e.type === "publishable" && value(e).startsWith("sb_publishable_"));
  const anon = list.find((e) => e.name === "anon" && value(e).length > 0);
  const chosen = publishable ?? anon;
  if (!chosen) throw new Error("No publishable or anon key found for this project.");
  const key = value(chosen);
  if (key.startsWith("sb_secret_") || chosen.name === "service_role") {
    throw new Error("Refusing to use a secret key in the browser bundle.");
  }
  return key;
}

/** Normalises an app URL: https only, no trailing slash, no path. */
export function normalizeAppUrl(raw: string): string {
  const input = raw.trim();
  const url = new URL(/^https?:\/\//.test(input) ? input : `https://${input}`);
  if (url.protocol !== "https:") throw new Error(`The app URL must use https: ${raw}`);
  return url.origin;
}

export type VercelDomain = { name: string; redirect?: string | null; verified?: boolean };

/**
 * The production domain for a Vercel project: a verified custom domain if
 * there is one, otherwise the shortest *.vercel.app domain. Redirecting
 * domains are skipped.
 */
export function pickProductionDomain(domains: VercelDomain[]): string | null {
  const usable = domains.filter((d) => !d.redirect && d.verified !== false);
  const custom = usable.filter((d) => !d.name.endsWith(".vercel.app"));
  const pool = custom.length ? custom : usable;
  const sorted = [...pool].sort((a, b) => a.name.length - b.name.length || a.name.localeCompare(b.name));
  return sorted[0]?.name ?? null;
}

export type SmtpSettings = {
  host?: string;
  port?: string;
  user?: string;
  pass?: string;
  from?: string;
  senderName?: string;
};

/**
 * Body for PATCH /v1/projects/{ref}/config/auth. Sets the site URL and the
 * redirect allow-list to this app only, and custom SMTP when it's configured
 * (Supabase's built-in mailer only delivers to the project's own team).
 */
export function buildAuthConfig(appUrl: string, smtp: SmtpSettings = {}, extraRedirects: string[] = []) {
  const origin = normalizeAppUrl(appUrl);
  const allow = [`${origin}/**`, ...extraRedirects.map((u) => u.trim()).filter(Boolean)];
  const body: Record<string, string | number | boolean> = {
    site_url: origin,
    uri_allow_list: Array.from(new Set(allow)).join(","),
    external_email_enabled: true,
    mailer_otp_exp: 3600,
  };

  const anySmtp = Object.values(smtp).some((v) => v && v.trim() !== "");
  if (anySmtp) {
    const missing = (["host", "port", "user", "pass", "from"] as const).filter((k) => !smtp[k]?.trim());
    if (missing.length) throw new Error(`SMTP is partly configured; missing: ${missing.join(", ")}.`);
    if (!/^\d{2,5}$/.test(smtp.port!.trim())) throw new Error(`SMTP port must be a number: ${smtp.port}`);
    Object.assign(body, {
      smtp_host: smtp.host!.trim(),
      smtp_port: smtp.port!.trim(),
      smtp_user: smtp.user!.trim(),
      smtp_pass: smtp.pass!,
      smtp_admin_email: smtp.from!.trim(),
      smtp_sender_name: smtp.senderName?.trim() || "Groundwork",
      rate_limit_email_sent: 60,
    });
  }
  return body;
}

export type SmokeResult = { ok: boolean; problems: string[] };

/** Checks the live /login page: rendered, magic-link form present, dev shortcut absent. */
export function checkLoginPage(status: number, html: string): SmokeResult {
  const problems: string[] = [];
  if (status !== 200) problems.push(`/login returned HTTP ${status}`);
  if (!html.includes("Email me a sign-in link")) problems.push("/login doesn't show the magic-link form");
  if (html.includes("Development shortcut") || html.includes("Sign in as ")) {
    problems.push("/login shows the development sign-in shortcut in production");
  }
  return { ok: problems.length === 0, problems };
}
