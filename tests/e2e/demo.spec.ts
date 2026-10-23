import { test, expect, type Browser, type Page } from "@playwright/test";

// The public demo (D115): no account or email; each visitor gets their own
// private sample organization; two demos never see each other; uploads and
// other outward actions are off; ending the demo deletes it and its
// temporary sign-in. Locally the bot check is off (no Turnstile key).

async function startDemo(browser: Browser): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/demo");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Start the demo" }).click();
  await page.waitForURL(/\/demo-[a-z0-9]+\/dashboard$/);
  await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
  return page;
}

const slugOf = (page: Page) => new URL(page.url()).pathname.split("/")[1]!;

test("the website leads to the demo, without an account", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Try the demo" }).first().click();
  await expect(page).toHaveURL(/\/demo$/);
  await expect(page.getByRole("heading", { level: 1, name: "Try Groundwork" })).toBeVisible();
  await expect(page.getByText("It lasts two hours. When it ends, everything in it is deleted.")).toBeVisible();
});

test("each visitor gets their own private demo, and changes stay in it", async ({ browser }) => {
  const first = await startDemo(browser);
  const second = await startDemo(browser);
  expect(slugOf(first)).not.toBe(slugOf(second));

  // a demo banner, with the time left and a way out
  const banner = first.getByRole("region", { name: "Demo" });
  await expect(banner.getByText("You're in a demo.")).toBeVisible();
  await expect(banner.getByText(/ends in (1 h 59|2 h 0) min/)).toBeVisible();
  await expect(first.getByText("Welcome back, Alex.")).toBeVisible();

  // a change in the first demo doesn't reach the second
  await first.goto(`/${slugOf(first)}/tasks`);
  await first.getByRole("link", { name: "Order new math workbooks" }).first().click();
  await first.getByLabel("Title").fill("Order workbooks (changed in demo one)");
  await first.getByRole("button", { name: "Save" }).click();
  await expect(first.getByText("Saved.")).toBeVisible();
  await second.goto(`/${slugOf(second)}/tasks`);
  await expect(second.getByRole("link", { name: "Order new math workbooks" }).first()).toBeVisible();
  await expect(second.getByText("changed in demo one")).toHaveCount(0);

  // and the second visitor can't open the first one's demo
  const res = await second.goto(`/${slugOf(first)}/dashboard`);
  expect(res?.status()).toBe(404);

  await first.context().close();
  await second.context().close();
});

test("a demo can't upload files, and ending it deletes it", async ({ browser }) => {
  const page = await startDemo(browser);
  const slug = slugOf(page);

  await page.goto(`/${slug}/documents`);
  await page.getByRole("button", { name: "Upload a document" }).first().click();
  const upload = page.getByRole("dialog", { name: "Upload a document" });
  await upload.getByLabel("File").setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
  await upload.getByRole("button", { name: "Upload" }).click();
  await expect(upload.getByText("That isn't available in the demo. Start free to use it with your team.").first()).toBeVisible();
  await upload.getByRole("button", { name: "Cancel" }).click();

  await page.getByRole("region", { name: "Demo" }).getByRole("button", { name: "End demo" }).click();
  await expect(page).toHaveURL(/\/demo\?ended=1$/);
  await expect(page.getByRole("heading", { level: 1, name: "Your demo has ended" })).toBeVisible();

  // the demo is gone, and so is the temporary sign-in
  await page.goto(`/${slug}/dashboard`);
  await expect(page).toHaveURL(/\/login/);
  await page.context().close();
});

test("someone signed in to Groundwork isn't sent into a demo", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Sign in as Sofia Alvarez" }).click();
  await expect(page).toHaveURL(/dashboard$/);
  await page.goto("/demo");
  await expect(page).toHaveURL(/\/northside-youth-collective\/dashboard$/);
});
