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

// Calendar fixes (D118) ---------------------------------------------------------

/** Every time titled `title` across these months, in the agenda. */
async function countAcross(page: Page, months: string[], title: string) {
  let n = 0;
  for (const month of months) {
    await visit(page, `${ORG}/calendar?view=agenda&month=${month}`);
    n += await page.getByText(title, { exact: true }).count();
  }
  return n;
}

test("a repeating event has no end date, says who added it, and its later times move to other days", async ({ browser }) => {
  const priya = await signIn(browser, "Priya Shah");
  const title = `Monday club ${Date.now()}`;
  // the first Monday at least two weeks away, then four Mondays
  const first = new Date();
  first.setUTCDate(first.getUTCDate() + 14 + ((1 - first.getUTCDay() + 7) % 7));
  const day = (n: number) => iso(new Date(first.getTime() + n * 86_400_000));
  const months = [...new Set([0, 7, 14, 21, 28].map((n) => day(n).slice(0, 7)))];

  await visit(priya, `${ORG}/calendar`);
  await priya.getByRole("button", { name: /^New / }).click();
  const dialog = priya.getByRole("dialog", { name: /^New / });
  await dialog.getByLabel("Title").fill(title);
  await dialog.getByLabel("Date", { exact: true }).fill(day(0));
  await dialog.getByLabel("Starts").fill("16:00");
  await dialog.getByLabel("Ends").fill("17:00");
  // an end date reads like "repeat until", but would stretch every time into the next: it goes away
  await expect(dialog.getByLabel("End date")).toBeVisible();
  await dialog.getByLabel("Repeats weekly").check();
  await expect(dialog.getByLabel("End date")).toHaveCount(0);
  await expect(dialog.getByRole("checkbox", { name: "Monday" })).toBeChecked();
  await dialog.getByRole("spinbutton").fill("4");
  await expect(dialog.getByText(/^Every Monday for 4 weeks, 16:00–17:00: 4 times, the last on /)).toBeVisible();
  await dialog.getByRole("button", { name: /^Add / }).click();
  await expect(dialog).toBeHidden();
  expect(await countAcross(priya, months, title)).toBe(4);
  // each time sits on its own day: none runs into the days after it
  const firstMonth = day(0).slice(0, 7);
  await visit(priya, `${ORG}/calendar?month=${firstMonth}`);
  const timesThisMonth = [0, 7, 14, 21].filter((n) => day(n).startsWith(firstMonth)).length;
  await expect(priya.getByRole("cell").filter({ has: priya.getByRole("button", { name: new RegExp(title) }) })).toHaveCount(timesThisMonth);

  // from the second time on, it moves to Wednesdays for two weeks
  await visit(priya, `${ORG}/calendar?view=agenda&month=${day(7).slice(0, 7)}`);
  const before = [0].filter((n) => day(n).slice(0, 7) === day(7).slice(0, 7)).length;
  await priya.getByRole("button", { name: new RegExp(title) }).nth(before).click();
  const edit = priya.getByRole("dialog", { name: /^Edit / });
  await expect(edit.getByText("Added by Priya Shah")).toBeVisible();
  await edit.getByLabel(/^This and later times/).check();
  await expect(edit.getByText(/^Now: 3 times from this one, the last on /)).toBeVisible();
  await expect(edit.getByLabel("End date")).toHaveCount(0);
  // the day boxes are labels around visually hidden checkboxes
  await edit.locator("label").filter({ hasText: "Monday" }).click();
  await edit.locator("label").filter({ hasText: "Wednesday" }).click();
  await expect(edit.getByRole("checkbox", { name: "Monday" })).not.toBeChecked();
  await expect(edit.getByRole("checkbox", { name: "Wednesday" })).toBeChecked();
  await edit.getByRole("spinbutton").fill("2");
  await expect(edit.getByText(/^Every Wednesday for 2 weeks, 16:00–17:00: 2 times/)).toBeVisible();
  await edit.getByRole("button", { name: "Save changes" }).click();
  await expect(edit).toBeHidden();
  // the first Monday stays; the later Mondays became two Wednesdays
  expect(await countAcross(priya, months, title)).toBe(3);
  for (const [date, present] of [
    [day(0), true],
    [day(7), false],
    [day(9), true],
    [day(14), false],
    [day(16), true],
    [day(21), false],
  ] as const) {
    await visit(priya, `${ORG}/calendar?view=agenda&month=${date.slice(0, 7)}`);
    const heading = new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
    const row = priya.getByRole("listitem").filter({ has: priya.getByRole("heading", { name: new RegExp(`^(Today)?${heading}`) }) });
    await expect(row.getByText(title, { exact: true })).toHaveCount(present ? 1 : 0);
  }

  // clean up: the first time and its later ones
  await visit(priya, `${ORG}/calendar?view=agenda&month=${months[0]}`);
  await priya.getByRole("button", { name: new RegExp(title) }).first().click();
  await priya.getByRole("dialog", { name: /^Edit / }).getByRole("button", { name: "Delete" }).click();
  await priya.getByRole("dialog", { name: /^Edit / }).getByLabel("This time and every later time").check();
  await priya.getByRole("dialog", { name: /^Edit / }).getByRole("button", { name: "Delete permanently" }).click();
  expect(await countAcross(priya, months, title)).toBe(0);
  await priya.context().close();
});

