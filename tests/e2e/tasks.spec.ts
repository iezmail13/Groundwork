import { test, expect, type Browser, type Page } from "@playwright/test";

// Part 4 (D100, D101): claiming and its limit, appointed people locked on,
// several assignees with "any" and "all", hiding and sharing, personal and
// org-level work, ticking done with Undo, and priority. Each test makes its
// own tasks in the seeded Northside organization (Jordan owner, Priya
// manager, Marcus admin, Sofia staff).

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

type NewTask = {
  title: string;
  kind?: "Open to claim" | "Appointed" | "Personal";
  program?: string;
  priority?: "Critical" | "High" | "Medium" | "Low";
  people?: string[];
  claimLimit?: number;
  everyone?: boolean;
  hidden?: boolean;
  share?: string[];
};

async function createTask(page: Page, task: NewTask) {
  await visit(page, `${ORG}/tasks/new`);
  await page.getByLabel("Title", { exact: true }).fill(task.title);
  if (task.kind) await page.getByRole("radio", { name: task.kind }).check();
  if (task.program !== undefined) await page.getByLabel("Program", { exact: true }).selectOption({ label: task.program });
  if (task.priority) await page.getByLabel("Priority", { exact: true }).selectOption({ label: task.priority });
  const people = page.getByRole("group", { name: "People on it" });
  for (const person of task.people ?? []) await people.getByRole("checkbox", { name: person, exact: true }).check();
  if (task.claimLimit) await page.getByLabel("Claim limit", { exact: true }).fill(String(task.claimLimit));
  if (task.everyone) await page.getByRole("radio", { name: "When everyone has ticked their part" }).check();
  if (task.hidden) await page.getByRole("checkbox", { name: /Hide from other collaborators/ }).check();
  if (task.share?.length) {
    await page.getByText("Share with specific people").click();
    for (const person of task.share) await page.locator("details").getByRole("checkbox", { name: person, exact: true }).check();
  }
  await page.getByRole("button", { name: "Create task" }).click();
  await expect(page.getByRole("heading", { level: 1, name: task.title })).toBeVisible();
  return page.url();
}

const board = (page: Page, column: "todo" | "in_progress" | "done") => page.locator(`section[data-column="${column}"]`);

test("claim and unclaim, up to the claim limit", async ({ browser }) => {
  const title = `Count the donated coats ${stamp}`;
  const priya = await signIn(browser, "Priya Shah");
  await createTask(priya, { title, kind: "Open to claim", program: "Winter Coat Drive", claimLimit: 1 });

  const sofia = await signIn(browser, "Sofia Alvarez");
  await visit(sofia, `${ORG}/tasks`);
  await board(sofia, "todo").getByRole("button", { name: `Claim ${title} (0 of 1 taken)` }).click();
  await expect(board(sofia, "in_progress").getByRole("link", { name: title })).toBeVisible();

  // the one spot is taken, so Marcus can't claim it
  const marcus = await signIn(browser, "Marcus Chen");
  await visit(marcus, `${ORG}/tasks`);
  await expect(board(marcus, "in_progress").getByRole("link", { name: title })).toBeVisible();
  await expect(marcus.getByRole("button", { name: new RegExp(`^Claim ${title}`) })).toHaveCount(0);

  // Sofia lets it go: it's back in To do, and Marcus can take it
  await board(sofia, "in_progress").getByRole("button", { name: `Unclaim ${title}` }).click();
  await expect(board(sofia, "todo").getByRole("link", { name: title })).toBeVisible();
  await marcus.reload();
  await board(marcus, "todo").getByRole("button", { name: `Claim ${title} (0 of 1 taken)` }).click();
  await expect(board(marcus, "in_progress").getByRole("link", { name: title })).toBeVisible();
  for (const p of [priya, sofia, marcus]) await p.context().close();
});

