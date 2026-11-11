// Captures the landing page screenshots in public/marketing/ from the seeded
// demo organization, so they always show the real app.
//
//   npm run db:start && npm run seed && npm run dev   (in another terminal)
//   npx tsx scripts/capture-marketing.ts
//
// Signs in with the development shortcut, so it only works against `npm run dev`.
//
// With --dark it captures the same pictures in dark mode, as name-dark.png,
// for the hero preview's dark scheme.
//
// With --features it captures the landing page's feature pictures instead
// (D117), from "Maple Youth Collective" (npm run seed:marketing): programs,
// the task board, the calendar and documents, each at 2x in light and dark
// mode, cropped to the page content and saved as WebP.
// BASE_URL (default http://localhost:3000) and PLAYWRIGHT_CHROMIUM_EXECUTABLE
// can be set to point at another server or browser.
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { chromium, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const ORG = "/northside-youth-collective";
const OUT = "public/marketing";

async function settle(page: Page, path: string) {
  await page.goto(`${BASE}${path}`);
  await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
  await page.waitForLoadState("networkidle");
  // let the dashboard's count-up and fill animations finish
  await page.waitForTimeout(1200);
}

const MAPLE = "/maple-youth-collective";
const MAPLE_OWNER = "dana@maple.example.org";
// Captured in a narrower window than a laptop's, so the app's words stay
// readable once the picture is scaled into the landing page's column. Each crop
// is close to the 4:3 frame it's shown in.
const FEATURE_VIEWPORT = { width: 1100, height: 900 };
const FEATURES = [
  { path: `${MAPLE}/projects`, file: "feature-programs", height: 600 },
  { path: `${MAPLE}/tasks`, file: "feature-board", height: 600 },
  { path: `${MAPLE}/calendar`, file: "feature-calendar", height: 600 },
  { path: `${MAPLE}/documents`, file: "feature-documents", height: 600 },
];

/** A one-time sign-in link for Maple's owner, made with the service role (local only). */
async function signInLink(): Promise<string> {
  for (const file of [".env.local", ".env"]) if (existsSync(file)) process.loadEnvFile(file);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (npm run env:local).");
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: MAPLE_OWNER });
  if (error || !data.properties?.hashed_token) throw new Error(`No sign-in link for ${MAPLE_OWNER}: run npm run seed:marketing.`);
  return `${BASE}/auth/confirm?token_hash=${data.properties.hashed_token}&type=magiclink&next=${encodeURIComponent(`${MAPLE}/dashboard`)}`;
}

/** Saves a PNG as optimised WebP (Pillow), then removes the PNG. */
function toWebp(png: string) {
  const webp = png.replace(/\.png$/, ".webp");
  execFileSync("python3", ["-I", "-c", "import sys;from PIL import Image;Image.open(sys.argv[1]).save(sys.argv[2],'WEBP',quality=82,method=6)", png, webp]);
  rmSync(png);
  return webp;
}

async function captureFeatures() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined });
  for (const scheme of ["light", "dark"] as const) {
    const context = await browser.newContext({ viewport: FEATURE_VIEWPORT, deviceScaleFactor: 2, colorScheme: scheme, timezoneId: "America/Toronto" });
    const page = await context.newPage();
    await page.goto(await signInLink());
    await page.getByRole("button", { name: "Continue to Groundwork" }).click();
    await page.waitForURL(/\/dashboard$/);
    for (const shot of FEATURES) {
      await settle(page, shot.path);
      // park the pointer off the content, so no row is caught mid-hover
      await page.mouse.move(1, 1);
      // the page content only, with a little of the page around it: no sidebar or top bar
      const content = page.locator("#main > div").first();
      const box = await content.boundingBox();
      if (!box) throw new Error(`No content on ${shot.path}`);
      const pad = 20;
      const png = `${OUT}/${shot.file}-${scheme}.png`;
      await page.screenshot({
        path: png,
        fullPage: true,
        clip: { x: box.x - pad, y: box.y - pad, width: box.width + pad * 2, height: Math.min(box.height, shot.height) + pad * 2 },
      });
      console.log(`saved ${toWebp(png)}`);
    }
    await context.close();
  }
  await browser.close();
}

async function main() {
  if (process.argv.includes("--features")) return captureFeatures();
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
  });
  const dark = process.argv.includes("--dark");
  const suffix = dark ? "-dark" : "";
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, colorScheme: dark ? "dark" : "light" });
  const page = await context.newPage();

  await page.goto(`${BASE}/login`);
  await page.getByRole("button", { name: "Sign in as Jordan Ellis" }).click();
  await page.waitForURL(/\/dashboard$/);

  const shots: { path: string; file: string }[] = [
    { path: `${ORG}/dashboard`, file: "dashboard.png" },
    { path: `${ORG}/tasks`, file: "tasks-board.png" },
    { path: `${ORG}/calendar`, file: "calendar.png" },
    { path: `${ORG}/documents`, file: "documents.png" },
  ];
  for (const shot of shots) {
    await settle(page, shot.path);
    const file = shot.file.replace(/\.png$/, `${suffix}.png`);
    await page.screenshot({ path: `${OUT}/${file}` });
    console.log(`saved ${OUT}/${file}`);
  }

  // the dashboard's widget grid alone, a closer crop than the hero shot
  await settle(page, `${ORG}/dashboard`);
  const grid = await page.locator("li[data-widget]").first().locator("xpath=..").boundingBox();
  if (!grid) throw new Error("The dashboard widget grid wasn't found.");
  await page.screenshot({
    path: `${OUT}/dashboard-widgets${suffix}.png`,
    fullPage: true,
    clip: { x: grid.x, y: grid.y, width: grid.width, height: Math.min(grid.height, 840) },
  });
  console.log(`saved ${OUT}/dashboard-widgets${suffix}.png`);

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
