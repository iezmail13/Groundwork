import { test, expect, type Browser, type Page } from "@playwright/test";

// Part 5 (D102): participant files, with every upload, download and deletion
// recorded and project staff kept out, and the private calendar feed: its
// contents, a new link replacing the old one, and a revoked link returning 404.
// Seeded Northside: Priya leads Homework Club (which keeps a roster), Marcus
// is project staff there, Jordan owns the organization, Sofia is staff on the
// other two programs.

const ORG = "/northside-youth-collective";

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

const fileName = `consent-${Date.now().toString(36)}.pdf`;
const pdf = Buffer.from("%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n");

test("participant files: uploads and downloads are recorded, and project staff are kept out", async ({ browser }) => {
  const priya = await signIn(browser, "Priya Shah");
  await visit(priya, `${ORG}/attendance`);
  await priya.getByRole("link", { name: "Amara Okafor" }).first().click();
  await priya.waitForURL(/\/attendance\/participants\/[0-9a-f-]{36}$/);
  const profileUrl = priya.url();
  const files = priya.getByRole("table", { name: "Files for Amara Okafor" });
  await expect(files.getByText("Amara Okafor - signed waiver.txt")).toBeVisible();

  // upload a consent form
  await priya.getByRole("button", { name: "Add a file for Amara Okafor" }).click();
  await priya.getByLabel("File", { exact: true }).setInputFiles({ name: fileName, mimeType: "application/pdf", buffer: pdf });
  await priya.getByLabel("Kind of file").selectOption({ label: "Consent form" });
  await priya.getByRole("dialog").getByRole("button", { name: "Upload" }).click();
  await expect(files.getByText(fileName)).toBeVisible();
  await expect(files.getByRole("row").filter({ hasText: fileName }).getByText("Consent form")).toBeVisible();

  // download it: the bytes come back, and the download is recorded
  const downloading = priya.waitForEvent("download");
  await priya.getByRole("link", { name: `Download ${fileName}` }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe(fileName);
  const path = await download.path();
  const { readFile } = await import("node:fs/promises");
  expect((await readFile(path)).equals(pdf)).toBe(true);
  const fileLink = await priya.getByRole("link", { name: `Download ${fileName}` }).getAttribute("href");
  expect(fileLink).toBeTruthy();

  await visit(priya, profileUrl);
  const access = priya.getByRole("table", { name: "Who added, opened, downloaded or deleted their files" });
  const rows = access.getByRole("row").filter({ hasText: fileName });
  await expect(rows.filter({ hasText: "Downloaded" }).getByText("Priya Shah")).toBeVisible();
  await expect(rows.filter({ hasText: "Added" }).getByText("Priya Shah")).toBeVisible();

  // project staff on the program see nothing, and the file link is a 404
  const marcus = await signIn(browser, "Marcus Chen");
  await visit(marcus, profileUrl);
  await expect(marcus.getByRole("heading", { level: 1, name: "Not found" })).toBeVisible();
  const blocked = await marcus.request.get(fileLink!, { maxRedirects: 0 });
  expect(blocked.status()).toBe(404);

  // the owner reads the access record too
  const jordan = await signIn(browser, "Jordan Ellis");
  await visit(jordan, profileUrl);
  await expect(
    jordan
      .getByRole("table", { name: "Who added, opened, downloaded or deleted their files" })
      .getByRole("row")
      .filter({ hasText: fileName })
      .filter({ hasText: "Downloaded" }),
  ).toBeVisible();

  // deleting removes the file and is recorded
  await priya.getByRole("button", { name: `Delete ${fileName}` }).click();
  await priya.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await expect(files.getByText(fileName)).toHaveCount(0);
  await visit(priya, profileUrl);
  await expect(access.getByRole("row").filter({ hasText: fileName }).filter({ hasText: "Deleted" })).toBeVisible();
  const gone = await priya.request.get(fileLink!, { maxRedirects: 0 });
  expect(gone.status()).toBe(404);

  for (const p of [priya, marcus, jordan]) await p.context().close();
});

test("calendar feed: what it holds, a new link replacing the old, and a revoked link returning 404", async ({ browser, request }) => {
  const sofia = await signIn(browser, "Sofia Alvarez");
  await visit(sofia, `${ORG}/settings?view=profile`);
  await sofia.getByRole("button", { name: "Turn on calendar feed" }).click();
  const link = sofia.getByLabel("Your calendar link");
  await expect(link).toHaveValue(/\/api\/calendar\/[A-Za-z0-9_-]{43}\.ics$/);
  const first = new URL(await link.inputValue());

  // the feed needs no session: the link is the key
  const feed = await request.get(first.pathname);
  expect(feed.status()).toBe(200);
  expect(feed.headers()["content-type"]).toContain("text/calendar");
  expect(feed.headers()["cache-control"]).toContain("no-store");
  const ics = await feed.text();
  expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
  const titles = [...ics.matchAll(/^SUMMARY:(.*)$/gm)].map((m) => m[1]!.replace(/\r$/, "").replace(/\\,/g, ","));
  // her open work, including her own personal note-taking, and items on her programs
  for (const title of [
    "Collect signed consent forms",
    "Draft my notes for the mentor check-ins",
    "Book the library meeting room for winter",
    "Coat sorting day",
    "Career night",
  ]) {
    expect(titles).toContain(title);
  }
  // not finished work, someone else's hidden work, other programs' sessions,
  // or anything about participants
  for (const title of ["Design the coat drive flyer", "Follow up on a family's fee waiver", "Homework Club", "Board meeting"]) {
    expect(titles).not.toContain(title);
  }
  expect(ics).not.toContain("Amara");
  expect(ics).not.toMatch(/DESCRIPTION|LOCATION/);

  // a new link stops the old one at once
  await sofia.getByRole("button", { name: "Make a new link" }).click();
  await expect(sofia.getByRole("status").filter({ hasText: "The old one no longer works" })).toBeVisible();
  const second = new URL(await link.inputValue());
  expect(second.pathname).not.toBe(first.pathname);
  expect((await request.get(first.pathname)).status()).toBe(404);
  expect((await request.get(second.pathname)).status()).toBe(200);

  // turning it off: the link returns 404, and the setting says it's off
  await sofia.getByRole("button", { name: "Turn off" }).click();
  await expect(sofia.getByRole("status").filter({ hasText: "Calendar feed turned off" })).toBeVisible();
  expect((await request.get(second.pathname)).status()).toBe(404);
  await visit(sofia, `${ORG}/settings?view=profile`);
  await expect(sofia.getByRole("button", { name: "Turn on calendar feed" })).toBeVisible();
  await sofia.context().close();
});