test("appointed people are locked on; several assignees finish with any or all", async ({ browser }) => {
  const all = `Sort the coats by size ${stamp}`;
  const any = `Pick up the bins ${stamp}`;
  const priya = await signIn(browser, "Priya Shah");
  await createTask(priya, { title: all, kind: "Appointed", program: "Winter Coat Drive", people: ["Marcus Chen", "Sofia Alvarez"], everyone: true });
  await expect(priya.getByText("On it: Marcus Chen, Sofia Alvarez (0 of 2 done)")).toBeVisible();
  await createTask(priya, { title: any, kind: "Appointed", program: "Winter Coat Drive", people: ["Marcus Chen", "Sofia Alvarez"] });

  // Sofia was appointed: there's no way for her to take herself off
  const sofia = await signIn(browser, "Sofia Alvarez");
  await visit(sofia, `${ORG}/tasks`);
  await expect(board(sofia, "in_progress").getByRole("link", { name: all })).toBeVisible();
  await expect(sofia.getByRole("button", { name: `Unclaim ${all}` })).toHaveCount(0);

  // "all": her tick finishes only her part
  await sofia.getByRole("checkbox", { name: `My part of ${all} (0 of 2 done)` }).click();
  await expect(sofia.getByRole("status").filter({ hasText: `Your part of “${all}” is done.` })).toBeVisible();
  await expect(board(sofia, "in_progress").getByText("1 of 2 done")).toBeVisible();
  const marcus = await signIn(browser, "Marcus Chen");
  await visit(marcus, `${ORG}/tasks`);
  await marcus.getByRole("checkbox", { name: `My part of ${all} (1 of 2 done)` }).click();
  await expect(board(marcus, "in_progress").getByRole("link", { name: all })).toHaveCount(0);
  await visit(marcus, `${ORG}/tasks?status=done`);
  await expect(board(marcus, "done").getByRole("link", { name: all })).toBeVisible();

  // "any": one tick finishes it for everyone
  await visit(sofia, `${ORG}/tasks`);
  await sofia.getByRole("checkbox", { name: `Done: ${any}` }).click();
  await expect(board(sofia, "in_progress").getByRole("link", { name: any })).toHaveCount(0);
  await visit(marcus, `${ORG}/tasks`);
  await expect(marcus.getByRole("link", { name: any })).toHaveCount(0);
  for (const p of [priya, sofia, marcus]) await p.context().close();
});

test("hiding a task, then sharing it with someone", async ({ browser }) => {
  const title = `Check a family's address ${stamp}`;
  const priya = await signIn(browser, "Priya Shah");
  const url = await createTask(priya, { title, kind: "Open to claim", program: "Winter Coat Drive", hidden: true });
  await expect(priya.getByText("Hidden from other collaborators")).toBeVisible();

  // Sofia is on Winter Coat Drive, but it's hidden from her
  const sofia = await signIn(browser, "Sofia Alvarez");
  await visit(sofia, `${ORG}/tasks?view=list`);
  await expect(sofia.getByRole("link", { name: title })).toHaveCount(0);
  await visit(sofia, url);
  await expect(sofia.getByRole("heading", { level: 1, name: "Not found" })).toBeVisible();

  // Priya shares it with her
  await visit(priya, url);
  await priya.getByText("Share with specific people").click();
  await priya.locator("details").getByRole("checkbox", { name: "Sofia Alvarez", exact: true }).check();
  await priya.getByRole("button", { name: "Save changes" }).click();
  await expect(priya.getByText("Saved.")).toBeVisible();
  await visit(sofia, `${ORG}/tasks?view=list`);
  await expect(sofia.getByRole("link", { name: title })).toBeVisible();
  for (const p of [priya, sofia]) await p.context().close();
});

test("personal work: hidden from people ranked lower, visible to people ranked higher", async ({ browser }) => {
  const title = `Prepare my admin handover ${stamp}`;
  const marcus = await signIn(browser, "Marcus Chen");
  await createTask(marcus, { title, kind: "Personal", program: "No program" });
  // it's his own work, so he's on it and it's in progress
  await visit(marcus, `${ORG}/tasks`);
  await expect(board(marcus, "in_progress").getByRole("link", { name: title })).toBeVisible();

  const sofia = await signIn(browser, "Sofia Alvarez");
  await visit(sofia, `${ORG}/tasks?view=list`);
  await expect(sofia.getByRole("link", { name: title })).toHaveCount(0);
  const priya = await signIn(browser, "Priya Shah");
  await visit(priya, `${ORG}/tasks?view=list`);
  await expect(priya.getByRole("link", { name: title })).toBeVisible();
  for (const p of [marcus, sofia, priya]) await p.context().close();
});

