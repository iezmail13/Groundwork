import { test, expect, type Browser, type Page } from "@playwright/test";
import { deriveTokens } from "@/lib/theme/theme";

// Part 3: dark mode persists; an org accent reaches every member; a personal
// accent overrides it (until an owner turns that off); logo upload rejects SVG
// and oversize files, and removing the logo brings Groundwork's back.
// Runs against the seeded Northside organization and puts everything back.

const ORG = "/northside-youth-collective";

test.describe.configure({ mode: "serial" });

async function signIn(browser: Browser, name: string, colorScheme: "light" | "dark" = "light"): Promise<Page> {
  const context = await browser.newContext({ colorScheme });
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByRole("button", { name: `Sign in as ${name}` }).click();
  await page.waitForURL(/\/dashboard$/);
  await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
  return page;
}

async function visit(page: Page, path: string) {
  await page.goto(path);
  await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
}

const accentOf = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--accent").trim().toUpperCase());

async function chooseAppearance(page: Page, option: "Light" | "Dark" | "Match my device") {
  await page.getByRole("button", { name: /^Appearance:/ }).click();
  await page.getByRole("menuitemradio", { name: option }).click();
}

async function saveBranding(page: Page, preset: string | null) {
  await visit(page, `${ORG}/settings?view=branding`);
  if (preset) await page.getByText(preset, { exact: true }).click();
  await page.getByRole("button", { name: "Save branding" }).click();
  await expect(page.getByText("Branding saved.")).toBeVisible();
}

