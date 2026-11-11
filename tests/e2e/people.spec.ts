import { test, expect, type Browser, type Page } from "@playwright/test";
import { deflateSync } from "node:zlib";

// Part 7 (D104): editing your profile and photo, a profile's work differing
// by who's looking, muting a person, and online status (online, Do not
// disturb, Appear offline) shown live to colleagues. Seeded Northside: Priya
// (manager) leads Homework Club, where Marcus (admin) has hidden work; Sofia
// (staff) isn't on Homework Club.

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

/** A small valid PNG, so storage accepts it as an image. */
function png(): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = ~0;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff]! ^ (c >>> 8);
    return (~c >>> 0) as number;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(8, 0);
  ihdr.writeUInt32BE(8, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const rows = Buffer.concat(Array.from({ length: 8 }, () => Buffer.concat([Buffer.from([0]), Buffer.alloc(24, 0x40)])));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(rows)), chunk("IEND", Buffer.alloc(0))]);
}

async function profileUrl(page: Page, name: string) {
  await visit(page, `${ORG}/settings?view=members`);
  return (await page.getByRole("link", { name, exact: true }).getAttribute("href"))!;
}

test("editing your own profile and photo", async ({ browser }) => {
  const sofia = await signIn(browser, "Sofia Alvarez");
  await visit(sofia, `${ORG}/settings?view=profile`);
  await sofia.getByLabel("Title").fill(`Mentor lead ${stamp}`);
  await sofia.getByLabel("About you").fill("Here on Tuesdays and Thursdays.");
  await sofia.getByRole("button", { name: "Save profile" }).click();
  await expect(sofia.getByText("Saved.").first()).toBeVisible();
  await expect(sofia.getByLabel("Email")).toBeDisabled();

  await sofia.locator('input[type="file"][accept*="image/png"]').setInputFiles({ name: "me.png", mimeType: "image/png", buffer: png() });
  await expect(sofia.getByText("Photo saved.")).toBeVisible();
  // an SVG is refused before it's sent
  await sofia.locator('input[type="file"][accept*="image/png"]').setInputFiles({ name: "me.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg/>") });
  await expect(sofia.getByText("Use a PNG, JPG or WebP image.")).toBeVisible();

  // colleagues see the title, bio and photo on her profile
  const priya = await signIn(browser, "Priya Shah");
  await visit(priya, await profileUrl(priya, "Sofia Alvarez"));
  await expect(priya.getByRole("heading", { level: 1, name: "Sofia Alvarez" })).toBeVisible();
  await expect(priya.getByText(`Mentor lead ${stamp}`)).toBeVisible();
  await expect(priya.getByText("Here on Tuesdays and Thursdays.")).toBeVisible();
  await expect(priya.locator("header img")).toHaveAttribute("src", /profile-photos/);

  // and she can take it down again
  await visit(sofia, `${ORG}/settings?view=profile`);
  await sofia.getByRole("button", { name: "Remove photo" }).click();
  await expect(sofia.getByText("Photo removed. Your initials show instead.")).toBeVisible();
  for (const p of [sofia, priya]) await p.context().close();
});

test("a profile shows each viewer only the work they can see", async ({ browser }) => {
  const priya = await signIn(browser, "Priya Shah");
  const sofia = await signIn(browser, "Sofia Alvarez");
  const url = await profileUrl(priya, "Marcus Chen");

  // Priya leads Homework Club, where Marcus has hidden work
  await visit(priya, url);
  await expect(priya.getByRole("link", { name: "Follow up on a family's fee waiver" })).toBeVisible();
  await expect(priya.getByRole("link", { name: "Homework Club" }).last()).toBeVisible();

  // Sofia isn't on Homework Club: the same profile shows neither
  await visit(sofia, url);
  await expect(sofia.getByRole("heading", { level: 1, name: "Marcus Chen" })).toBeVisible();
  await expect(sofia.getByRole("link", { name: "Follow up on a family's fee waiver" })).toHaveCount(0);
  await expect(sofia.locator("main").getByRole("link", { name: "Homework Club" })).toHaveCount(0);
  for (const p of [priya, sofia]) await p.context().close();
});

test("muting a person stops their notifications, and only theirs", async ({ browser }) => {
  const sofia = await signIn(browser, "Sofia Alvarez");
  await visit(sofia, await profileUrl(sofia, "Marcus Chen"));
  await sofia.getByRole("switch", { name: "Mute notifications from Marcus Chen" }).check();
  await sofia.reload();
  await expect(sofia.getByRole("switch", { name: "Mute notifications from Marcus Chen" })).toBeChecked();

  const appoint = async (page: Page, title: string) => {
    await visit(page, `${ORG}/tasks/new`);
    await page.getByLabel("Title", { exact: true }).fill(title);
    await page.getByRole("radio", { name: "Appointed" }).check();
    await page.getByLabel("Program", { exact: true }).selectOption({ label: "Teen Mentorship Circle" });
    await page.getByRole("group", { name: "People on it" }).getByRole("checkbox", { name: "Sofia Alvarez", exact: true }).check();
    await page.getByRole("button", { name: "Create task" }).click();
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  };
  const fromMarcus = `Order name tags ${stamp}`;
  const fromPriya = `Confirm the mentor list ${stamp}`;
  const marcus = await signIn(browser, "Marcus Chen");
  await appoint(marcus, fromMarcus);
  const priya = await signIn(browser, "Priya Shah");
  await appoint(priya, fromPriya);

  await visit(sofia, `${ORG}/notifications`);
  await expect(sofia.getByRole("link", { name: new RegExp(`Priya Shah gave you “${fromPriya}”`) })).toBeVisible();
  await expect(sofia.getByText(new RegExp(fromMarcus))).toHaveCount(0);

  await visit(sofia, await profileUrl(sofia, "Marcus Chen"));
  await sofia.getByRole("switch", { name: "Mute notifications from Marcus Chen" }).uncheck();
  for (const p of [sofia, marcus, priya]) await p.context().close();
});

test("online status: online, Do not disturb and Appear offline, live for colleagues", async ({ browser }) => {
  const sofia = await signIn(browser, "Sofia Alvarez");
  const priya = await signIn(browser, "Priya Shah");
  await visit(priya, await profileUrl(priya, "Sofia Alvarez"));
  const status = priya.locator("header [data-presence]");
  await expect(status).toHaveAttribute("data-presence", "online", { timeout: 20_000 });
  await expect(status).toContainText("Online");

  await visit(sofia, `${ORG}/settings?view=profile`);
  await sofia.getByRole("radio", { name: /Do not disturb/ }).check();
  await expect(sofia.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();
  await expect(status).toHaveAttribute("data-presence", "dnd", { timeout: 20_000 });
  await expect(status).toContainText("Do not disturb");

  await sofia.getByRole("radio", { name: /Appear offline/ }).check();
  await expect(status).toHaveAttribute("data-presence", "offline", { timeout: 20_000 });
  await expect(status).toContainText("Offline");

  await sofia.getByRole("radio", { name: /Automatic/ }).check();
  await expect(status).toHaveAttribute("data-presence", "online", { timeout: 20_000 });

  // closing the app takes her offline
  await sofia.context().close();
  await expect(status).toHaveAttribute("data-presence", "offline", { timeout: 30_000 });
  await priya.context().close();
});
