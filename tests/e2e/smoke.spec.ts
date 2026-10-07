import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

// End-to-end smoke test of the main flows against a running app and the local
// Supabase stack. Sign-in goes through a real magic link, fetched from the
// local mail catcher (Mailpit).

const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";

async function magicLinkFor(request: APIRequestContext, email: string): Promise<string> {
  for (let attempt = 0; attempt < 40; attempt++) {
    const search = await request.get(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`);
    const body = (await search.json()) as { messages?: { ID: string }[] };
    const id = body.messages?.[0]?.ID;
    if (id) {
      const message = (await (await request.get(`${MAILPIT}/api/v1/message/${id}`)).json()) as { HTML: string };
      const href = /href="([^"]+)"/.exec(message.HTML)?.[1];
      if (href) return href.replace(/&amp;/g, "&");
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No magic-link email arrived for ${email}`);
}

async function signInWithMagicLink(page: Page, request: APIRequestContext, email: string) {
  await page.goto("/login");
  await page.getByLabel("Work email").fill(email);
  await page.getByRole("button", { name: /sign-in link/i }).click();
  await expect(page.getByText(`Check ${email} for a sign-in link`)).toBeVisible();
  await page.goto(await magicLinkFor(request, email));
}

/** Full-page navigation inside an organization, then wait until React has hydrated. */
async function visit(page: Page, path: string) {
  await page.goto(path);
  await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
}

async function widgetOrder(page: Page): Promise<string[]> {
  return page.locator("li[data-widget]").evaluateAll((els) => els.map((el) => el.getAttribute("data-widget") ?? ""));
}

test.describe.configure({ mode: "serial" });

test("main flows: sign in, project, task, move, event, document, preset, dashboard layout", async ({ page, request }) => {
  const stamp = Date.now();
  const email = `e2e-${stamp}@example.org`;
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  // 1. Sign in with a magic link, then create an organization.
  await signInWithMagicLink(page, request, email);
  await expect(page).toHaveURL(/\/create-organization$/);
  await page.getByLabel("Your name").fill("Erin Tester");
  await page.getByLabel("Organization name").fill(`E2E Org ${stamp}`);
  await page.getByRole("radio", { name: /Business/ }).check();
  await page.getByRole("button", { name: "Create organization" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
  await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
  const base = new URL(page.url()).pathname.replace(/\/dashboard$/, "");

  // 2. Create a project.
  await page.getByRole("navigation", { name: "Main" }).first().getByRole("link", { name: "Projects" }).click();
  await expect(page).toHaveURL(new RegExp(`${base}/projects$`));
  await page.getByRole("button", { name: "New project" }).first().click();
  const dialog = page.getByRole("dialog", { name: "New project" });
  await dialog.getByLabel("Name").fill("Launch plan");
  await dialog.getByLabel("Description").fill("Everything we need for the October launch.");
  await dialog.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Launch plan");

  // 3. Add a task with the inline quick-add.
  await page.getByLabel("New task title").fill("Draft the launch checklist");
  await page.getByRole("button", { name: "Add task" }).click();
  await expect(page.getByRole("link", { name: "Draft the launch checklist" })).toBeVisible();

  // 4. Move the task on the board: keyboard drag (Space, arrow, Space), then the move button.
  await visit(page, `${base}/tasks`);
  const handle = page.getByRole("button", { name: "Drag “Draft the launch checklist”" });
  await expect(handle).toBeVisible();
  // wait on dnd-kit's screen-reader announcements between keys, as a keyboard user would
  const announcer = page.locator("[aria-live]");
  await handle.focus();
  await page.keyboard.press("Space");
  await expect(handle).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("ArrowRight");
  await expect(announcer.filter({ hasText: "is over In progress" })).toHaveCount(1);
  await page.keyboard.press("Space");
  const inProgress = page.locator('section[data-column="in_progress"]');
  await expect(inProgress.getByRole("link", { name: "Draft the launch checklist" })).toBeVisible();
  await page.reload();
  await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
  await expect(inProgress.getByRole("link", { name: "Draft the launch checklist" })).toBeVisible();
  await page.getByRole("button", { name: "Move “Draft the launch checklist” to Done" }).click();
  const done = page.locator('section[data-column="done"]');
  await expect(done.getByRole("link", { name: "Draft the launch checklist" })).toBeVisible();
  await page.reload();
  await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
  await expect(done.getByRole("link", { name: "Draft the launch checklist" })).toBeVisible();

  // 5. Add an event from the calendar.
  await visit(page, `${base}/calendar`);
  await page.getByRole("button", { name: "New meeting" }).click();
  const eventDialog = page.getByRole("dialog", { name: "New meeting" });
  await eventDialog.getByLabel("Title").fill("Launch kickoff");
  await eventDialog.getByLabel("Starts").fill("10:00");
  await eventDialog.getByLabel("Ends").fill("11:00");
  await eventDialog.getByLabel("Location").fill("Boardroom");
  await eventDialog.getByRole("button", { name: "Add meeting" }).click();
  await expect(eventDialog).toBeHidden();
  await expect(page.getByRole("button", { name: /Launch kickoff/ })).toBeVisible();
  await visit(page, `${base}/calendar?view=agenda`);
  await expect(page.getByText("Launch kickoff")).toBeVisible();

  // 6. Upload a document, then find it by tag and by name.
  await visit(page, `${base}/documents`);
  await page.getByRole("button", { name: "Upload a document" }).first().click();
  const upload = page.getByRole("dialog", { name: "Upload a document" });
  await upload.getByLabel("File").setInputFiles({
    name: "launch-checklist.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("step,owner\nbook venue,erin\nsend invites,erin\n"),
  });
  await upload.getByLabel("Tags").fill("Launch, Checklists");
  await upload.getByRole("button", { name: "Upload" }).click();
  await expect(upload).toBeHidden();
  const docLink = page.getByRole("link", { name: "launch-checklist.csv" }).first();
  await expect(docLink).toBeVisible();
  await page.getByLabel("Search by name or tag").fill("checklists");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page).toHaveURL(/q=checklists/);
  await expect(docLink).toBeVisible();
  await page.getByLabel("Search by name or tag").fill("launch-check");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(docLink).toBeVisible();
  // downloading goes through a short-lived signed URL that serves the file
  const href = await docLink.getAttribute("href");
  const redirect = await page.request.get(href!, { maxRedirects: 0 });
  expect(redirect.status()).toBe(303);
  expect(redirect.headers().location).toContain("/storage/v1/object/sign/documents/");
  expect(await (await page.request.get(redirect.headers().location!)).text()).toContain("book venue");
  await page.getByLabel("Search by name or tag").fill("nonexistent-zebra");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.getByText("No documents match")).toBeVisible();

  // 7. Switch the preset and watch the whole UI relabel.
  await visit(page, `${base}/settings`);
  await page.getByRole("radio", { name: /Tutoring/ }).check();
  await page.getByRole("button", { name: "Apply preset" }).click();
  await expect(page.getByText("Preset applied")).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Main" }).first();
  await expect(nav.getByRole("link", { name: "Subjects" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Materials" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Tutors" })).toBeVisible();

  // 8. Reorder a dashboard widget with the keyboard, reload, and confirm it persisted.
  await visit(page, `${base}/dashboard`);
  await expect(page.getByRole("heading", { name: "Upcoming lessons" })).toBeVisible();
  const before = await widgetOrder(page);
  expect(before.slice(0, 2)).toEqual(["overdue", "due_soon"]);
  await page.getByRole("button", { name: "Customize" }).click();
  const moveHandle = page.getByRole("button", { name: "Move Overdue" });
  await moveHandle.focus();
  await page.keyboard.press("Space");
  await expect(moveHandle).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("[aria-live]").filter({ hasText: "Overdue is over position 2" })).toHaveCount(1);
  await page.keyboard.press("Space");
  await expect(page.getByRole("status").filter({ hasText: "Layout saved." })).toBeVisible();
  const after = await widgetOrder(page);
  expect(after.slice(0, 2)).toEqual(["due_soon", "overdue"]);
  // resize and hide too, so persistence covers every kind of change
  await page.getByRole("radio", { name: "Large" }).first().check({ force: true });
  await page.getByRole("button", { name: "Hide Recent activity" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Layout saved." })).toBeVisible();
  await page.getByRole("button", { name: "Done" }).click();
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
  expect(await widgetOrder(page)).toEqual(after.filter((id) => id !== "recent_activity"));
  await expect(page.locator('li[data-widget="due_soon"]')).toHaveClass(/xl:col-span-12/);
  await expect(page.getByRole("heading", { name: "Recent activity" })).toHaveCount(0);

  expect(pageErrors).toEqual([]);
});

test("seeded demo: dev sign-in shortcut, reminders and private layouts", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Sign in as Priya Shah" }).click();
  await expect(page).toHaveURL(/\/northside-youth-collective\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Reminders" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Upcoming sessions" })).toBeVisible();
  const overdue = page.locator('li[data-widget="overdue"]');
  await expect(overdue.getByText(/past due/)).toBeVisible();
  await expect(overdue.locator(".sr-only").first()).toHaveText(/^[1-9]\d*$/);
  const nav = page.getByRole("navigation", { name: "Main" }).first();
  await expect(nav.getByRole("link", { name: "Programs" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recent programs" })).toBeVisible();
});

test("reduced motion disables animation", async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByRole("button", { name: "Sign in as Marcus Chen" }).click();
  await expect(page).toHaveURL(/dashboard$/);
  const animation = await page
    .locator("li[data-widget]")
    .first()
    .evaluate((el) => getComputedStyle(el).animationName);
  expect(animation).toBe("none");
  const swing = await page.locator(".logo-briefcase").first().evaluate((el) => getComputedStyle(el).animationName);
  expect(swing).toBe("none");
  await context.close();
});
