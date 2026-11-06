// npx tsx scripts/maintenance/set.ts
// Writes the maintenance setting (D87) to Vercel Edge Config, for the
// "Maintenance" workflow and for deploys started with maintenance on.
//
// Env: VERCEL_TOKEN, EDGE_CONFIG_ID (ecfg_...), optional VERCEL_SCOPE (team id),
// STATE (on|off), MESSAGE, STARTS_AT, ENDS_AT. "off" with a future STARTS_AT
// schedules a notice without switching maintenance on.
import { appendFileSync } from "node:fs";
import { settingSchema, toStored, type MaintenanceSetting } from "../../lib/maintenance";
import { pickVercelScope, type VercelUser } from "../deploy/lib";

async function teamId(token: string): Promise<string> {
  const configured = process.env.VERCEL_SCOPE?.trim();
  if (configured) return configured;
  const res = await fetch("https://api.vercel.com/v2/user", { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Vercel API returned ${res.status} reading the account.`);
  return pickVercelScope(((await res.json()) as { user?: VercelUser }).user);
}

function summary(setting: MaintenanceSetting): string {
  const when = (iso: string | null) => (iso ? new Date(iso).toUTCString() : "not set");
  return [
    `## Maintenance ${setting.active ? "ON" : "off"}`,
    "",
    `- Message: ${setting.message || "(none)"}`,
    `- Starts: ${when(setting.startsAt)}`,
    `- Expected end: ${when(setting.endsAt)}`,
    "",
    setting.active
      ? "Every app page now shows the maintenance page (HTTP 503). The landing page stays up with a banner."
      : setting.startsAt && Date.parse(setting.startsAt) > Date.now()
        ? "Signed-in people see a scheduled-maintenance banner from 48 hours before the start."
        : "The site is running normally.",
    "",
  ].join("\n");
}

async function main() {
  const token = process.env.VERCEL_TOKEN;
  const id = process.env.EDGE_CONFIG_ID?.trim();
  if (!token) throw new Error("VERCEL_TOKEN is not set.");
  if (!id || !/^ecfg_[A-Za-z0-9]+$/.test(id)) {
    throw new Error(
      "EDGE_CONFIG_ID is not set. Create an Edge Config in Vercel (Storage → Edge Config), connect it to the project, and add its id (ecfg_...) as the EDGE_CONFIG_ID repository variable.",
    );
  }
  const state = (process.env.STATE ?? "").trim().toLowerCase();
  if (state !== "on" && state !== "off") throw new Error('STATE must be "on" or "off".');
  const parsed = settingSchema.safeParse({
    active: state === "on",
    message: process.env.MESSAGE ?? "",
    starts_at: process.env.STARTS_AT || null,
    ends_at: process.env.ENDS_AT || null,
  });
  if (!parsed.success) throw new Error(parsed.error.issues.map((i) => i.message).join(" "));
  const setting = parsed.data;

  const team = await teamId(token);
  const res = await fetch(`https://api.vercel.com/v1/edge-config/${id}/items?teamId=${encodeURIComponent(team)}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ items: [{ operation: "upsert", key: "maintenance", value: toStored(setting) }] }),
  });
  if (!res.ok) throw new Error(`Vercel API returned ${res.status} updating the Edge Config: ${(await res.text()).slice(0, 300)}`);

  const text = summary(setting);
  console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, text);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
