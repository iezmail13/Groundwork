import { test, expect, type Browser, type Page } from "@playwright/test";

// Part 6 (D103): a finished task notifies its creator and the program's lead
// but not whoever finished it; muting a kind of notification stops it; the
// activity log filters by person, program, change and date; and only owners
// can export it. Seeded Northside: Jordan owns it, Priya leads Teen Mentorship
// Circle, Marcus (admin) and Sofia (staff) are on it.

const ORG = "/northside-youth-collective";
const stamp = Date.now().toString(36);

test.describe.configure({ mode: "serial" });

async function signIn(browser: Browser, name: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/login");
  await page.getByRole("button", { name: `Sign in as ${name}` }).click();
  await page.waitForURL(/\/dashboard$/);
  return page;
}

async function visit(page: Page, path: string) {
  await page.goto(path);
  await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
}

async function appoint(page: Page, title: string, person: string) {
  await visit(page, `${ORG}/tasks/new`);
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page.getByRole("radio", { name: "Appointed" }).check();
  await page.getByLabel("Program", { exact: true }).selectOption({ label: "Teen Mentorship Circle" });
  await page.getByRole("group", { name: "People on it" }).getByRole("checkbox", { name: person, exact: true }).check();
  await page.getByRole("button", { name: "Create task" }).click();
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
}

const bell = (page: Page) => page.getByRole("button", { name: /^Notifications/ });

async function openBell(page: Page) {
  await bell(page).click();
  const panel = page.getByRole("dialog", { name: "Notifications" });
  await expect(panel).toBeVisible();
  await expect(panel.getByText("Loading…")).toHaveCount(0);
  return panel;
}

test("finishing a task tells its creator and the program's lead, not whoever finished it", async ({ browser }) => {
  const title = `Print the mentor badges ${stamp}`;
  const marcus = await signIn(browser, "Marcus Chen");
  await appoint(marcus, title, "Sofia Alvarez");

  // Sofia is told she was given it, and finishes it
  const sofia = await signIn(browser, "Sofia Alvarez");
  await visit(sofia, `${ORG}/tasks`);
  const panel = await openBell(sofia);
  const given = panel.getByRole("link", { name: new RegExp(`Marcus Chen gave you “${title}”`) });
  await expect(given).toBeVisible();
  await given.click();
  await sofia.waitForURL(/\/tasks\/[0-9a-f-]{36}$/);
  await sofia.getByRole("checkbox", { name: `Done: ${title}` }).click();
  await expect(sofia.getByRole("status").filter({ hasText: `“${title}” is done.` })).toBeVisible();

  // the creator and the lead hear about it
  for (const [page, who] of [[marcus, "Marcus"], [await signIn(browser, "Priya Shah"), "Priya"]] as const) {
    await visit(page, `${ORG}/dashboard`);
    await expect(bell(page)).toHaveAccessibleName(/unread/);
    const list = await openBell(page);
    await expect(list.getByRole("link", { name: new RegExp(`Sofia Alvarez finished “${title}”`) }), who).toBeVisible();
    // Mark all read clears the count
    await list.getByRole("button", { name: "Mark all read" }).click();
    await expect(bell(page)).toHaveAccessibleName("Notifications");
    await page.context().close();
  }

  // whoever finished it isn't told about their own action
  await visit(sofia, `${ORG}/notifications`);
  await expect(sofia.getByText(new RegExp(`finished “${title}”`))).toHaveCount(0);
  await sofia.context().close();
});

test("muting a kind of notification stops it, and turning it back on resumes it", async ({ browser }) => {
  const sofia = await signIn(browser, "Sofia Alvarez");
  await visit(sofia, `${ORG}/settings?view=notifications`);
  const choice = sofia.getByRole("checkbox", { name: "Someone gives you a task" });
  await expect(choice).toBeChecked();
  await choice.uncheck();
  await sofia.getByRole("button", { name: "Save" }).click();
  await expect(sofia.getByText("Saved.")).toBeVisible();

  const muted = `Collect the permission slips ${stamp}`;
  const marcus = await signIn(browser, "Marcus Chen");
  await appoint(marcus, muted, "Sofia Alvarez");
  await visit(sofia, `${ORG}/notifications`);
  await expect(sofia.getByText(new RegExp(`gave you “${muted}”`))).toHaveCount(0);

  await visit(sofia, `${ORG}/settings?view=notifications`);
  await expect(choice).not.toBeChecked();
  await choice.check();
  await sofia.getByRole("button", { name: "Save" }).click();
  await expect(sofia.getByText("Saved.")).toBeVisible();
  const heard = `Book the bus for career night ${stamp}`;
  await appoint(marcus, heard, "Sofia Alvarez");
  await visit(sofia, `${ORG}/notifications`);
  await expect(sofia.getByRole("link", { name: new RegExp(`Marcus Chen gave you “${heard}”`) })).toBeVisible();
  for (const p of [sofia, marcus]) await p.context().close();
});

