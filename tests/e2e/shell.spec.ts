import { test, expect, type Browser, type Page } from "@playwright/test";

// The shell (D110): Funds and Spending sit under a Finances heading that opens
// and closes; Activity is a menu in the top bar beside the notifications, not
// a sidebar item; filters sit behind one Filters button. Seeded Northside:
// Priya is a manager; Marcus is an admin.

const ORG = "/northside-youth-collective";

async function signIn(browser: Browser, name: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/login");
  await page.getByRole("button", { name: `Sign in as ${name}` }).click();
  await page.waitForURL(/\/dashboard$/);
  await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
  return page;
}

test("Finances holds Funds and Spending, and opens by itself on one of them", async ({ browser }) => {
  const priya = await signIn(browser, "Priya Shah");
  const nav = priya.getByRole("navigation", { name: "Main" }).first();
  // Activity left the sidebar
  await expect(nav.getByRole("link", { name: "Activity" })).toHaveCount(0);
  const finances = nav.getByRole("button", { name: "Finances" });
  await expect(finances).toHaveAttribute("aria-expanded", "false");
  await expect(nav.getByRole("link", { name: "Spending" })).toBeHidden();
  await finances.click();
  await expect(finances).toHaveAttribute("aria-expanded", "true");
  await expect(nav.getByRole("link", { name: "Funds", exact: true })).toBeVisible();
  await nav.getByRole("link", { name: "Spending" }).click();
  await expect(priya.getByRole("heading", { level: 1, name: "Spending" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Spending" })).toHaveAttribute("aria-current", "page");

  // arriving straight on a finance page opens the group
  await priya.goto(`${ORG}/funds`);
  await expect(nav.getByRole("button", { name: "Finances" })).toHaveAttribute("aria-expanded", "true");
  // and with the keyboard it closes and opens again
  await nav.getByRole("button", { name: "Finances" }).focus();
  await priya.keyboard.press("Enter");
  await expect(nav.getByRole("link", { name: "Funds", exact: true })).toBeHidden();
  await priya.context().close();

  // an admin's Finances holds only Spending
  const marcus = await signIn(browser, "Marcus Chen");
  const hisNav = marcus.getByRole("navigation", { name: "Main" }).first();
  await hisNav.getByRole("button", { name: "Finances" }).click();
  await expect(hisNav.getByRole("link", { name: "Spending" })).toBeVisible();
  await expect(hisNav.getByRole("link", { name: "Funds", exact: true })).toHaveCount(0);
  await marcus.context().close();
});

test("Activity opens from the top bar, beside the notifications", async ({ browser }) => {
  const priya = await signIn(browser, "Priya Shah");
  const controls = priya.getByRole("toolbar", { name: "Your controls" });
  await controls.getByRole("button", { name: "Activity" }).click();
  const panel = priya.getByRole("dialog", { name: "Activity" });
  await expect(panel.getByRole("listitem").first()).toBeVisible();
  await expect(panel.getByText("Loading…")).toHaveCount(0);
  // Escape closes it and hands focus back
  await priya.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(controls.getByRole("button", { name: "Activity" })).toBeFocused();
  // the full log is a click away
  await controls.getByRole("button", { name: "Activity" }).click();
  await priya.getByRole("dialog", { name: "Activity" }).getByRole("link", { name: "See all activity" }).click();
  await expect(priya.getByRole("heading", { level: 1, name: "Activity" })).toBeVisible();
  // whose filters sit behind one button
  await expect(priya.getByLabel("Person")).toBeHidden();
  await priya.getByRole("button", { name: "Filters" }).click();
  await expect(priya.getByLabel("Person")).toBeVisible();
  await priya.keyboard.press("Escape");
  await expect(priya.getByLabel("Person")).toBeHidden();
  await priya.context().close();
});
