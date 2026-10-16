import { test, expect, type Browser, type Page } from "@playwright/test";

// Kanban workflows (D107): the people who run a program give its board its
// own steps; cards move between steps by dragging, the keyboard or the step
// menu; a done step finishes the work and leaving it reopens it; limits are
// marked, not enforced; staff on the program see the steps but can't change
// them. Seeded Northside: Marcus is an admin on Winter Coat Drive; Sofia is
// staff there.

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

async function openProgram(page: Page, name: string) {
  await page.goto(`${ORG}/projects`);
  await page.getByRole("link", { name }).first().click();
  await page.waitForURL(/\/projects\/[0-9a-f-]{36}$/);
  await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
}

const column = (page: Page, step: string) => page.locator(`section[data-step="${step}"]`);

test("a program's lead sets its steps from a template, and the board follows them", async ({ browser }) => {
  const marcus = await signIn(browser, "Marcus Chen");
  await openProgram(marcus, "Winter Coat Drive");
  const workflow = marcus.locator("#workflow");
  await workflow.getByRole("button", { name: /Intake and approval/ }).click();
  // rename one, give another a limit, and check the rules
  await workflow.getByLabel("Step 4 name").fill("Approved");
  await workflow.getByLabel("Step 2 limit").fill("1");
  await workflow.getByLabel("Step 4 kind").selectOption("open");
  await workflow.getByRole("button", { name: "Save steps" }).click();
  await expect(workflow.getByText("Keep at least one open step and one done step.")).toBeVisible();
  await workflow.getByLabel("Step 4 kind").selectOption("done");
  await workflow.getByRole("button", { name: "Save steps" }).click();
  await expect(workflow.getByText("Steps saved.")).toBeVisible();

  // the program's board now has those columns, in order
  await workflow.getByRole("link", { name: "Open the board" }).click();
  await expect(marcus).toHaveURL(/\/tasks\?project=/);
  const names = await marcus.locator("section[data-step]").evaluateAll((els) => els.map((e) => e.getAttribute("data-step")));
  expect(names).toEqual(["Intake", "Being reviewed", "Waiting on approval", "Approved"]);
  // open work starts in Intake; finished work sits in Approved
  await expect(column(marcus, "Intake").getByRole("link", { name: "Plan the distribution day layout" })).toBeVisible();
  await expect(column(marcus, "Approved").getByRole("link", { name: "Design the coat drive flyer" })).toBeVisible();
  await marcus.context().close();
});

test("cards move between steps; a done step finishes the work and leaving it reopens it", async ({ browser }) => {
  const marcus = await signIn(browser, "Marcus Chen");
  await openProgram(marcus, "Winter Coat Drive");
  await marcus.locator("#workflow").getByRole("link", { name: "Open the board" }).click();
  await marcus.locator("html[data-hydrated]").waitFor({ state: "attached" });

  // with the step menu
  await column(marcus, "Intake").getByLabel("Step for “Plan the distribution day layout”").selectOption({ label: "Being reviewed" });
  await expect(column(marcus, "Being reviewed").getByRole("link", { name: "Plan the distribution day layout" })).toBeVisible();
  await marcus.reload();
  await expect(column(marcus, "Being reviewed").getByRole("link", { name: "Plan the distribution day layout" })).toBeVisible();

  // a second card over the limit of 1 marks the column, without blocking it
  await column(marcus, "Intake").getByLabel("Step for “Build the size and inventory spreadsheet”").selectOption({ label: "Being reviewed" });
  await expect(column(marcus, "Being reviewed").getByText("Over its limit of 1")).toBeVisible();
  await expect(column(marcus, "Being reviewed").getByRole("heading")).toContainText("2 / 1");

  // with the keyboard: pick up, move right, drop
  const handle = column(marcus, "Being reviewed").getByRole("button", { name: "Move “Build the size and inventory spreadsheet”" });
  await handle.focus();
  await marcus.keyboard.press("Space");
  await marcus.keyboard.press("ArrowRight");
  await marcus.keyboard.press("Space");
  await expect(column(marcus, "Waiting on approval").getByRole("link", { name: "Build the size and inventory spreadsheet" })).toBeVisible();

  // into the done step: the work is finished
  await column(marcus, "Being reviewed").getByLabel("Step for “Plan the distribution day layout”").selectOption({ label: "Approved" });
  await expect(column(marcus, "Approved").getByRole("link", { name: "Plan the distribution day layout" })).toBeVisible();
  await marcus.goto(`${ORG}/tasks?view=list&status=done`);
  await expect(marcus.getByRole("link", { name: "Plan the distribution day layout" })).toBeVisible();

  // reopening it elsewhere puts it back on the last open step
  await marcus.getByRole("checkbox", { name: "Done: Plan the distribution day layout" }).click();
  await openProgram(marcus, "Winter Coat Drive");
  await marcus.locator("#workflow").getByRole("link", { name: "Open the board" }).click();
  await expect(column(marcus, "Waiting on approval").getByRole("link", { name: "Plan the distribution day layout" })).toBeVisible();
  await marcus.context().close();
});

test("staff on the program see its steps but can't change them, and can't move others' cards", async ({ browser }) => {
  const sofia = await signIn(browser, "Sofia Alvarez");
  await openProgram(sofia, "Winter Coat Drive");
  const workflow = sofia.locator("#workflow");
  await expect(workflow.getByText("Intake → Being reviewed → Waiting on approval → Approved")).toBeVisible();
  await expect(workflow.getByRole("button", { name: "Save steps" })).toHaveCount(0);
  await workflow.getByRole("link", { name: "Open the board" }).click();
  await sofia.locator("html[data-hydrated]").waitFor({ state: "attached" });
  // a card that isn't hers (Marcus's van booking) won't move
  await column(sofia, "Intake").getByLabel("Step for “Book the van for collection days”").selectOption({ label: "Being reviewed" });
  await expect(sofia.getByRole("status").filter({ hasText: "Only the people on it, or someone who can edit it, can move it." })).toBeAttached();
  await sofia.reload();
  await expect(column(sofia, "Intake").getByRole("link", { name: "Book the van for collection days" })).toBeVisible();
  // but her own does
  await column(sofia, "Intake").getByLabel("Step for “Recruit sorting-day volunteers”").selectOption({ label: "Being reviewed" });
  await expect(column(sofia, "Being reviewed").getByRole("link", { name: "Recruit sorting-day volunteers" })).toBeVisible();
  await sofia.context().close();
});

test("going back to the standard board keeps every card's status", async ({ browser }) => {
  const marcus = await signIn(browser, "Marcus Chen");
  await openProgram(marcus, "Winter Coat Drive");
  marcus.once("dialog", (d) => d.accept());
  await marcus.locator("#workflow").getByRole("button", { name: "Use the standard board" }).click();
  await expect(marcus.locator("#workflow").getByText("This board uses the standard columns again.")).toBeVisible();
  await marcus.goto(`${ORG}/tasks`);
  await expect(marcus.locator("section[data-step]")).toHaveCount(0);
  await expect(marcus.locator('section[data-column="in_progress"]').getByRole("link", { name: "Recruit sorting-day volunteers" })).toBeVisible();
  await marcus.context().close();
});
