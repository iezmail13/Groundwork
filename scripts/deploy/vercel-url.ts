// npx tsx scripts/deploy/vercel-url.ts
// Prints the production URL of the linked Vercel project (.vercel/project.json).
import { readFileSync } from "node:fs";
import { pickProductionDomain, type VercelDomain } from "./lib";

async function main() {
  const token = process.env.VERCEL_TOKEN;
  if (!token) throw new Error("VERCEL_TOKEN is not set.");
  const { projectId, orgId } = JSON.parse(readFileSync(".vercel/project.json", "utf8")) as {
    projectId: string;
    orgId: string;
  };
  const query = orgId?.startsWith("team_") ? `?teamId=${encodeURIComponent(orgId)}` : "";
  const res = await fetch(`https://api.vercel.com/v9/projects/${encodeURIComponent(projectId)}/domains${query}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Vercel API returned ${res.status}: ${await res.text()}`);
  const { domains } = (await res.json()) as { domains: VercelDomain[] };
  const domain = pickProductionDomain(domains ?? []);
  if (!domain) throw new Error("The Vercel project has no production domain yet.");
  process.stdout.write(`https://${domain}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
