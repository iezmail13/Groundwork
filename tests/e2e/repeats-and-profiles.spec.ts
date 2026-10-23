import { test, expect, type Browser, type Page } from "@playwright/test";

// The owner's review (D112): an event can repeat on chosen weekdays for a
// number of weeks, each time its own event in one series that can be deleted
// together; and the people on a program open a profile card right there.
// Seeded Northside: Priya leads Homework Club; Marcus is an admin on it.

const ORG = "/northside-youth-collective";

async function signIn(browser: Browser, name: string): Promise<Page> {
  const page = await (await browser.newContext({ timezoneId: "America/Toronto" })).newPage();
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

const iso = (d: Date) => d.toISOString().slice(0, 10);

test("an event repeats every Friday for 5 weeks, 4 to 6, and later times are deleted together", async ({ browser }) => {
  const priya = await signIn(browser, "Priya Shah");
  const title = `Friday club ${Date.now()}`;
  // the first Friday at least a week away
  const first = new Date();
  first.setUTCDate(first.getUTCDate() + 7 + ((5 - first.getUTCDay() + 7) % 7));
  const months = [...new Set(Array.from({ length: 5 }, (_, i) => iso(new Date(first.getTime() + i * 7 * 86_400_000)).slice(0, 7)))];

  await visit(priya, `${ORG}/calendar`);
  await priya.getByRole("button", { name: /^New / }).click();
  const dialog = priya.getByRole("dialog", { name: /^New / });
  await dialog.getByLabel("Title").fill(title);
  await dialog.getByLabel("Date", { exact: true }).fill(iso(first));
  await dialog.getByLabel("Starts").fill("16:00");
  await dialog.getByLabel("Ends").fill("18:00");
  await dialog.getByLabel("Repeats weekly").check();
  // the start date's weekday is picked already
  await expect(dialog.getByRole("checkbox", { name: "Friday" })).toBeChecked();
  await dialog.getByRole("spinbutton").fill("5");
  await expect(dialog.getByText(/^Every Friday for 5 weeks, 16:00–18:00: 5 times/)).toBeVisible();
  await dialog.getByRole("button", { name: /^Add / }).click();
  await expect(dialog).toBeHidden();

  // five separate times, across the months they fall in
  let seen = 0;
  for (const month of months) {
    await visit(priya, `${ORG}/calendar?view=agenda&month=${month}`);
    seen += await priya.getByText(title, { exact: true }).count();
  }
  expect(seen).toBe(5);

  // one time is edited on its own; deleting from the third time takes it and the later ones,
  // and the earlier times (and any attendance taken at them) stay
  const dates = Array.from({ length: 5 }, (_, i) => iso(new Date(first.getTime() + i * 7 * 86_400_000)));
  const third = dates[2]!;
  await visit(priya, `${ORG}/calendar?view=agenda&month=${third.slice(0, 7)}`);
  const before = dates.filter((d) => d.startsWith(third.slice(0, 7)) && d < third).length;
  await priya.getByRole("button", { name: new RegExp(title) }).nth(before).click();
  const edit = priya.getByRole("dialog", { name: /^Edit / });
  await expect(edit.getByText(/one time of a repeating/)).toBeVisible();
  await edit.getByRole("button", { name: "Delete" }).click();
  await expect(edit.getByText(/Earlier times, and the .* taken at them, stay/)).toBeVisible();
  await edit.getByLabel("This time and every later time").check();
  await edit.getByRole("button", { name: "Delete permanently" }).click();
  await expect(edit).toBeHidden();
  let left = 0;
  for (const month of months) {
    await visit(priya, `${ORG}/calendar?view=agenda&month=${month}`);
    left += await priya.getByText(title, { exact: true }).count();
  }
  expect(left).toBe(2);

  // from the first time, the rest go
  await visit(priya, `${ORG}/calendar?view=agenda&month=${months[0]}`);
  await priya.getByRole("button", { name: new RegExp(title) }).first().click();
  await priya.getByRole("dialog", { name: /^Edit / }).getByRole("button", { name: "Delete" }).click();
  await priya.getByRole("dialog", { name: /^Edit / }).getByLabel("This time and every later time").check();
  await priya.getByRole("dialog", { name: /^Edit / }).getByRole("button", { name: "Delete permanently" }).click();
  await expect(priya.getByRole("dialog", { name: /^Edit / })).toBeHidden();
  for (const month of months) {
    await visit(priya, `${ORG}/calendar?view=agenda&month=${month}`);
    await expect(priya.getByText(title, { exact: true })).toHaveCount(0);
  }
  await priya.context().close();
});

test("the people on a program open a profile card where they're listed", async ({ browser }) => {
  const priya = await signIn(browser, "Priya Shah");
  await visit(priya, `${ORG}/projects`);
  await priya.getByRole("main").getByRole("link", { name: "Homework Club" }).first().click();
  await priya.locator("html[data-hydrated]").waitFor({ state: "attached" });
  const people = priya.locator('section[aria-labelledby="project-people"]');
  await people.getByRole("button", { name: /^Marcus Chen/ }).click();
  const card = priya.getByRole("dialog", { name: "Marcus Chen" });
  await expect(card.getByText(/^Role here:/)).toBeVisible();
  await expect(card.getByRole("link", { name: "marcus@northside.example.org" })).toHaveAttribute("href", "mailto:marcus@northside.example.org");
  await expect(card.getByRole("button", { name: "Message Marcus" })).toBeVisible();
  // Escape closes it and returns focus to the name
  await priya.keyboard.press("Escape");
  await expect(card).toHaveCount(0);
  await expect(people.getByRole("button", { name: /^Marcus Chen/ })).toBeFocused();
  // and the full profile is a click away
  await people.getByRole("button", { name: /^Marcus Chen/ }).click();
  await priya.getByRole("dialog", { name: "Marcus Chen" }).getByRole("link", { name: "Full profile" }).click();
  await expect(priya.getByRole("heading", { level: 1, name: "Marcus Chen" })).toBeVisible();
  await priya.context().close();
});
