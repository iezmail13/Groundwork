import { test, expect, type Browser, type Page } from "@playwright/test";

// Finance (D108): anyone on a program submits spending with a receipt and
// sees only their own; owners and managers see budget against actual and
// decide; nobody approves their own; the approved list exports to CSV;
// Settings → Finance holds the link to the accounting software. Seeded
// Northside: Marcus is on Homework Club (paid for by the Fall community
// grant); Sofia isn't; Priya is a manager; Jordan owns the organization.

const ORG = "/northside-youth-collective";
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

test.describe.configure({ mode: "serial" });

async function signIn(browser: Browser, name: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/login");
  await page.getByRole("button", { name: `Sign in as ${name}` }).click();
  await page.waitForURL(/\/dashboard$/);
  await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
  return page;
}

async function spending(page: Page) {
  await page.goto(`${ORG}/spending`);
  await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
}

test("someone on a program submits spending with a receipt, and sees only their own", async ({ browser }) => {
  const marcus = await signIn(browser, "Marcus Chen");
  await spending(marcus);
  // staff never see budgets or totals
  await expect(marcus.getByRole("heading", { name: "Budget against actual" })).toHaveCount(0);
  await marcus.getByLabel("Program", { exact: true }).selectOption({ label: "Homework Club" });
  await expect(marcus.getByLabel("Fund")).toContainText("Fall community grant");
  await marcus.getByLabel("Amount").fill("0");
  await marcus.getByLabel("Category").fill("Supplies");
  await marcus.getByRole("button", { name: "Submit for approval" }).click();
  await expect(marcus.getByText("Enter an amount above zero, like 42.50.")).toBeVisible();
  await marcus.getByLabel("Amount").fill("42.50");
  await marcus.getByLabel("Note (optional)").fill("Pencils and graph paper");
  await marcus.locator('input[type="file"]').setInputFiles({ name: "receipt.png", mimeType: "image/png", buffer: PNG });
  await expect(marcus.getByText("receipt.png")).toBeVisible();
  await marcus.getByRole("button", { name: "Submit for approval" }).click();
  await expect(marcus.getByText("Submitted. It's waiting for approval.")).toBeVisible();
  const row = marcus.getByRole("table", { name: "Your spending, newest first" }).getByRole("row").filter({ hasText: "Pencils and graph paper" });
  await expect(row.getByText("Waiting")).toBeVisible();
  await expect(row.getByRole("button", { name: /^View the receipt/ })).toBeVisible();

  // Sofia, not on Homework Club, sees none of it
  const sofia = await signIn(browser, "Sofia Alvarez");
  await spending(sofia);
  await expect(sofia.getByText("Pencils and graph paper")).toHaveCount(0);
  await expect(sofia.getByLabel("Program", { exact: true }).locator("option", { hasText: "Homework Club" })).toHaveCount(0);
  for (const p of [marcus, sofia]) await p.context().close();
});

test("a manager sees budgets and decides, but never on their own spending", async ({ browser }) => {
  const priya = await signIn(browser, "Priya Shah");
  await spending(priya);
  const budget = priya.locator('[data-fund="Fall community grant"]');
  await expect(budget.getByText("On pace")).toBeVisible();
  await expect(budget.getByText("$42.50 waiting for approval")).toBeVisible();

  const waiting = priya.getByRole("table", { name: "Spending waiting for your decision" });
  await waiting.getByRole("textbox", { name: /^Note for Supplies/ }).fill("Thanks!");
  await waiting.getByRole("button", { name: /^Approve Supplies, \$42\.50/ }).click();
  await expect(budget.getByText("$42.50", { exact: true })).toBeVisible();
  await expect(priya.getByRole("table", { name: "All spending, newest first" }).getByRole("row").filter({ hasText: "Pencils" }).getByText("Approved")).toBeVisible();

  // her own entry never waits for her
  await priya.getByLabel("Program", { exact: true }).selectOption({ label: "Homework Club" });
  await priya.getByLabel("Amount").fill("18.00");
  await priya.getByLabel("Category").fill("Food");
  await priya.getByLabel("Note (optional)").fill("Juice boxes");
  await priya.getByRole("button", { name: "Submit for approval" }).click();
  await expect(priya.getByText("Submitted. It's waiting for approval.")).toBeVisible();
  await expect(priya.getByRole("table", { name: "Spending waiting for your decision" }).getByText("Juice boxes")).toHaveCount(0);

  // Jordan, who outranks her, decides it
  const jordan = await signIn(browser, "Jordan Ellis");
  await spending(jordan);
  await jordan
    .getByRole("table", { name: "Spending waiting for your decision" })
    .getByRole("button", { name: /^Reject Food, \$18\.00/ })
    .click();
  await expect(jordan.getByRole("table", { name: "All spending, newest first" }).getByRole("row").filter({ hasText: "Juice boxes" }).getByText("Rejected")).toBeVisible();

  // approved spending exports to CSV for a fund and dates
  const fund = await jordan.getByRole("combobox", { name: "Fund" }).last().inputValue();
  const csv = await (await jordan.request.get(`${ORG}/spending/export?fund=${fund}`)).text();
  expect(csv).toContain("Supplies");
  expect(csv).toContain("42.50");
  expect(csv).not.toContain("Juice boxes");
  for (const p of [priya, jordan]) await p.context().close();
});

test("staff can't export spending, and only owners set the accounting link", async ({ browser }) => {
  const marcus = await signIn(browser, "Marcus Chen");
  const res = await marcus.request.get(`${ORG}/spending/export?fund=00000000-0000-4000-8000-000000000000`);
  expect(res.status()).toBe(404);
  await marcus.context().close();

  const jordan = await signIn(browser, "Jordan Ellis");
  await jordan.goto(`${ORG}/settings?view=finance`);
  await jordan.getByLabel("Accounting software").selectOption("Xero");
  await jordan.getByLabel("Link").fill("http://example.org");
  await jordan.getByRole("button", { name: "Save" }).click();
  await expect(jordan.getByText("Use an https:// address.")).toBeVisible();
  await jordan.getByLabel("Link").fill("https://go.xero.com");
  await jordan.getByRole("button", { name: "Save" }).click();
  await expect(jordan.getByText("Saved.")).toBeVisible();
  await spending(jordan);
  await expect(jordan.getByRole("link", { name: /Open Xero/ })).toHaveAttribute("href", "https://go.xero.com");
  await jordan.context().close();
});