test("the activity log filters by person, program, change and date", async ({ browser }) => {
  const jordan = await signIn(browser, "Jordan Ellis");
  await visit(jordan, `${ORG}/activity`);
  const table = jordan.getByRole("table", { name: "Activity, newest first" });
  await expect(table).toBeVisible();
  // Recent activity is no longer on the dashboard
  await visit(jordan, `${ORG}/dashboard`);
  await expect(jordan.getByRole("heading", { name: "Recent activity" })).toHaveCount(0);

  await visit(jordan, `${ORG}/activity`);
  await jordan.getByLabel("Person").selectOption({ label: "Sofia Alvarez" });
  await jordan.getByRole("button", { name: "Apply" }).click();
  await expect(jordan).toHaveURL(/person=/);
  const who = await table.locator("tbody tr td:nth-child(2)").allInnerTexts();
  expect(who.length).toBeGreaterThan(0);
  expect(new Set(who)).toEqual(new Set(["Sofia Alvarez"]));

  // finish something, then find it by person and kind of change
  const finished = `Renew the first-aid kit ${stamp}`;
  await visit(jordan, `${ORG}/tasks/new`);
  await jordan.getByLabel("Title", { exact: true }).fill(finished);
  await jordan.getByRole("radio", { name: "Personal" }).check();
  await jordan.getByRole("button", { name: "Create task" }).click();
  await jordan.getByRole("checkbox", { name: new RegExp(`${finished}`) }).first().click();
  await expect(jordan.getByRole("status").filter({ hasText: `“${finished}” is done.` })).toBeVisible();
  await visit(jordan, `${ORG}/activity`);
  await jordan.getByLabel("Person").selectOption({ label: "Jordan Ellis" });
  await jordan.getByLabel("Change").selectOption({ label: "Finished" });
  await jordan.getByRole("button", { name: "Apply" }).click();
  await expect(table.getByRole("link", { name: finished })).toBeVisible();
  const what = await table.locator("tbody tr td:nth-child(3)").allInnerTexts();
  expect(what.every((w) => w.startsWith("completed"))).toBe(true);

  await visit(jordan, `${ORG}/activity`);
  await jordan.getByLabel("Program", { exact: true }).selectOption({ label: "Winter Coat Drive" });
  await jordan.getByRole("button", { name: "Apply" }).click();
  const where = await table.locator("tbody tr td:nth-child(4)").allInnerTexts();
  expect(where.length).toBeGreaterThan(0);
  expect(where.every((w) => w.includes("Winter Coat Drive"))).toBe(true);

  const tomorrow = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  await visit(jordan, `${ORG}/activity?from=${tomorrow}`);
  await expect(jordan.getByText("Nothing matches these filters.")).toBeVisible();
  await jordan.context().close();
});

test("only owners can export the activity log", async ({ browser }) => {
  const jordan = await signIn(browser, "Jordan Ellis");
  await visit(jordan, `${ORG}/activity`);
  const exportLink = jordan.getByRole("link", { name: "Export CSV" });
  await expect(exportLink).toBeVisible();
  const csv = await jordan.request.get(`${ORG}/activity/export`);
  expect(csv.status()).toBe(200);
  expect(csv.headers()["content-type"]).toContain("text/csv");
  expect((await csv.text()).split("\r\n")[0]).toBe("When (UTC),When (local),Who,What,Kind,Change,Item,Program");

  const priya = await signIn(browser, "Priya Shah");
  await visit(priya, `${ORG}/activity`);
  await expect(priya.getByRole("link", { name: "Export CSV" })).toHaveCount(0);
  expect((await priya.request.get(`${ORG}/activity/export`)).status()).toBe(404);
  for (const p of [jordan, priya]) await p.context().close();
});
