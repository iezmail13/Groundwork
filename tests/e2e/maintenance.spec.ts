import { expect, test, type Browser } from "@playwright/test";

// Maintenance mode (D87). The dev server lets each browser context set the
// maintenance setting with a header (development only, see proxy.ts).

const BYPASS = "e2e-bypass-token-0123456789";
const hours = (n: number) => new Date(Date.now() + n * 3600_000).toISOString();

async function contextWith(browser: Browser, setting: object) {
  return browser.newContext({ extraHTTPHeaders: { "x-gw-test-maintenance": JSON.stringify(setting) } });
}

test("maintenance: app routes answer 503 with the maintenance page, the landing page stays up, the bypass gets through", async ({ browser }) => {
  const context = await contextWith(browser, { active: true, message: "Upgrading the database.", starts_at: null, ends_at: hours(1) });
  const page = await context.newPage();

  const res = await page.goto("/northside-youth-collective/dashboard");
  expect(res?.status()).toBe(503);
  expect(Number(res?.headers()["retry-after"])).toBeGreaterThan(3000);
  await expect(page).toHaveURL(/\/northside-youth-collective\/dashboard$/);
  await expect(page.getByRole("heading", { name: "We're doing some maintenance" })).toBeVisible();
  await expect(page.getByText("Upgrading the database.")).toBeVisible();
  // shown in the visitor's own time zone, with the zone named
  await expect(page.getByText(/^Expected back: [A-Z][a-z]+day, [A-Z][a-z]+ \d+ at .+ (Time|UTC)$/)).toBeVisible();
  await expect(page.getByRole("link", { name: "groundworkceo@gmail.com" })).toBeVisible();

  const login = await page.goto("/login");
  expect(login?.status()).toBe(503);

  const home = await page.goto("/");
  expect(home?.status()).toBe(200);
  await expect(page.getByRole("status").filter({ hasText: "Groundwork is down for maintenance: Upgrading the database." })).toBeVisible();

  const status = await page.request.get("/maintenance/status");
  expect(await status.json()).toEqual({ active: true });

  // a wrong token changes nothing; the right one sets a cookie for the session
  expect((await page.goto("/login?bypass=wrong-token-0000000000"))?.status()).toBe(503);
  await page.goto(`/login?bypass=${BYPASS}`);
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("button", { name: "Email me a sign-in link" })).toBeVisible();
  const cookie = (await context.cookies()).find((c) => c.name === "gw_maintenance_bypass");
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.value).not.toContain(BYPASS);
  await context.close();
});

test("maintenance: a scheduled window shows a banner inside 48 hours, not before", async ({ browser }) => {
  const soon = await contextWith(browser, { active: false, message: "", starts_at: hours(24), ends_at: hours(25) });
  const page = await soon.newPage();
  await page.goto("/login");
  await page.getByRole("button", { name: "Sign in as Jordan Ellis" }).click();
  await expect(page).toHaveURL(/dashboard$/);
  const banner = page.getByRole("status").filter({ hasText: /^Scheduled maintenance: .+\. Groundwork will be unavailable\.$/ });
  await expect(banner).toBeVisible();
  await page.getByRole("button", { name: "Dismiss the maintenance notice" }).click();
  await expect(banner).toHaveCount(0);
  await page.reload();
  await expect(banner).toHaveCount(0);
  // the landing page shows the same notice quietly
  const visitor = await (await contextWith(browser, { active: false, message: "", starts_at: hours(24), ends_at: hours(25) })).newPage();
  await visitor.goto("/");
  await expect(visitor.getByText(/^Scheduled maintenance: .+ Groundwork will be unavailable\.$/)).toBeVisible();
  await soon.close();

  const later = await contextWith(browser, { active: false, message: "", starts_at: hours(72), ends_at: hours(73) });
  const page2 = await later.newPage();
  await page2.goto("/login");
  await page2.getByRole("button", { name: "Sign in as Jordan Ellis" }).click();
  await expect(page2).toHaveURL(/dashboard$/);
  await expect(page2.getByText(/Scheduled maintenance/)).toHaveCount(0);
  await later.close();
});
