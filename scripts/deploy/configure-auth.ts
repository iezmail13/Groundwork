// npx tsx scripts/deploy/configure-auth.ts https://your-app.example
// Points Supabase Auth at the deployed app (site URL, redirect allow-list)
// and, when SMTP_* variables are set, at your mail provider.
// Needs SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF.
import { readFileSync } from "node:fs";
import { buildAuthConfig } from "./lib";

// the same templates the local stack uses (supabase/config.toml)
const template = (file: string, subject: string) => ({
  subject,
  html: readFileSync(`supabase/templates/${file}`, "utf8"),
});

async function main() {
  const appUrl = process.argv[2];
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const ref = process.env.SUPABASE_PROJECT_REF;
  if (!appUrl || !token || !ref) {
    throw new Error("Usage: configure-auth.ts <app-url>, with SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF set.");
  }
  const body = buildAuthConfig(
    appUrl,
    {
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
      from: process.env.SMTP_FROM,
      senderName: process.env.SMTP_SENDER_NAME,
    },
    (process.env.EXTRA_REDIRECT_URLS ?? "").split(","),
    {
      magicLink: template("magic_link.html", "Your Groundwork sign-in link"),
      confirmation: template("confirmation.html", "Confirm your email for Groundwork"),
    },
  );
  const res = await fetch(`https://api.supabase.com/v1/projects/${encodeURIComponent(ref)}/config/auth`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Supabase Management API returned ${res.status}: ${await res.text()}`);
  console.log(
    `Auth configured: site URL ${body.site_url}; redirects ${body.uri_allow_list}; email templates set; custom SMTP ${"smtp_host" in body ? "on" : "off"}.`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
