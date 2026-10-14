import { chromium } from "@playwright/test";
const out = process.argv[2];
const B = "http://localhost:3100";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
for (const scheme of ["light", "dark"]) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 860 }, colorScheme: scheme });
  const page = await ctx.newPage();
  await page.goto(`${B}/`); await page.waitForLoadState("networkidle"); await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/home-${scheme}.png` });
  await page.goto(`${B}/login`); await page.waitForLoadState("networkidle");
  await page.screenshot({ path: `${out}/login-${scheme}.png` });
  console.log(scheme);
  await ctx.close();
}
await browser.close();
