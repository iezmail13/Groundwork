import { readFileSync } from "node:fs";
import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

// End-to-end smoke test of the main flows against a running app and the local
// Supabase stack. Sign-in goes through a real magic link, fetched from the
// local mail catcher (Mailpit).

const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";

/** A setting from the environment, or from the .env.local the dev server reads. */
function setting(name: string): string {
  if (process.env[name]) return process.env[name]!;
  const line = readFileSync(".env.local", "utf8")
    .split("\n")
    .find((l) => l.startsWith(`${name}=`));
  if (!line) throw new Error(`${name} is not set`);
  return line.slice(name.length + 1).trim();
}

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
  await finishSignIn(page, await magicLinkFor(request, email));
}

/** Opens an emailed link: it lands on /auth/confirm, and nothing happens until the button is pressed. */
async function finishSignIn(page: Page, link: string) {
  expect(new URL(link).pathname).toBe("/auth/confirm");
  await page.goto(link);
  await expect(page.getByRole("heading", { name: "Finish signing in" })).toBeVisible();
  await page.getByRole("button", { name: "Continue to Groundwork" }).click();
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
  // a server-side validation error keeps everything that was typed
  await dialog.getByLabel("Start date").fill("2026-10-10");
  await dialog.getByLabel("End date").fill("2026-10-01");
  await dialog.getByRole("button", { name: "Create project" }).click();
  await expect(dialog.getByText("The end date must be on or after the start date.")).toBeVisible();
  await expect(dialog.getByLabel("Name")).toHaveValue("Launch plan");
  await expect(dialog.getByLabel("Description")).toHaveValue("Everything we need for the October launch.");
  await dialog.getByLabel("End date").fill("2026-10-31");
  await dialog.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Launch plan");

  // 3. Add a task with the inline quick-add.
  await page.getByLabel("New task title").fill("Draft the launch checklist");
  await page.getByLabel("Due date").fill("2026-11-02");
  await page.getByRole("button", { name: "Add task" }).click();
  await expect(page.getByRole("link", { name: "Draft the launch checklist" })).toBeVisible();
  // quick-add starts fresh, so the next task doesn't inherit this one's due date
  await expect(page.getByLabel("New task title")).toHaveValue("");
  await expect(page.getByLabel("Due date")).toHaveValue("");

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
  // open the task and edit it on its own page
  await done.getByRole("link", { name: "Draft the launch checklist" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Draft the launch checklist" })).toBeVisible();
  await page.getByLabel("Title").fill("Finalize the launch checklist");
  await page.getByLabel("Status").selectOption("in_progress");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Finalize the launch checklist" })).toBeVisible();

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
  // open it again from the grid and edit it
  await page.getByRole("button", { name: /Launch kickoff/ }).click();
  const editDialog = page.getByRole("dialog", { name: "Edit meeting" });
  await expect(editDialog.getByLabel("Title")).toHaveValue("Launch kickoff");
  await expect(editDialog.getByLabel("Starts")).toHaveValue("10:00");
  await editDialog.getByLabel("Location").fill("Room 2");
  await editDialog.getByRole("button", { name: "Save changes" }).click();
  await expect(editDialog).toBeHidden();
  await visit(page, `${base}/calendar?view=agenda`);
  await expect(page.getByText("Launch kickoff")).toBeVisible();
  await expect(page.getByText("Room 2")).toBeVisible();

  // 6. Upload a document, then find it by tag and by name.
  await visit(page, `${base}/documents`);
  await page.getByRole("button", { name: "Upload a document" }).first().click();
  const upload = page.getByRole("dialog", { name: "Upload a document" });
  await upload.getByLabel("File").setInputFiles({
    name: "launch-checklist.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("step,owner\nbook venue,erin\nsend invites,erin\n"),
  });
  // a bad tag is caught before anything is uploaded, and the dialog stays open to fix it
  await upload.getByLabel("Tags").fill("an-unreasonably-long-tag-name-that-goes-past-forty");
  await upload.getByRole("button", { name: "Upload" }).click();
  await expect(upload.getByText("Keep each tag under 40 characters.")).toBeVisible();
  await upload.getByLabel("Tags").fill("Launch, Checklists");
  await upload.getByRole("button", { name: "Upload" }).click();
  await expect(upload).toBeHidden();
  const docLink = page.getByRole("link", { name: "launch-checklist.csv" }).first();
  await expect(docLink).toBeVisible();
  // a file the browser types generically (Markdown on Windows) is stored under its real type
  await page.getByRole("button", { name: "Upload a document" }).first().click();
  await upload.getByLabel("File").setInputFiles({
    name: "meeting-notes.md",
    mimeType: "application/octet-stream",
    buffer: Buffer.from("# Meeting notes\n- confirm the venue\n"),
  });
  await upload.getByRole("button", { name: "Upload" }).click();
  await expect(upload).toBeHidden();
  const notesLink = page.getByRole("link", { name: "meeting-notes.md" }).first();
  await expect(notesLink).toBeVisible();
  const notes = await page.request.get((await page.request.get((await notesLink.getAttribute("href"))!, { maxRedirects: 0 })).headers().location!);
  expect(notes.headers()["content-type"]).toContain("text/markdown");
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
  // an organization override beats the preset
  await visit(page, `${base}/settings?view=terminology`);
  await page.getByLabel("Subject, singular").fill("Course");
  await page.getByLabel("Subject, plural").fill("Courses");
  await page.getByRole("button", { name: "Save labels" }).click();
  await expect(page.getByText("Labels saved.")).toBeVisible();
  await expect(nav.getByRole("link", { name: "Courses" })).toBeVisible();
  await page.getByLabel("Subject, singular").fill("");
  await page.getByLabel("Subject, plural").fill("");
  await page.getByRole("button", { name: "Save labels" }).click();
  await expect(nav.getByRole("link", { name: "Subjects" })).toBeVisible();

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

test("invitations: invite, accept by magic link, change role, remove, last-admin guard", async ({ page, browser, request }) => {
  const invitee = `invitee-${Date.now()}@example.org`;
  await page.goto("/login");
  await page.getByRole("button", { name: "Sign in as Jordan Ellis" }).click();
  await expect(page).toHaveURL(/dashboard$/);
  await visit(page, "/northside-youth-collective/settings?view=members");

  // existing members can't be invited again
  await page.getByLabel("Email", { exact: true }).fill("priya@northside.example.org");
  await page.getByRole("button", { name: "Invite", exact: true }).click();
  await expect(page.getByText("That person is already in this organization.")).toBeVisible();

  await page.getByLabel("Email", { exact: true }).fill(invitee);
  await page.getByLabel("Role", { exact: true }).selectOption("admin");
  await page.getByRole("button", { name: "Invite", exact: true }).click();
  const link = await page.getByLabel("Invite link", { exact: true }).inputValue();
  // the form starts fresh, so the next invite can't silently inherit the Admin role
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Role", { exact: true })).toHaveValue("member");
  expect(link).toMatch(/\/invite\/[0-9a-f]{64}$/);

  // the invitee opens the link in their own browser, signs in, and accepts
  const other = await browser.newContext();
  const guest = await other.newPage();
  await guest.goto(link);
  await expect(guest.getByRole("heading", { name: "Join Northside Youth Collective" })).toBeVisible();
  await expect(guest.getByLabel("Work email")).toHaveValue(invitee);
  await guest.getByRole("button", { name: /sign-in link/i }).click();
  await expect(guest.getByText(`Check ${invitee} for a sign-in link`)).toBeVisible();
  await finishSignIn(guest, await magicLinkFor(request, invitee));
  await expect(guest).toHaveURL(/\/invite\//);
  await guest.getByRole("button", { name: "Join Northside Youth Collective" }).click();
  await expect(guest).toHaveURL(/\/northside-youth-collective\/dashboard$/);
  await other.close();

  // they joined as an admin; demote them, then remove them
  await visit(page, "/northside-youth-collective/settings?view=members");
  const row = page.getByRole("row").filter({ hasText: invitee });
  await expect(row).toBeVisible();
  await expect(row.getByRole("combobox")).toHaveValue("admin");
  await row.getByRole("combobox").selectOption("member");
  await row.getByRole("button", { name: "Update" }).click();
  await page.reload();
  await expect(page.getByRole("row").filter({ hasText: invitee }).getByRole("combobox")).toHaveValue("member");
  await page.getByRole("button", { name: `Remove ${invitee}` }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Remove" }).click();
  await expect(page.getByRole("row").filter({ hasText: invitee })).toHaveCount(0);

  // the only admin can't leave
  await page.getByRole("button", { name: "Leave the organization" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Leave" }).click();
  await expect(page.getByRole("dialog").getByText("An organization must keep at least one admin")).toBeVisible();
});

test("sign-in links work on another device and survive mail scanners", async ({ browser, request }) => {
  const email = `device-${Date.now()}@example.org`;
  // request the link on one "device"
  const laptop = await browser.newContext();
  const laptopPage = await laptop.newPage();
  await laptopPage.goto("/login?next=%2F%09%2Fevil.example");
  await laptopPage.getByLabel("Work email").fill(email);
  await laptopPage.getByRole("button", { name: /sign-in link/i }).click();
  await expect(laptopPage.getByText(`Check ${email} for a sign-in link`)).toBeVisible();
  const link = await magicLinkFor(request, email);
  await laptop.close();

  // a mail scanner opens the link first; that must not use up the token
  const scanned = await request.get(link);
  expect(scanned.status()).toBe(200);
  expect(await scanned.text()).toContain("Continue to Groundwork");

  // then the person opens it on a phone with no cookies from the first device
  const phone = await browser.newContext();
  const phonePage = await phone.newPage();
  await finishSignIn(phonePage, link);
  // signed in, and the smuggled off-site "next" was neutralised
  await expect(phonePage).toHaveURL(/\/create-organization$/);
  await phone.close();
});

test("sign-in links still work when Supabase swaps in the Site URL", async ({ browser, request }) => {
  const email = `fallback-${Date.now()}@example.org`;
  // a sign-in asked for from a host that isn't on the redirect allow-list
  // (say, a domain added after the last deploy): Supabase replaces the
  // redirect with its bare Site URL
  const otp = await request.post(
    `${setting("NEXT_PUBLIC_SUPABASE_URL")}/auth/v1/otp?redirect_to=${encodeURIComponent("https://not-allowed.example/auth/confirm?next=%2F")}`,
    { headers: { apikey: setting("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") }, data: { email, create_user: true } },
  );
  expect(otp.ok()).toBe(true);
  const link = await magicLinkFor(request, email);
  expect(new URL(link).host).not.toContain("&");
  expect(new URL(link).searchParams.get("token_hash")).toBeTruthy();

  const context = await browser.newContext();
  const page = await context.newPage();
  await finishSignIn(page, link);
  await expect(page).toHaveURL(/\/create-organization$/);
  await context.close();
});

test("links in Supabase's default email format still sign in", async ({ page, request }) => {
  // a code that can't be exchanged sends the person back to sign in again
  await page.goto("/auth/confirm?code=not-a-real-code&next=%2F");
  await expect(page).toHaveURL(/\/login\?error=link$/);

  // a real default-format link: Supabase verifies it, then redirects to /auth/confirm with ?code=
  const email = `default-format-${Date.now()}@example.org`;
  await page.goto("/login");
  await page.getByLabel("Work email").fill(email);
  await page.getByRole("button", { name: /sign-in link/i }).click();
  await expect(page.getByText(`Check ${email} for a sign-in link`)).toBeVisible();
  const ours = new URL(await magicLinkFor(request, email));
  const redirectTo = `${ours.origin}/auth/confirm?next=%2F`;
  const verify =
    `${setting("NEXT_PUBLIC_SUPABASE_URL")}/auth/v1/verify?token=${ours.searchParams.get("token_hash")}` +
    `&type=magiclink&redirect_to=${encodeURIComponent(redirectTo)}`;
  await page.goto(verify);
  await expect(page).toHaveURL(/\/create-organization$/);
});

test("sign-in works before JavaScript loads (progressive enhancement)", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  const email = `nojs-${Date.now()}@example.org`;
  await page.goto("/login");
  await page.getByLabel("Work email").fill(email);
  await page.getByRole("button", { name: /sign-in link/i }).click();
  await expect(page.getByText(`Check ${email} for a sign-in link`)).toBeVisible();
  // the email address wasn't put in the URL by a native GET fallback
  expect(page.url()).not.toContain(encodeURIComponent(email));
  await context.close();
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
  // tasks appear on the calendar by due date, and clicking one opens it
  await visit(page, "/northside-youth-collective/calendar");
  await expect(page.locator('td[aria-current="date"]')).toHaveCount(1);
  await page.getByRole("link", { name: /Post the drive on community boards/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Post the drive on community boards" })).toBeVisible();
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
