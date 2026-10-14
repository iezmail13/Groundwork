import { chromium } from "@playwright/test";
const out = process.argv[2];
const B = "http://localhost:3100";
const O = `${B}/northside-youth-collective`;
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
async function as(name, scheme = "light", w = 1366, h = 860) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, timezoneId: "America/Toronto", colorScheme: scheme });
  ctx.setDefaultTimeout(150000);
  const page = await ctx.newPage();
  await page.goto(`${B}/login`);
  await page.getByRole("button", { name: `Sign in as ${name}` }).click();
  await page.waitForURL(/dashboard$/);
  return page;
}
const shot = async (page, file) => { await page.waitForLoadState("networkidle"); await page.waitForTimeout(600); await page.screenshot({ path: `${out}/${file}.png` }); console.log(file); };
const light = await as("Jordan Ellis");
await shot(light, "dash-light");
await light.goto(`${O}/tasks`); await shot(light, "board-light");
const dark = await as("Jordan Ellis", "dark");
await shot(dark, "dash-dark");
await dark.goto(`${O}/tasks`); await shot(dark, "board-dark");
await browser.close();
