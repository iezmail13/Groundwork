// npx tsx scripts/deploy/vercel-scope.ts -> the Vercel scope (team) to deploy into
// Used when the VERCEL_SCOPE variable isn't set: the token account's default
// team. The Vercel CLI won't pick one itself when the token sees several.
// Needs VERCEL_TOKEN.
import { pickVercelScope, type VercelUser } from "./lib";

async function main() {
  const token = process.env.VERCEL_TOKEN;
  if (!token) throw new Error("VERCEL_TOKEN is not set.");
  const res = await fetch("https://api.vercel.com/v2/user", { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Vercel API returned ${res.status}: ${await res.text()}`);
  process.stdout.write(pickVercelScope(((await res.json()) as { user?: VercelUser }).user));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
