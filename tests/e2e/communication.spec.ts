import { test, expect, type Browser, type Page } from "@playwright/test";

// Communication (D106): chat in a side panel (program channels, the
// organization channel, direct messages), typing, edit and delete, mentions,
// muting; comments on work; discussion boards; and notifications when work
// changes. Seeded Northside: Priya leads Homework Club, Marcus is on it,
// Sofia isn't, Jordan owns the organization.

const ORG = "/northside-youth-collective";

test.describe.configure({ mode: "serial" });

async function signIn(browser: Browser, name: string, viewport?: { width: number; height: number }): Promise<Page> {
  const page = await (await browser.newContext(viewport ? { viewport } : {})).newPage();
  await page.goto("/login");
  await page.getByRole("button", { name: `Sign in as ${name}` }).click();
  await page.waitForURL(/\/dashboard$/);
  await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
  return page;
}

const panel = (page: Page) => page.locator("[data-chat-panel]");

async function openChat(page: Page) {
  await page.getByRole("toolbar", { name: "Your controls" }).getByRole("button", { name: /^Chat/ }).click();
  await expect(panel(page).getByRole("heading", { name: "Chat" })).toBeVisible();
}

async function openConversation(page: Page, title: string) {
  await panel(page).getByRole("button", { name: new RegExp(`^#?\\s*${title}`) }).first().click();
  await expect(panel(page).getByRole("log", { name: `Messages in ${title}` })).toBeVisible();
}

