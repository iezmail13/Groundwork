// Captures the landing page screenshots in public/marketing/ from the seeded
// demo organization, so they always show the real app.
//
//   npm run db:start && npm run seed && npm run dev   (in another terminal)
//   npx tsx scripts/capture-marketing.ts
//
// Signs in with the development shortcut, so it only works against `npm run dev`.
// BASE_URL (default http://localhost:3000) and PLAYWRIGHT_CHROMIUM_EXECUTABLE
// can be set to point at another server or browser.
import { mkdirSync } from "node:fs";
import { chromium, type Page } from "@playwright/test";

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

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
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
    await page.screenshot({ path: `${OUT}/${shot.file}` });
    console.log(`saved ${OUT}/${shot.file}`);
  }

  // the dashboard's widget grid alone, a closer crop than the hero shot
  await settle(page, `${ORG}/dashboard`);
  const grid = await page.locator("li[data-widget]").first().locator("xpath=..").boundingBox();
  if (!grid) throw new Error("The dashboard widget grid wasn't found.");
  await page.screenshot({
    path: `${OUT}/dashboard-widgets.png`,
    fullPage: true,
    clip: { x: grid.x, y: grid.y, width: grid.width, height: Math.min(grid.height, 840) },
  });
  console.log(`saved ${OUT}/dashboard-widgets.png`);

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
