// npx tsx scripts/deploy/vercel-url.ts            -> the production URL to report and smoke-test
// npx tsx scripts/deploy/vercel-url.ts --redirects -> comma-separated sign-in allow-list entries
// npx tsx scripts/deploy/vercel-url.ts --check URL -> URL as an https origin; exits 1 unless its host is attached to the project
// Reads the linked project from .vercel/project.json; needs VERCEL_TOKEN.
import { readFileSync } from "node:fs";
import { isAttachedDomain, normalizeAppUrl, pickProductionDomain, productionRedirects, type VercelDomain } from "./lib";

async function domains(): Promise<VercelDomain[]> {
  const token = process.env.VERCEL_TOKEN;
  if (!token) throw new Error("VERCEL_TOKEN is not set.");
  const { projectId, orgId } = JSON.parse(readFileSync(".vercel/project.json", "utf8")) as {
    projectId: string;
    orgId: string;
  };
  const query = `?limit=100${orgId?.startsWith("team_") ? `&teamId=${encodeURIComponent(orgId)}` : ""}`;
  const res = await fetch(`https://api.vercel.com/v9/projects/${encodeURIComponent(projectId)}/domains${query}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Vercel API returned ${res.status}: ${await res.text()}`);
  return ((await res.json()) as { domains?: VercelDomain[] }).domains ?? [];
}

async function main() {
  const [mode, arg] = process.argv.slice(2);
  const list = await domains();
  if (mode === "--redirects") {
    process.stdout.write(productionRedirects(list).join(","));
    return;
  }
  if (mode === "--check") {
    if (!arg || !isAttachedDomain(list, arg)) {
      throw new Error(
        `APP_URL ${arg ?? "(empty)"} is not a domain of this Vercel project. Add it under Project → Settings → Domains, ` +
          "then run the deploy again. On the very first deploy the project doesn't exist yet: leave APP_URL unset, " +
          "deploy once, then add the domain and set APP_URL.",
      );
    }
    process.stdout.write(normalizeAppUrl(arg));
    return;
  }
  const domain = pickProductionDomain(list);
  if (!domain) throw new Error("The Vercel project has no production domain yet.");
  process.stdout.write(`https://${domain}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
