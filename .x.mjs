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
const shot = async (page, file, full = false) => { await page.waitForLoadState("networkidle"); await page.waitForTimeout(700); await page.screenshot({ path: `${out}/${file}.png`, fullPage: full }); console.log(file); };

// a sample org logo, drawn here for the screenshots
const art = await (await browser.newContext({ deviceScaleFactor: 2 })).newPage();
await art.setContent(`<div id="l" style="display:inline-flex;align-items:center;gap:10px;padding:6px 10px;font:800 26px system-ui;color:#0F766E;background:transparent">
<svg width="34" height="34" viewBox="0 0 34 34"><circle cx="17" cy="17" r="16" fill="#0F766E"/><path d="M9 22 L17 9 L25 22 Z" fill="#fff"/></svg>Northside</div>`);
const logoPng = await art.locator("#l").screenshot({ omitBackground: true });

const priya = await as("Priya Shah");
await priya.goto(`${O}/settings?view=branding`); await shot(priya, "10-branding-settings-light", true);
// teal + logo
await priya.getByText("Teal", { exact: true }).click();
await priya.getByRole("button", { name: "Save branding" }).click();
await priya.getByText("Branding saved.").waitFor();
await priya.getByLabel("Upload logo").setInputFiles({ name: "northside.png", mimeType: "image/png", buffer: logoPng });
await priya.getByRole("button", { name: "Save logo" }).click();
await priya.getByText("Logo saved.").waitFor();
await priya.goto(`${O}/settings?view=branding`); await shot(priya, "11-branding-teal-with-logo", true);
await priya.goto(`${O}/dashboard`); await shot(priya, "12-dashboard-teal-logo-light");
await priya.goto(`${O}/tasks`); await shot(priya, "13-board-teal-light");

const dark = await as("Priya Shah", "dark");
await dark.goto(`${O}/dashboard`); await shot(dark, "14-dashboard-teal-logo-dark");
await dark.goto(`${O}/tasks`); await shot(dark, "15-board-teal-dark");
await dark.goto(`${O}/settings?view=profile`); await shot(dark, "16-profile-appearance-dark", true);

// restore
await priya.goto(`${O}/settings?view=branding`);
await priya.getByRole("button", { name: "Remove logo" }).click();
await priya.getByText("Logo removed.").waitFor();
await priya.getByText("Groundwork blue", { exact: true }).click();
await priya.getByRole("button", { name: "Save branding" }).click();
await priya.getByText("Branding saved.").waitFor();

// default accent, both modes
const jl = await as("Jordan Ellis");
await shot(jl, "01-dashboard-light");
await jl.goto(`${O}/tasks`); await shot(jl, "02-board-light");
await jl.getByRole("button", { name: /^Appearance:/ }).click(); await shot(jl, "03-theme-menu");
await jl.keyboard.press("Escape");
const jd = await as("Jordan Ellis", "dark");
await shot(jd, "04-dashboard-dark");
await jd.goto(`${O}/tasks`); await shot(jd, "05-board-dark");
await jd.goto(`${O}/calendar`); await shot(jd, "06-calendar-dark");
// empty state with illustration: a search with no results won't show it, so use attendance programme with no participants? use documents filter
const phone = await as("Jordan Ellis", "dark", 390, 844);
await shot(phone, "07-phone-dark");
for (const s of ["light", "dark"]) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 860 }, colorScheme: s });
  const p = await ctx.newPage();
  await p.goto(`${B}/`); await p.waitForLoadState("networkidle"); await p.waitForTimeout(800);
  await p.screenshot({ path: `${out}/08-home-${s}.png` });
  await p.goto(`${B}/login`); await p.waitForLoadState("networkidle"); await p.screenshot({ path: `${out}/09-login-${s}.png` });
  console.log("public", s);
}
await browser.close();
