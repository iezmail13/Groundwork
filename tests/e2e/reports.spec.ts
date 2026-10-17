import { test, expect, type Browser, type Page } from "@playwright/test";

// Reports (D109): templated reports hold only what their author can see;
// they print to PDF, download as CSV, and share as a read-only link that
// expires and can be revoked; attendance is never shared by link; costs are
// for owners and managers; report activity is in the activity log. Seeded
// Northside: Priya leads Homework Club and is a manager; Sofia isn't on
// Homework Club; Jordan owns the organization.

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

async function showReport(page: Page, report: string, program = "All you can see") {
  await page.goto(`${ORG}/reports`);
  const form = page.getByRole("form", { name: "Report settings" });
  await form.getByLabel("Report").selectOption({ label: report });
  await form.getByLabel("Program").selectOption({ label: program });
  await form.getByRole("button", { name: "Show report" }).click();
  await page.waitForURL(/template=/);
  await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
}

test("a progress report holds only what its author can see, and downloads as CSV", async ({ browser }) => {
  const priya = await signIn(browser, "Priya Shah");
  await showReport(priya, "Task progress", "Homework Club");
  const report = priya.locator("article.report");
  await expect(report.getByRole("heading", { name: "Task progress" })).toBeVisible();
  await expect(report.getByText(/^Homework Club, \d{4}-\d{2}-\d{2} to/)).toBeVisible();
  const overdue = report.getByRole("table", { name: /^Overdue tasks/ });
  await expect(overdue.getByRole("rowheader", { name: "Review volunteer police checks" })).toBeVisible();
  await expect(overdue.getByText("Needs attention").first()).toBeVisible();
  await expect(priya.getByRole("button", { name: "Print or save as PDF" })).toBeVisible();

  const csvHref = await priya.getByRole("link", { name: "Download CSV" }).getAttribute("href");
  const csv = await (await priya.request.get(csvHref!)).text();
  expect(csv).toContain("Task progress");
  expect(csv).toContain("Review volunteer police checks");

  // Sofia isn't on Homework Club: its work isn't in her report
  const sofia = await signIn(browser, "Sofia Alvarez");
  await showReport(sofia, "Task progress");
  await expect(sofia.locator("article.report").getByText("Review volunteer police checks")).toHaveCount(0);
  await expect(sofia.locator("article.report").getByRole("heading", { name: "At a glance" })).toBeVisible();
  // and costs aren't hers to see
  await expect(sofia.getByLabel("Report").locator("option", { hasText: "Costs against budget" })).toHaveCount(0);
  for (const p of [priya, sofia]) await p.context().close();
});

test("a share link shows a read-only snapshot until it's revoked", async ({ browser }) => {
  const priya = await signIn(browser, "Priya Shah");
  await showReport(priya, "People and workload", "Homework Club");
  await expect(priya.locator("article.report").getByRole("heading", { name: "Workload by person" })).toBeVisible();
  await priya.getByLabel("Link lasts").selectOption({ label: "7 days" });
  await priya.getByRole("button", { name: "Create share link" }).click();
  const url = await priya.getByLabel(/Your link/).inputValue();
  expect(url).toMatch(/\/r\/[0-9a-f]{64}$/);

  // someone outside Groundwork opens it
  const outsider = await (await browser.newContext()).newPage();
  await outsider.goto(new URL(url).pathname);
  await expect(outsider.getByRole("heading", { name: "People and workload" })).toBeVisible();
  await expect(outsider.getByText(/^Shared by Priya Shah from Northside Youth Collective/)).toBeVisible();
  await expect(outsider.getByRole("link", { name: "Groundwork home" })).toBeVisible();
  // nothing in it leads into the organization
  expect(await outsider.locator('a[href*="/northside-youth-collective"]').count()).toBe(0);

  // revoking it closes it at once
  await priya.reload();
  await priya.getByRole("button", { name: /^Revoke the link for People and workload/ }).first().click();
  await expect(priya.getByRole("row").filter({ hasText: "People and workload" }).first().getByText("Revoked")).toBeVisible();
  await outsider.reload();
  await expect(outsider.getByRole("heading", { name: "People and workload" })).toHaveCount(0);
  for (const p of [priya, outsider]) await p.context().close();
});

test("costs reports are for owners and managers; attendance reports are never shared", async ({ browser }) => {
  const priya = await signIn(browser, "Priya Shah");
  await showReport(priya, "Costs against budget");
  const budget = priya.locator("article.report").getByRole("table", { name: "Each fund's total, approved spending and status" });
  await expect(budget.getByRole("row").filter({ hasText: "Winter coat donations" }).getByText("Needs attention")).toBeVisible();

  await showReport(priya, "Attendance", "Homework Club");
  await expect(priya.locator("article.report").getByRole("heading", { name: "Each participant" })).toBeVisible();
  await expect(priya.getByRole("button", { name: "Create share link" })).toHaveCount(0);
  await expect(priya.getByText(/reports hold personal details, so they can be printed or downloaded but not shared by link/)).toBeVisible();
  await priya.context().close();

  // the owner sees the report activity
  const jordan = await signIn(browser, "Jordan Ellis");
  await jordan.goto(`${ORG}/activity`);
  const log = jordan.getByRole("table", { name: "Activity, newest first" });
  await expect(log.getByText("shared a report by link").first()).toBeVisible();
  await expect(log.getByText("revoked a report link").first()).toBeVisible();
  await expect(log.getByText("downloaded a report as CSV").first()).toBeVisible();
  await jordan.context().close();
});
