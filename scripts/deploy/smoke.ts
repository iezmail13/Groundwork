// npx tsx scripts/deploy/smoke.ts https://your-app.example
// Checks a deployment: / shows the landing page to signed-out visitors,
// /login renders the magic-link form, and the dev sign-in shortcut is absent.
import { checkLandingPage, checkLoginPage, normalizeAppUrl } from "./lib";

async function attempt(origin: string): Promise<string[]> {
  const problems: string[] = [];
  const home = await fetch(`${origin}/`, { redirect: "manual" });
  problems.push(...checkLandingPage(home.status, await home.text()).problems);
  const login = await fetch(`${origin}/login`);
  problems.push(...checkLoginPage(login.status, await login.text()).problems);
  const logo = await fetch(`${origin}/logo.svg`);
  if (logo.status !== 200) problems.push(`/logo.svg returned HTTP ${logo.status}`);
  return problems;
}

async function main() {
  const origin = normalizeAppUrl(process.argv[2] ?? "");
  let problems: string[] = [];
  // a fresh deployment can take a few seconds to reach every edge
  for (let i = 0; i < 6; i++) {
    problems = await attempt(origin).catch((e: unknown) => [String(e)]);
    if (problems.length === 0) break;
    await new Promise((r) => setTimeout(r, 5000));
  }
  if (problems.length) {
    console.error(`Smoke test failed for ${origin}:\n- ${problems.join("\n- ")}`);
    process.exit(1);
  }
  console.log(`Smoke test passed for ${origin}.`);
}

main();
