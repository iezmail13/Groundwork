import { test, expect, type Browser, type Page } from "@playwright/test";

// Part 8 (D105): dashboards are read-only summaries; a chart mark opens the
// editable view for someone who can act there and a read-only "View details"
// panel for someone who can't; people who oversee others switch scope; and a
// change in a program refreshes the dashboards of people on it, live, while
// someone who can't see it gets nothing. Seeded Northside: Priya leads
// Homework Club, Marcus is staff there and admin on Winter Coat Drive, Sofia
// isn't on Homework Club, Jordan owns the organization.

const ORG = "/northside-youth-collective";

test.describe.configure({ mode: "serial" });

async function signIn(browser: Browser, name: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/login");
  await page.getByRole("button", { name: `Sign in as ${name}` }).click();
  await page.waitForURL(/\/dashboard$/);
  await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
  return page;
}

const progress = (page: Page, program: string) =>
  page.locator('li[data-widget="progress"]').getByRole("link", { name: new RegExp(`^${program}: `) });

test("dashboards are read-only summaries", async ({ browser }) => {
  const sofia = await signIn(browser, "Sofia Alvarez");
  await expect(sofia.locator('li[data-widget="tasks"] figure')).toBeVisible();
  await expect(sofia.getByRole("checkbox")).toHaveCount(0);
  await expect(sofia.getByPlaceholder(/Add a task/)).toHaveCount(0);
  // every chart mark is a labelled link
  const marks = sofia.locator("main [data-mark]");
  expect(await marks.count()).toBeGreaterThan(5);
  for (const label of await marks.evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") ?? ""))) {
    expect(label).toMatch(/, (open|view details)/);
  }
  // staff don't oversee anyone, so there's no scope switch or workload
  await expect(sofia.getByRole("navigation", { name: "Whose work" })).toHaveCount(0);
  await expect(sofia.locator('li[data-widget="workload"]')).toHaveCount(0);
  await sofia.context().close();
});

test("a chart mark opens the editable view for an editor and a read-only panel for a viewer", async ({ browser }) => {
  // Priya leads Homework Club: its progress bar opens the program
  const priya = await signIn(browser, "Priya Shah");
  const editor = progress(priya, "Homework Club");
  await expect(editor).toHaveAccessibleName(/open the program$/);
  await editor.click();
  await expect(priya).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
  await expect(priya.getByRole("heading", { level: 2, name: "At a glance" })).toBeVisible();

  // Marcus is staff there: the same bar opens a read-only panel instead
  const marcus = await signIn(browser, "Marcus Chen");
  const viewer = progress(marcus, "Homework Club");
  await expect(viewer).toHaveAccessibleName(/view details$/);
  await viewer.click();
  await expect(marcus).toHaveURL(/detail=progress/);
  const panel = marcus.locator("#details");
  await expect(panel.getByRole("heading", { name: /^View details: Homework Club/ })).toBeVisible();
  await expect(panel.getByRole("link", { name: "Restock snack cupboard" })).toBeVisible();
  await expect(panel.getByRole("button")).toHaveCount(0);
  await panel.getByRole("link", { name: "Close details" }).click();
  await expect(marcus.locator("#details")).toHaveCount(0);
  // but on Winter Coat Drive, where he's an admin, it opens the program
  await expect(progress(marcus, "Winter Coat Drive")).toHaveAccessibleName(/open the program$/);
  for (const p of [priya, marcus]) await p.context().close();
});

test("people who oversee others switch between their own work and everything they oversee", async ({ browser }) => {
  const priya = await signIn(browser, "Priya Shah");
  const scope = priya.getByRole("navigation", { name: "Whose work" });
  await expect(scope.getByRole("link", { name: "Mine" })).toHaveAttribute("aria-current", "page");
  const mine = Number(await priya.locator('li[data-widget="tasks"] .text-3xl').first().innerText());
  await scope.getByRole("link", { name: "Everything I oversee" }).click();
  await expect(priya).toHaveURL(/scope=all/);
  await expect(scope.getByRole("link", { name: "Everything I oversee" })).toHaveAttribute("aria-current", "page");
  const all = Number(await priya.locator('li[data-widget="tasks"] .text-3xl').first().innerText());
  expect(all).toBeGreaterThan(mine);
  // a manager also sees the workload of people ranked below her
  await expect(priya.locator('li[data-widget="workload"]').getByRole("link", { name: /^Sofia Alvarez: \d+ open/ })).toBeVisible();
  await expect(priya.locator('li[data-widget="workload"]').getByRole("link", { name: /^Jordan Ellis/ })).toHaveCount(0);
  await priya.context().close();
});

test("attendance marks must stay in order", async ({ browser }) => {
  const jordan = await signIn(browser, "Jordan Ellis");
  await jordan.goto(`${ORG}/settings?view=organization`);
  await jordan.getByLabel("Low mark").fill("85");
  await jordan.getByLabel("High mark").fill("80");
  await jordan.getByRole("button", { name: "Save" }).click();
  await expect(jordan.getByText("Make the high mark above the low one.").first()).toBeVisible();
  await jordan.context().close();
});

test("a change refreshes dashboards live for people on the program, and not for anyone else", async ({ browser }) => {
  const priya = await signIn(browser, "Priya Shah");
  const sofia = await signIn(browser, "Sofia Alvarez");
  const before = await progress(priya, "Homework Club").getAttribute("aria-label");
  const sofiaBefore = await sofia.locator("main").innerText();
  // give both a moment to join their channels
  await priya.waitForTimeout(2000);

  // Jordan finishes a Homework Club task in another browser
  const jordan = await signIn(browser, "Jordan Ellis");
  await jordan.goto(`${ORG}/tasks?view=list`);
  await jordan.locator("html[data-hydrated]").waitFor({ state: "attached" });
  await jordan.getByRole("checkbox", { name: "Done: Send progress notes to families" }).click();
  await expect(jordan.getByRole("status").filter({ hasText: "is done." })).toBeVisible();

  // Priya's dashboard updates without a reload
  await expect.poll(() => progress(priya, "Homework Club").getAttribute("aria-label"), { timeout: 20_000 }).not.toBe(before);
  await expect(priya.locator("[data-live-refreshes]")).not.toHaveAttribute("data-live-refreshes", "0");

  // Sofia isn't on Homework Club: no signal reaches her, and nothing changes
  await sofia.waitForTimeout(3000);
  await expect(sofia.locator("[data-live-refreshes]")).toHaveAttribute("data-live-refreshes", "0");
  expect(await sofia.locator("main").innerText()).toBe(sofiaBefore);
  for (const p of [priya, sofia, jordan]) await p.context().close();
});