test("an org-level task sits outside any program and anyone can claim it", async ({ browser }) => {
  const title = `Update the emergency contact sheet ${stamp}`;
  const priya = await signIn(browser, "Priya Shah");
  await createTask(priya, { title, kind: "Open to claim", program: "No program", priority: "High" });

  const sofia = await signIn(browser, "Sofia Alvarez");
  await visit(sofia, `${ORG}/tasks`);
  const card = board(sofia, "todo").locator("li").filter({ hasText: title });
  await expect(card.getByText("No program")).toBeVisible();
  await card.getByRole("button", { name: `Claim ${title}` }).click();
  await expect(board(sofia, "in_progress").getByRole("link", { name: title })).toBeVisible();

  // staff can't put shared work outside a program themselves
  await visit(sofia, `${ORG}/tasks/new`);
  await sofia.getByLabel("Program", { exact: true }).selectOption({ label: "No program" });
  await expect(sofia.getByText(/Only people who manage the organization can put shared work outside a program/)).toBeVisible();
  await expect(sofia.getByRole("button", { name: "Create task" })).toBeDisabled();
  for (const p of [priya, sofia]) await p.context().close();
});

test("ticking a task done in the list hides it, and Undo brings it back", async ({ browser }) => {
  const title = `Return the borrowed tables ${stamp}`;
  const priya = await signIn(browser, "Priya Shah");
  await createTask(priya, { title, kind: "Appointed", program: "Homework Club", people: ["Priya Shah (you)"] });
  await visit(priya, `${ORG}/tasks?view=list`);
  await priya.getByRole("checkbox", { name: `Done: ${title}` }).click();
  const toast = priya.getByRole("status").filter({ hasText: `“${title}” is done.` });
  await expect(toast).toBeVisible();
  await expect(priya.getByRole("link", { name: title })).toHaveCount(0);
  await toast.getByRole("button", { name: "Undo" }).click();
  await expect(priya.getByRole("link", { name: title })).toBeVisible();
  await expect(priya.getByRole("checkbox", { name: `Done: ${title}` })).toHaveAttribute("aria-checked", "false");
  await priya.context().close();
});

test("filtering and sorting by priority", async ({ browser }) => {
  const priya = await signIn(browser, "Priya Shah");
  await visit(priya, `${ORG}/tasks`);
  await priya.getByRole("button", { name: /^Filters/ }).click();
  await priya.getByLabel("Priority", { exact: true }).selectOption({ label: "Critical" });
  await expect(priya).toHaveURL(/priority=critical/);
  await expect(priya.getByRole("link", { name: "Review volunteer police checks" })).toBeVisible();
  await expect(priya.getByRole("link", { name: "Restock snack cupboard" })).toHaveCount(0);
  const flags = await priya.locator("li[data-task-id] [data-priority]").evaluateAll((els) => els.map((el) => el.getAttribute("data-priority")));
  expect(flags.length).toBeGreaterThan(0);
  expect(new Set(flags)).toEqual(new Set(["critical"]));

  // the board can put the most urgent first
  await visit(priya, `${ORG}/tasks?order=priority`);
  const order = await board(priya, "in_progress")
    .locator("li[data-task-id] [data-priority]")
    .evaluateAll((els) => els.map((el) => el.getAttribute("data-priority")));
  const rank: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  const ranks = order.map((p) => rank[p ?? ""] ?? 99);
  expect(ranks).toEqual([...ranks].sort((a, b) => a - b));

  // and the list sorts by its Priority column
  await visit(priya, `${ORG}/tasks?view=list`);
  await priya.getByRole("link", { name: /^Priority/ }).click();
  await expect(priya).toHaveURL(/sort=priority/);
  await expect(priya.locator("tbody tr").first().locator("[data-priority]")).toHaveAttribute("data-priority", "critical");
  await priya.context().close();
});