test("dark mode is saved to the profile and follows the person to a new device", async ({ browser }) => {
  const page = await signIn(browser, "Sofia Alvarez");
  // start from light, whatever an earlier run left behind
  await chooseAppearance(page, "Light");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await chooseAppearance(page, "Dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const themeCookie = async (p: Page) => (await p.context().cookies()).find((c) => c.name === "theme")?.value;
  await expect.poll(() => themeCookie(page)).toBe("dark");
  // the server renders it from the cookie, so it's right before any script runs
  const html = await (await page.request.get(`${ORG}/dashboard`)).text();
  expect(html).toMatch(/<html[^>]*data-theme="dark"/);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgb(12, 28, 53)");

  // another browser: no cookie yet, so it learns the mode from the profile
  const other = await signIn(browser, "Sofia Alvarez");
  await expect(other.locator("html")).toHaveAttribute("data-theme", "dark");
  await other.reload();
  await expect(other.locator("html")).toHaveAttribute("data-theme", "dark");

  // and back to following the device
  await chooseAppearance(other, "Match my device");
  await expect(other.locator("html")).toHaveAttribute("data-theme", "system");
  await other.context().close();
  await page.context().close();
});

test("an org accent applies to every member, and a personal accent overrides it on that person's screen", async ({ browser }) => {
  const teal = deriveTokens("light", "#0F766E").accent;
  const raspberry = deriveTokens("light", "#BE185D").accent;
  const manager = await signIn(browser, "Priya Shah");
  const staff = await signIn(browser, "Sofia Alvarez");
  const owner = await signIn(browser, "Jordan Ellis");
  // Northside as seeded: default accent, personal accents allowed, Sofia following the org
  const restore = async () => {
    await visit(owner, `${ORG}/settings?view=branding`);
    await owner.getByText("Groundwork blue", { exact: true }).click();
    await owner.getByLabel("Let people choose their own accent colour").check();
    await owner.getByRole("button", { name: "Save branding" }).click();
    await expect(owner.getByText("Branding saved.")).toBeVisible();
    await visit(staff, `${ORG}/settings?view=profile`);
    await staff.getByText("Use the organization's colour", { exact: true }).click();
    await staff.getByRole("button", { name: "Save appearance" }).click();
    await expect(staff.getByText("This only changes how Groundwork looks for you.")).toBeVisible();
  };
  await restore();
  try {
    expect(await accentOf(staff)).toBe("#0006BF");

    await saveBranding(manager, "Teal");
    expect(await accentOf(manager)).toBe(teal);
    await visit(staff, `${ORG}/dashboard`);
    expect(await accentOf(staff)).toBe(teal);
    // the Branding tab is read-only for staff
    await visit(staff, `${ORG}/settings?view=branding`);
    await expect(staff.getByRole("button", { name: "Save branding" })).toHaveCount(0);

    // Sofia picks her own colour: only her screen changes
    await visit(staff, `${ORG}/settings?view=profile`);
    await staff.getByText("Raspberry", { exact: true }).click();
    await staff.getByRole("button", { name: "Save appearance" }).click();
    await expect(staff.getByText("This only changes how Groundwork looks for you.")).toBeVisible();
    await visit(staff, `${ORG}/dashboard`);
    expect(await accentOf(staff)).toBe(raspberry);
    await visit(manager, `${ORG}/dashboard`);
    expect(await accentOf(manager)).toBe(teal);

    // a manager can't switch personal accents off; the owner can
    await visit(manager, `${ORG}/settings?view=branding`);
    await expect(manager.getByLabel("Let people choose their own accent colour")).toBeDisabled();
    await visit(owner, `${ORG}/settings?view=branding`);
    await owner.getByLabel("Let people choose their own accent colour").uncheck();
    await owner.getByRole("button", { name: "Save branding" }).click();
    await expect(owner.getByText("Branding saved.")).toBeVisible();
    await visit(staff, `${ORG}/dashboard`);
    expect(await accentOf(staff)).toBe(teal);

    // the changes are in the activity log
    await visit(owner, `${ORG}/activity`);
    await expect(owner.getByText("set one accent colour for everyone").first()).toBeVisible();
  } finally {
    await restore();
    for (const p of [manager, staff, owner]) await p.context().close();
  }
});

test("a logo upload rejects SVG and oversize files, and removing it restores the Groundwork logo", async ({ browser }) => {
  const page = await signIn(browser, "Priya Shah");
  const sidebar = page.getByRole("complementary", { name: "Sidebar" });
  await expect(sidebar.getByRole("link", { name: "Groundwork home" })).toBeVisible();
  await visit(page, `${ORG}/settings?view=branding`);
  const file = page.getByLabel("Upload logo");

  await file.setInputFiles({
    name: "logo.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
  });
  await expect(page.getByText("SVG files aren't accepted").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Save logo" })).toHaveCount(0);

  await file.setInputFiles({ name: "huge.png", mimeType: "image/png", buffer: Buffer.alloc(2 * 1024 * 1024 + 1) });
  await expect(page.getByText("Logos can be at most 2 MB.").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Save logo" })).toHaveCount(0);

  // a real PNG: a snapshot of part of this page
  const png = await page.screenshot({ clip: { x: 0, y: 0, width: 240, height: 64 } });
  await file.setInputFiles({ name: "northside.png", mimeType: "image/png", buffer: png });
  await expect(page.getByRole("img", { name: "Preview of the new logo" })).toBeVisible();
  await page.getByRole("button", { name: "Save logo" }).click();
  await expect(page.getByText("Logo saved.")).toBeVisible();

  await visit(page, `${ORG}/dashboard`);
  await expect(sidebar.getByRole("link", { name: "Northside Youth Collective home" })).toBeVisible();
  await expect(sidebar.getByText("Powered by Groundwork")).toBeVisible();
  await expect(sidebar.getByRole("link", { name: "Groundwork home" })).toHaveCount(0);

  await visit(page, `${ORG}/settings?view=branding`);
  await page.getByRole("button", { name: "Remove logo" }).click();
  await expect(page.getByText("Logo removed. The Groundwork logo is back.")).toBeVisible();
  await visit(page, `${ORG}/dashboard`);
  await expect(sidebar.getByRole("link", { name: "Groundwork home" })).toBeVisible();
  await expect(sidebar.getByText("Powered by Groundwork")).toHaveCount(0);
  await page.context().close();
});