test("program channels follow program membership; history and the panel work", async ({ browser }) => {
  const priya = await signIn(browser, "Priya Shah");
  await openChat(priya);
  await expect(panel(priya).getByRole("button", { name: /Homework Club/ })).toBeVisible();
  await openConversation(priya, "Homework Club");
  const log = panel(priya).getByRole("log", { name: "Messages in Homework Club" });
  await expect(log.getByText("Room 104 is booked through November.")).toBeVisible();
  // a mention shows as a link to the person's profile
  await expect(log.getByRole("link", { name: "@Priya Shah" })).toHaveAttribute("href", /\/members\//);

  // Sofia isn't on Homework Club: no channel for her
  const sofia = await signIn(browser, "Sofia Alvarez");
  await openChat(sofia);
  await expect(panel(sofia).getByRole("button", { name: "Everyone" })).toBeVisible();
  await expect(panel(sofia).getByRole("button", { name: /Homework Club/ })).toHaveCount(0);

  // the panel resizes from its handle, with the keyboard too, and remembers the width
  const handle = panel(priya).getByRole("separator", { name: "Resize chat" });
  const before = Number(await handle.getAttribute("aria-valuenow"));
  await handle.focus();
  await priya.keyboard.press("ArrowLeft");
  await expect(handle).toHaveAttribute("aria-valuenow", String(before + 32));
  expect(await priya.evaluate(() => localStorage.getItem("groundwork:chat-width"))).toBe(String(before + 32));
  // Escape closes it
  await priya.keyboard.press("Escape");
  await expect(panel(priya)).toHaveCount(0);
  for (const p of [priya, sofia]) await p.context().close();
});

test("messages arrive live, with typing, edits, deletes and a mention that notifies", async ({ browser }) => {
  const priya = await signIn(browser, "Priya Shah");
  const marcus = await signIn(browser, "Marcus Chen");
  await openChat(priya);
  await openConversation(priya, "Homework Club");
  await openChat(marcus);
  await openConversation(marcus, "Homework Club");
  await marcus.waitForTimeout(1500);

  // typing shows for the other person
  const box = panel(priya).getByRole("combobox", { name: "Message #Homework Club" });
  await box.pressSequentially("Thanks ");
  await expect(panel(marcus).locator("[data-typing]")).toHaveText("Priya is typing…");
  // the mention picker offers people who can see the channel
  await box.pressSequentially("@Mar");
  const option = panel(priya).getByRole("option", { name: /Marcus Chen/ });
  await expect(option).toBeVisible();
  await box.press("Enter");
  await box.pressSequentially("for the snacks!");
  await box.press("Enter");

  // it arrives for Marcus without a reload, mention and all
  const theirs = panel(marcus).getByRole("log", { name: "Messages in Homework Club" });
  await expect(theirs.getByText("for the snacks!")).toBeVisible({ timeout: 15_000 });
  await expect(theirs.getByRole("link", { name: "@Marcus Chen" })).toBeVisible();
  // and the typing line clears a few seconds later
  await expect(panel(marcus).locator("[data-typing]")).toHaveText("", { timeout: 10_000 });

  // the mention notifies him
  await marcus.reload();
  await marcus.getByRole("toolbar", { name: "Your controls" }).getByRole("button", { name: /^Notifications/ }).click();
  await expect(marcus.getByText("Priya Shah mentioned you in #Homework Club.")).toBeVisible();

  // Priya edits, then deletes
  const mine = panel(priya).getByRole("log", { name: "Messages in Homework Club" }).locator("li").filter({ hasText: "for the snacks!" });
  await mine.getByRole("button", { name: /^Edit/ }).click();
  const edit = panel(priya).getByRole("combobox", { name: "Edit your message" });
  await edit.fill("Thanks for the snacks, team!");
  await edit.press("Enter");
  const edited = panel(priya).getByRole("log").locator("li").filter({ hasText: "Thanks for the snacks, team!" });
  await expect(edited.getByText("(edited)")).toBeVisible();
  priya.once("dialog", (d) => d.accept());
  await edited.getByRole("button", { name: /^Delete/ }).click();
  await expect(panel(priya).getByRole("log").getByText("message deleted")).toBeVisible();
  await expect(panel(marcus).getByRole("log").getByText("message deleted")).toBeVisible({ timeout: 15_000 });
  for (const p of [priya, marcus]) await p.context().close();
});

test("direct messages are private to their two people, even from an owner", async ({ browser }) => {
  const priya = await signIn(browser, "Priya Shah");
  await openChat(priya);
  await openConversation(priya, "Marcus Chen");
  await expect(panel(priya).getByText("Yes, Tuesday works for me.")).toBeVisible();

  // Jordan owns the organization but can't see their conversation
  const jordan = await signIn(browser, "Jordan Ellis");
  await openChat(jordan);
  await expect(panel(jordan).locator('[data-channel="direct"]')).toHaveCount(0);
  // owners do see every program's channel
  await expect(panel(jordan).getByRole("button", { name: /Homework Club/ })).toBeVisible();

  // a direct message from a profile
  await jordan.goto(`${ORG}/settings?view=members`);
  await jordan.getByRole("link", { name: "Sofia Alvarez" }).first().click();
  await jordan.getByRole("button", { name: "Message Sofia" }).click();
  await expect(panel(jordan).getByRole("log", { name: "Messages in Sofia Alvarez" })).toBeVisible();
  const box = panel(jordan).getByRole("combobox", { name: "Message Sofia Alvarez" });
  await box.fill("Can we talk budgets on Friday?");
  await box.press("Enter");
  await expect(panel(jordan).getByRole("log").getByText("Can we talk budgets on Friday?")).toBeVisible();

  // Sofia gets a notification that opens the panel on it, and the chat badge counts it
  const sofia = await signIn(browser, "Sofia Alvarez");
  await expect(sofia.getByRole("toolbar", { name: "Your controls" }).getByRole("button", { name: /^Chat, \d+ unread/ })).toBeVisible();
  await sofia.goto(`${ORG}/notifications`);
  await sofia.getByRole("link", { name: /Jordan Ellis sent you a message/ }).click();
  await expect(panel(sofia).getByRole("log", { name: "Messages in Jordan Ellis" }).getByText("Can we talk budgets on Friday?")).toBeVisible();
  for (const p of [priya, jordan, sofia]) await p.context().close();
});

test("muting a conversation stops its notifications but keeps its unread count", async ({ browser }) => {
  const sofia = await signIn(browser, "Sofia Alvarez");
  await openChat(sofia);
  await openConversation(sofia, "Everyone");
  const mute = panel(sofia).getByRole("button", { name: "Mute" });
  await mute.click();
  await expect(panel(sofia).getByRole("button", { name: "Muted" })).toHaveAttribute("aria-pressed", "true");
  await sofia.keyboard.press("Escape");
  await sofia.goto(`${ORG}/notifications`);
  const before = await sofia.getByRole("link", { name: /in #Everyone/ }).count();

  const jordan = await signIn(browser, "Jordan Ellis");
  await openChat(jordan);
  await openConversation(jordan, "Everyone");
  const box = panel(jordan).getByRole("combobox", { name: "Message #Everyone" });
  await box.fill("Reminder: timesheets are due Monday.");
  await box.press("Enter");
  await expect(panel(jordan).getByRole("log").getByText("Reminder: timesheets are due Monday.")).toBeVisible();

  await sofia.reload();
  expect(await sofia.getByRole("link", { name: /in #Everyone/ }).count()).toBe(before);
  await openChat(sofia);
  const row = panel(sofia).getByRole("button", { name: /^#\s*Everyone/ });
  await expect(row.getByText("Muted")).toBeAttached();
  await expect(row).toContainText(/\d+ unread/);
  for (const p of [sofia, jordan]) await p.context().close();
});

test("comments on work notify its people; changes to it notify them too", async ({ browser }) => {
  const marcus = await signIn(browser, "Marcus Chen");
  await marcus.goto(`${ORG}/tasks?view=list`);
  await marcus.getByRole("link", { name: "Restock snack cupboard" }).first().click();
  const comments = marcus.locator("#comments");
  await expect(comments.getByText("Granola bars and apples went fastest last month.")).toBeVisible();
  const box = comments.getByRole("combobox", { name: "Add a comment" });
  await box.fill("Bought everything, receipts are in the folder.");
  await comments.getByRole("button", { name: "Post" }).click();
  await expect(comments.getByText("Bought everything, receipts are in the folder.")).toBeVisible();
  const taskUrl = marcus.url();

  // Priya made the task, so she hears about the comment
  const priya = await signIn(browser, "Priya Shah");
  await priya.goto(`${ORG}/notifications`);
  await expect(priya.getByRole("link", { name: "Marcus Chen commented on “Restock snack cupboard”." })).toBeVisible();

  // Priya changes its due date; Marcus, on it, hears about that
  await priya.goto(taskUrl);
  await priya.locator("html[data-hydrated]").waitFor({ state: "attached" });
  await priya.getByLabel("Due date").fill("2026-12-01");
  await priya.getByRole("button", { name: /^Save/ }).click();
  await expect(priya.getByRole("status").filter({ hasText: /saved/i }).first()).toBeVisible();
  await marcus.goto(`${ORG}/notifications`);
  await expect(marcus.getByRole("link", { name: "Priya Shah changed the due date of “Restock snack cupboard”." })).toBeVisible();

  // Sofia can't see the task, so she can't read its comments either
  const sofia = await signIn(browser, "Sofia Alvarez");
  const response = await sofia.goto(taskUrl);
  expect(response?.status()).toBe(404);
  for (const p of [marcus, priya, sofia]) await p.context().close();
});

test("discussion boards: a program's threads are for its people", async ({ browser }) => {
  const marcus = await signIn(browser, "Marcus Chen");
  await marcus.goto(`${ORG}/discussions`);
  await marcus.getByRole("link", { name: "Ideas for the winter term" }).click();
  await expect(marcus.getByRole("heading", { level: 1, name: "Ideas for the winter term" })).toBeVisible();
  await marcus.getByRole("combobox", { name: "Add a reply" }).fill("Chess could be the spring activity.");
  await marcus.getByRole("button", { name: "Post" }).click();
  await expect(marcus.getByText("Chess could be the spring activity.")).toBeVisible();

  // a new thread on the organization's board
  await marcus.goto(`${ORG}/discussions`);
  await marcus.getByText("Start a discussion").click();
  await marcus.getByLabel("Where").selectOption({ label: "Everyone in the organization" });
  await marcus.getByLabel("Title").fill("Carpool for the coat drive");
  await marcus.getByLabel("What's it about?").fill("Who can drive on Saturday?");
  await marcus.getByRole("button", { name: "Post discussion" }).click();
  await expect(marcus.getByRole("heading", { level: 1, name: "Carpool for the coat drive" })).toBeVisible();

  // Priya started the winter thread: Marcus's reply notifies her
  const priya = await signIn(browser, "Priya Shah");
  await priya.goto(`${ORG}/notifications`);
  await expect(priya.getByRole("link", { name: "Marcus Chen posted in “Ideas for the winter term”." })).toBeVisible();

  // Sofia, off Homework Club, sees the organization's thread but not the program's
  const sofia = await signIn(browser, "Sofia Alvarez");
  await sofia.goto(`${ORG}/discussions`);
  await expect(sofia.getByRole("link", { name: "Carpool for the coat drive" })).toBeVisible();
  await expect(sofia.getByRole("link", { name: "Ideas for the winter term" })).toHaveCount(0);
  for (const p of [marcus, priya, sofia]) await p.context().close();
});

test("on a phone the chat panel is full screen", async ({ browser }) => {
  const priya = await signIn(browser, "Priya Shah", { width: 390, height: 844 });
  await priya.getByRole("button", { name: /^Chat/ }).first().click();
  const box = await panel(priya).boundingBox();
  expect(box?.width).toBe(390);
  expect(box?.height).toBe(844);
  await expect(panel(priya).getByRole("separator", { name: "Resize chat" })).toBeHidden();
  await priya.context().close();
});
