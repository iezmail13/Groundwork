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
  // settings are the preset, the people and the organization; words and colours aren't editable
  const sections = page.getByRole("navigation", { name: "Settings sections" });
  await expect(sections.getByRole("link")).toHaveCount(3);
  await expect(sections.getByRole("link", { name: "Terminology" })).toHaveCount(0);
  await expect(sections.getByRole("link", { name: "Theme" })).toHaveCount(0);
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

test("invitations: invite, accept by magic link, change role, remove, last-owner guard", async ({ page, browser, request }) => {
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
  // an owner can hand out every role, highest first
  await expect(page.getByLabel("Role", { exact: true }).locator("option")).toHaveText(["Owner", "Manager", "Admin", "Staff"]);
  await page.getByLabel("Role", { exact: true }).selectOption("manager");
  await page.getByRole("button", { name: "Invite", exact: true }).click();
  const link = await page.getByLabel("Invite link", { exact: true }).inputValue();
  // the form starts fresh, so the next invite can't silently inherit a higher role
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Role", { exact: true })).toHaveValue("staff");
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

  // they joined as a manager; demote them, then remove them
  await visit(page, "/northside-youth-collective/settings?view=members");
  const row = page.getByRole("row").filter({ hasText: invitee });
  await expect(row).toBeVisible();
  await expect(row.getByRole("combobox")).toHaveValue("manager");
  await row.getByRole("combobox").selectOption("staff");
  await row.getByRole("button", { name: "Update" }).click();
  await page.reload();
  await expect(page.getByRole("row").filter({ hasText: invitee }).getByRole("combobox")).toHaveValue("staff");
  await page.getByRole("button", { name: `Remove ${invitee}` }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Remove" }).click();
  await expect(page.getByRole("row").filter({ hasText: invitee })).toHaveCount(0);

  // the owner can start a transfer to anyone who isn't already an owner, and back out
  await page.getByRole("button", { name: "Transfer ownership" }).click();
  const transfer = page.getByRole("dialog", { name: "Transfer ownership" });
  // everyone who isn't already an owner; seeded members share a join time, so compare without order
  const candidates = transfer.getByLabel("New owner").locator("option:not([disabled])");
  await expect(candidates).toHaveCount(3);
  expect((await candidates.allTextContents()).sort()).toEqual(["Marcus Chen", "Priya Shah", "Sofia Alvarez"]);
  await transfer.getByRole("button", { name: "Cancel" }).click();
  await expect(transfer).toBeHidden();

  // the only owner can't leave
  await page.getByRole("button", { name: "Leave the organization" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Leave" }).click();
  await expect(page.getByRole("dialog").getByText("An organization must keep at least one owner")).toBeVisible();
});

test("role ladder: managers grant only lower roles, staff see settings read-only", async ({ page, browser }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Sign in as Priya Shah" }).click();
  await expect(page).toHaveURL(/dashboard$/);
  await visit(page, "/northside-youth-collective/settings?view=members");
  // the owner outranks a manager, so their row is read-only
  const owner = page.getByRole("row").filter({ hasText: "Jordan Ellis" });
  await expect(owner.getByRole("combobox")).toHaveCount(0);
  await expect(owner.getByText("Owner", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove Jordan Ellis" })).toHaveCount(0);
  // a manager can change and invite only the ranks below them
  await expect(page.getByLabel("Role for Marcus Chen").locator("option")).toHaveText(["Admin", "Staff"]);
  await expect(page.getByLabel("Role", { exact: true }).locator("option")).toHaveText(["Admin", "Staff"]);
  await expect(page.getByRole("button", { name: "Transfer ownership" })).toHaveCount(0);

  const context = await browser.newContext();
  const staff = await context.newPage();
  await staff.goto("/login");
  await staff.getByRole("button", { name: "Sign in as Sofia Alvarez" }).click();
  await expect(staff).toHaveURL(/dashboard$/);
  await visit(staff, "/northside-youth-collective/settings?view=members");
  await expect(staff.getByText("Only owners and managers can change settings.")).toBeVisible();
  await expect(staff.getByRole("combobox")).toHaveCount(0);
  await expect(staff.getByRole("heading", { name: "Invite someone" })).toHaveCount(0);
  // staff can still leave on their own
  await expect(staff.getByRole("button", { name: "Leave the organization" })).toBeVisible();
  await context.close();
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

test("landing page: signed-out visitors see the hero, features and a way in", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Run your organization on solid ground.");
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(page.getByRole("img", { name: /Groundwork dashboard/ })).toBeVisible();

  // the feature tabs work from the keyboard
  const tabs = page.getByRole("tablist", { name: "Features" });
  await tabs.getByRole("tab", { name: "Plan the work" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(tabs.getByRole("tab", { name: "Never miss a date" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel")).toContainText("Every deadline in one calendar.");
  await page.keyboard.press("End");
  await expect(page.getByRole("tabpanel")).toContainText("Your whole organization at a glance.");
  await page.keyboard.press("Home");
  await expect(page.getByRole("tabpanel")).toContainText("See who's doing what");

  await page.getByRole("navigation", { name: "Site" }).getByRole("link", { name: "Get started" }).first().click();
  await expect(page).toHaveURL(/\/login$/);

  // on a phone the links sit behind a menu button
  const phone = await browser.newPage({ viewport: { width: 360, height: 740 } });
  await phone.goto("/");
  expect(await phone.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  const menu = phone.getByRole("button", { name: "Open menu" });
  await menu.click();
  await expect(phone.getByRole("button", { name: "Close menu" })).toHaveAttribute("aria-expanded", "true");
  await phone.locator("#site-menu").getByRole("link", { name: "Log in" }).click();
  await expect(phone).toHaveURL(/\/login$/);
  await phone.close();
  await context.close();
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

// Phase 2: project membership, invitations with project access, Google sign-in.
// These run last because they add people to the seeded organization.

test("projects are private to their people; leaving frees work for reassignment", async ({ page, browser }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Sign in as Priya Shah" }).click();
  await expect(page).toHaveURL(/dashboard$/);
  await visit(page, "/northside-youth-collective/projects");
  await page.getByRole("link", { name: "Homework Club" }).first().click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Homework Club");
  const projectUrl = page.url();
  await page.locator("html[data-hydrated]").waitFor({ state: "attached" });

  // the lead takes Marcus off the project: his open work there is flagged
  await page.getByRole("button", { name: "Remove Marcus Chen from this program" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Remove" }).click();
  await expect(page.getByRole("row").filter({ hasText: "marcus@northside.example.org" })).toHaveCount(0);
  const snacks = page.getByRole("row").filter({ hasText: "Restock snack cupboard" });
  await expect(snacks.getByText("Needs assignee")).toBeVisible();

  // and puts him back, then hands the task to him again from the task form
  await page.getByLabel("Person", { exact: true }).selectOption({ label: "Marcus Chen" });
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("row").filter({ hasText: "marcus@northside.example.org" })).toBeVisible();
  await snacks.getByRole("link", { name: "Restock snack cupboard" }).click();
  await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
  await page.getByLabel("Assignee").selectOption({ label: "Marcus Chen" });
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  await expect(page.getByText("Needs assignee")).toHaveCount(0);

  // Sofia isn't on Homework Club: it's missing from her list and its page is not found
  const context = await browser.newContext();
  const staff = await context.newPage();
  await staff.goto("/login");
  await staff.getByRole("button", { name: "Sign in as Sofia Alvarez" }).click();
  await expect(staff).toHaveURL(/dashboard$/);
  await visit(staff, "/northside-youth-collective/projects");
  await expect(staff.getByRole("link", { name: "Winter Coat Drive" }).first()).toBeVisible();
  await expect(staff.getByRole("link", { name: "Homework Club" })).toHaveCount(0);
  await staff.goto(projectUrl);
  await expect(staff.getByRole("heading", { name: "Not found" })).toBeVisible();
  await visit(staff, "/northside-youth-collective/tasks?view=list");
  await expect(staff.getByRole("link", { name: "Restock snack cupboard" })).toHaveCount(0);
  await context.close();
});

test("invite from a task: a pending assignee, then join through the invitations page", async ({ page, browser, request }) => {
  const email = `robin-${Date.now()}@example.org`;
  await page.goto("/login");
  await page.getByRole("button", { name: "Sign in as Jordan Ellis" }).click();
  await expect(page).toHaveURL(/dashboard$/);
  await visit(page, "/northside-youth-collective/projects");
  await page.getByRole("link", { name: "Homework Club" }).first().click();
  await page.getByRole("link", { name: "Set up a quiet reading corner" }).click();
  await page.locator("html[data-hydrated]").waitFor({ state: "attached" });

  // the assignee picker leads to the invite form, which grants the project and assigns the task
  await page.getByRole("link", { name: "Invite someone to assign" }).click();
  await expect(page).toHaveURL(/\/settings\?view=members&task=[0-9a-f-]{36}#invite$/);
  const invite = page.locator("#invite");
  await expect(invite.getByText("is assigned Set up a quiet reading corner")).toBeVisible();
  await expect(invite.getByLabel("Homework Club")).toHaveValue("staff");
  await invite.getByLabel("Name").fill("Robin Tester");
  await invite.getByLabel("Email").fill(email);
  await invite.getByRole("button", { name: "Invite" }).click();
  await expect(invite.getByLabel("Invite link")).toHaveValue(/\/invite\/[0-9a-f]{64}$/);
  await expect(invite.getByText(/assigned to them/)).toBeVisible();
  await invite.getByRole("link", { name: "Back to Set up a quiet reading corner" }).click();
  await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
  await expect(page.getByLabel("Assignee").locator("option:checked")).toHaveText("Robin Tester (pending)");

  // the invitation shows its project in settings
  await visit(page, "/northside-youth-collective/settings?view=members");
  await expect(page.getByText(`Robin Tester · ${email}`)).toBeVisible();
  await expect(page.getByText("Joins Homework Club (Staff)").first()).toBeVisible();

  // Robin signs in normally and is shown the invitation before anything else
  const context = await browser.newContext();
  const guest = await context.newPage();
  await signInWithMagicLink(guest, request, email);
  await expect(guest).toHaveURL(/\/invitations$/);
  await expect(guest.getByText("Northside Youth Collective", { exact: true })).toBeVisible();
  await expect(guest.getByText("Program: Homework Club")).toBeVisible();
  await guest.getByRole("button", { name: "Join Northside Youth Collective" }).click();
  await expect(guest).toHaveURL(/\/northside-youth-collective\/dashboard$/);
  // they see only the project they were given, with the task waiting for them
  await visit(guest, "/northside-youth-collective/projects");
  await expect(guest.getByRole("link", { name: "Homework Club" }).first()).toBeVisible();
  await expect(guest.getByRole("link", { name: "Winter Coat Drive" })).toHaveCount(0);
  await visit(guest, "/northside-youth-collective/tasks?view=list&assignee=me");
  await expect(guest.getByRole("link", { name: "Set up a quiet reading corner" })).toBeVisible();
  await context.close();

  // removing them hands their open work to someone on the project
  await visit(page, "/northside-youth-collective/settings?view=members");
  await page.getByRole("button", { name: "Remove Robin Tester" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Hand over open tasks to").selectOption({ label: "Priya Shah" });
  await dialog.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Removed. 1 open task handed over." })).toBeVisible();
  await visit(page, "/northside-youth-collective/tasks?view=list");
  await expect(page.getByRole("row").filter({ hasText: "Set up a quiet reading corner" })).toContainText("Priya Shah");
});

test("Google sign-in hands off to Supabase and comes back to the callback", async ({ page }) => {
  let authorize: URL | undefined;
  // Google isn't configured locally: stop at the hand-off and check what was asked for
  await page.route("**/auth/v1/authorize**", async (route) => {
    authorize = new URL(route.request().url());
    await route.fulfill({ status: 200, contentType: "text/plain", body: "stopped at the hand-off" });
  });
  await page.goto("/login?next=/invitations");
  await page.locator("button", { hasText: "Continue with Google" }).click();
  await expect.poll(() => authorize?.searchParams.get("provider")).toBe("google");
  const back = new URL(authorize!.searchParams.get("redirect_to")!);
  expect(back.pathname).toBe("/auth/callback");
  expect(back.searchParams.get("next")).toBe("/invitations");

  // if Google sends the person back with an error, they land on sign-in with a way forward
  await page.unroute("**/auth/v1/authorize**");
  await page.goto("/auth/callback?error=access_denied");
  await expect(page).toHaveURL(/\/login\?error=google/);
  // (Next.js renders its own, empty role=alert route announcer as well)
  await expect(page.getByRole("alert").filter({ hasText: "Google sign-in didn't finish" })).toBeVisible();
});
