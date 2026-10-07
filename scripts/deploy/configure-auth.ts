// npx tsx scripts/deploy/configure-auth.ts https://your-app.example
// Points Supabase Auth at the deployed app (site URL, redirect allow-list),
// at your mail provider when SMTP_* variables are set, and installs
// Groundwork's sign-in email templates.
// Needs SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF.
import { appendFileSync, readFileSync } from "node:fs";
import {
  buildAuthSettings,
  buildTemplateConfig,
  hasSmtp,
  isSkippableTemplateRefusal,
  type SmtpSettings,
} from "./lib";

// the same templates the local stack uses (supabase/config.toml)
const template = (file: string, subject: string) => ({
  subject,
  html: readFileSync(`supabase/templates/${file}`, "utf8"),
});

/** Writes a notice to the job log and, in GitHub Actions, to the job summary. */
function warn(title: string, message: string) {
  const escape = (v: string) => v.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
  console.log(`::warning title=${escape(title).replace(/:/g, "%3A").replace(/,/g, "%2C")}::${escape(message)}`);
  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary) appendFileSync(summary, `> **${title}.** ${message}\n\n`);
}

async function main() {
  const appUrl = process.argv[2];
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const ref = process.env.SUPABASE_PROJECT_REF;
  if (!appUrl || !token || !ref) {
    throw new Error("Usage: configure-auth.ts <app-url>, with SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF set.");
  }
  const endpoint = `https://api.supabase.com/v1/projects/${encodeURIComponent(ref)}/config/auth`;
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const smtp: SmtpSettings = {
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.SMTP_FROM,
    senderName: process.env.SMTP_SENDER_NAME,
  };
  const settings = buildAuthSettings(appUrl, smtp, (process.env.EXTRA_REDIRECT_URLS ?? "").split(","));
  const templates = buildTemplateConfig({
    magicLink: template("magic_link.html", "Your Groundwork sign-in link"),
    confirmation: template("confirmation.html", "Confirm your email for Groundwork"),
  });

  // 1. site URL, redirects and SMTP: sign-in doesn't work without these
  const res = await fetch(endpoint, { method: "PATCH", headers, body: JSON.stringify(settings) });
  if (!res.ok) throw new Error(`Supabase Management API returned ${res.status}: ${await res.text()}`);
  console.log(
    `Auth configured: site URL ${settings.site_url}; redirects ${settings.uri_allow_list}; custom SMTP ${hasSmtp(smtp) ? "on" : "off"}.`,
  );

  // 2. the email templates, which Supabase may refuse without custom SMTP
  const tpl = await fetch(endpoint, { method: "PATCH", headers, body: JSON.stringify(templates) });
  if (tpl.ok) {
    console.log("Sign-in email templates installed.");
    return;
  }
  const reason = await tpl.text();
  let smtpHost: string | null = null;
  if (!hasSmtp(smtp)) {
    // custom SMTP may have been set up in the dashboard instead of here
    const current = await fetch(endpoint, { headers });
    if (!current.ok) throw new Error(`Supabase Management API returned ${current.status}: ${await current.text()}`);
    smtpHost = ((await current.json()) as { smtp_host?: string | null }).smtp_host ?? null;
  }
  if (hasSmtp(smtp) || !isSkippableTemplateRefusal(tpl.status, smtpHost)) {
    throw new Error(`Supabase refused the email templates (HTTP ${tpl.status}): ${reason}`);
  }
  warn(
    "Sign-in emails use Supabase's default template",
    `Supabase refused Groundwork's email templates (HTTP ${tpl.status}: ${reason.slice(0, 300)}). ` +
      "New Free-plan projects can only change them with custom SMTP. Sign-in still works, but each link only " +
      "opens in the browser that asked for it, and mail scanners can use it up. Add the SMTP_* settings and " +
      "deploy again to install Groundwork's templates.",
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
