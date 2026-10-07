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

export type VercelDomain = {
  name: string;
  redirect?: string | null;
  verified?: boolean;
  gitBranch?: string | null;
  customEnvironmentId?: string | null;
};

/** Domains that serve production deployments directly (no redirect, no branch or custom environment). */
function productionDomains(domains: VercelDomain[]): VercelDomain[] {
  return domains.filter((d) => !d.redirect && d.verified !== false && !d.gitBranch && !d.customEnvironmentId);
}

/**
 * The URL to report and smoke-test when APP_URL isn't set: the shortest
 * *.vercel.app production domain, which works as soon as the project exists.
 * A custom domain is used only when there is no vercel.app one, since a newly
 * added custom domain may not have its DNS pointed at Vercel yet.
 */
export function pickProductionDomain(domains: VercelDomain[]): string | null {
  const usable = productionDomains(domains);
  const vercel = usable.filter((d) => d.name.endsWith(".vercel.app"));
  const pool = vercel.length ? vercel : usable;
  const sorted = [...pool].sort((a, b) => a.name.length - b.name.length || a.name.localeCompare(b.name));
  return sorted[0]?.name ?? null;
}

/** Sign-in redirect allow-list entries for every production domain of the project. */
export function productionRedirects(domains: VercelDomain[]): string[] {
  return productionDomains(domains).map((d) => `https://${d.name}/**`);
}

/** Whether a URL's host is attached to the Vercel project at all. */
export function isAttachedDomain(domains: VercelDomain[], url: string): boolean {
  const host = new URL(normalizeAppUrl(url)).host;
  return domains.some((d) => d.name === host);
}

export type SmtpSettings = {
  host?: string;
  port?: string;
  user?: string;
  pass?: string;
  from?: string;
  senderName?: string;
};

export type EmailTemplate = { subject: string; html: string };
export type EmailTemplates = { magicLink?: EmailTemplate; confirmation?: EmailTemplate };

/** Whether any SMTP_* setting is filled in. */
export function hasSmtp(smtp: SmtpSettings): boolean {
  return Object.values(smtp).some((v) => v && v.trim() !== "");
}

/**
 * Body for PATCH /v1/projects/{ref}/config/auth: the site URL, the redirect
 * allow-list (this app only), and custom SMTP when it's configured
 * (Supabase's built-in mailer only delivers to the project's team).
 * Email templates are sent separately (buildTemplateConfig), because Supabase
 * refuses template changes on new Free-plan projects without custom SMTP.
 */
export function buildAuthSettings(appUrl: string, smtp: SmtpSettings = {}, extraRedirects: string[] = []) {
  const origin = normalizeAppUrl(appUrl);
  const allow = [`${origin}/**`, ...extraRedirects.map((u) => u.trim()).filter(Boolean)];
  const body: Record<string, string | number | boolean> = {
    site_url: origin,
    uri_allow_list: Array.from(new Set(allow)).join(","),
    external_email_enabled: true,
    mailer_otp_exp: 3600,
  };

  if (hasSmtp(smtp)) {
    const missing = (["host", "port", "user", "pass", "from"] as const).filter((k) => !smtp[k]?.trim());
    if (missing.length) throw new Error(`SMTP is partly configured; missing: ${missing.join(", ")}.`);
    if (!/^\d{2,5}$/.test(smtp.port!.trim())) throw new Error(`SMTP port must be a number: ${smtp.port}`);
    if (!/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(smtp.from!.trim())) {
      throw new Error(`SMTP_FROM must be a plain email address, like hello@your-domain: ${smtp.from}`);
    }
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

/**
 * Body for the second PATCH: Groundwork's sign-in email templates, which link
 * to /auth/confirm (see supabase/templates).
 */
export function buildTemplateConfig(templates: EmailTemplates) {
  const body: Record<string, string> = {};
  for (const [key, template] of [
    ["magic_link", templates.magicLink],
    ["confirmation", templates.confirmation],
  ] as const) {
    if (!template) continue;
    if (!template.html.includes("{{ .TokenHash }}")) {
      throw new Error(`The ${key} email template must link with {{ .TokenHash }}.`);
    }
    body[`mailer_subjects_${key}`] = template.subject;
    body[`mailer_templates_${key}_content`] = template.html;
  }
  return body;
}

/**
 * Whether a refused template update can be skipped with a warning: Supabase
 * doesn't let new Free-plan projects change their email templates while they
 * send through its default mailer. Anything else is a real failure.
 */
export function isSkippableTemplateRefusal(status: number, smtpHostInEffect: string | null | undefined): boolean {
  return status >= 400 && status < 500 && !smtpHostInEffect?.trim();
}

/** A user from GET https://api.vercel.com/v2/user. */
export type VercelUser = { username?: string; defaultTeamId?: string | null };

/**
 * The scope the Vercel CLI should use when VERCEL_SCOPE isn't set: the
 * account's default team, or the username for older accounts without one.
 * The CLI refuses to guess when a token can see several teams.
 */
export function pickVercelScope(user: VercelUser | undefined): string {
  const scope = user?.defaultTeamId?.trim() || user?.username?.trim();
  if (!scope) throw new Error("Couldn't tell which Vercel team to use. Set the VERCEL_SCOPE variable to the team's slug.");
  return scope;
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