test("several times are deleted at once, but only those the person may delete", async ({ browser }) => {
  const priya = await signIn(browser, "Priya Shah");
  const sofia = await signIn(browser, "Sofia Alvarez");
  const stamp = Date.now();
  const hers = `Sofia's catch-up ${stamp}`;
  const theirs = `Priya's planning ${stamp}`;
  // three Tuesdays in one month, well ahead
  const month = iso(new Date(Date.now() + 70 * 86_400_000)).slice(0, 7);
  const firstTuesday = [...Array(7).keys()].map((n) => `${month}-0${n + 1}`).find((d) => new Date(`${d}T12:00:00Z`).getUTCDay() === 2)!;

  const add = async (page: Page, title: string, date: string, weeks: number) => {
    await visit(page, `${ORG}/calendar?month=${month}`);
    await page.getByRole("button", { name: /^New / }).click();
    const dialog = page.getByRole("dialog", { name: /^New / });
    await dialog.getByLabel("Title").fill(title);
    await dialog.getByLabel("Date", { exact: true }).fill(date);
    if (weeks > 1) {
      await dialog.getByLabel("Repeats weekly").check();
      await dialog.getByRole("spinbutton").fill(String(weeks));
    }
    await dialog.getByRole("button", { name: /^Add / }).click();
    await expect(dialog).toBeHidden();
  };
  await add(sofia, hers, firstTuesday, 3);
  await add(priya, theirs, firstTuesday, 1);

  // in Select, Sofia can pick her own times; Priya's is locked to her. The
  // agenda lists every time, where a crowded day in the month grid shows "+N more".
  await visit(sofia, `${ORG}/calendar?view=agenda&month=${month}`);
  await sofia.getByRole("button", { name: "Select", exact: true }).click();
  const toolbar = sofia.getByRole("toolbar");
  await expect(toolbar.getByText(/^0 selected/)).toBeVisible();
  const locked = sofia.getByRole("button", { name: new RegExp(theirs) });
  await expect(locked).toHaveAttribute("aria-disabled", "true");
  await expect(locked).toHaveAccessibleName(/not yours to delete/);
  await expect(locked).not.toHaveAttribute("aria-pressed", /.*/);
  const mine = sofia.getByRole("button", { name: new RegExp(hers) });
  await expect(mine).toHaveCount(3);
  for (let i = 0; i < 3; i++) await mine.nth(i).click();
  await expect(mine.first()).toHaveAttribute("aria-pressed", "true");
  await expect(toolbar.getByText(/^3 selected/)).toBeVisible();
  await toolbar.getByRole("button", { name: "Delete selected" }).click();
  const confirm = sofia.getByRole("dialog", { name: /^Delete 3 / });
  await expect(confirm.getByText(new RegExp(`Delete all 3 times of ${hers}\\?`))).toBeVisible();
  await confirm.getByRole("button", { name: "Delete permanently" }).click();
  await expect(confirm.getByText("Deleted 3.")).toBeVisible();
  await confirm.getByRole("button", { name: "Close", exact: true }).click();
  await expect(sofia.getByText(hers)).toHaveCount(0);
  await expect(sofia.getByText(theirs)).toHaveCount(1);

  // Priya cleans up her own
  await visit(priya, `${ORG}/calendar?view=agenda&month=${month}`);
  await priya.getByRole("button", { name: "Select", exact: true }).click();
  await priya.getByRole("button", { name: new RegExp(theirs) }).click();
  await priya.getByRole("toolbar").getByRole("button", { name: "Delete selected" }).click();
  await priya.getByRole("dialog", { name: /^Delete 1 / }).getByRole("button", { name: "Delete permanently" }).click();
  await expect(priya.getByRole("dialog", { name: /^Delete 1 / }).getByText("Deleted 1.")).toBeVisible();
  for (const p of [priya, sofia]) await p.context().close();
});
