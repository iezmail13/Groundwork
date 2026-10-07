// npm run seed
//
// Builds the demo organization "Northside Youth Collective". Idempotent: the
// four demo users are created once and reused, and the demo organization is
// rebuilt from scratch on every run (with due dates relative to today), so
// running it twice leaves exactly one copy. Only the demo org is touched.
//
// Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (read from
// .env.local when present).

import { existsSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../lib/supabase/database.types";
import { DEMO_ORG, DEMO_USERS } from "../lib/demo";
import { addDays, todayIn, zonedTimeToUtc } from "../lib/dates";
import { sanitizeFileName } from "../lib/validation";

for (const file of [".env.local", ".env"]) if (existsSync(file)) process.loadEnvFile(file);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (npm run env:local writes them for local Supabase).");
  process.exit(1);
}

const db = createClient<Database>(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const TZ = "America/Toronto";
const today = todayIn(TZ);
const day = (offset: number) => addDays(today, offset);

function must<T>(result: { data: T; error: { message: string } | null }, what: string): NonNullable<T> {
  if (result.error || result.data == null) throw new Error(`${what}: ${result.error?.message ?? "no data"}`);
  return result.data as NonNullable<T>;
}

// ---------------------------------------------------------------- users ----

async function ensureUsers() {
  const { data, error } = await db.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const ids: Record<string, string> = {};
  for (const u of DEMO_USERS) {
    const existing = data.users.find((x) => x.email?.toLowerCase() === u.email);
    if (existing) {
      ids[u.email] = existing.id;
    } else {
      const created = await db.auth.admin.createUser({
        email: u.email,
        email_confirm: true,
        user_metadata: { full_name: u.fullName },
      });
      if (created.error || !created.data.user) throw new Error(`create ${u.email}: ${created.error?.message}`);
      ids[u.email] = created.data.user.id;
    }
    must(await db.from("profiles").upsert({ id: ids[u.email]!, email: u.email, full_name: u.fullName }).select("id"), `profile ${u.email}`);
  }
  return ids;
}

// ------------------------------------------------------------- reset org ---

async function removeExistingOrg() {
  const { data: org } = await db.from("organizations").select("id").eq("slug", DEMO_ORG.slug).maybeSingle();
  if (!org) return;
  const { data: objects } = await db.storage.from("documents").list(org.id, { limit: 1000 });
  if (objects?.length) {
    const { error } = await db.storage.from("documents").remove(objects.map((o) => `${org.id}/${o.name}`));
    if (error) throw new Error(`remove old files: ${error.message}`);
  }
  must(await db.from("organizations").delete().eq("id", org.id).select("id"), "delete old demo org");
}

// -------------------------------------------------------- real documents ---

function crc32(buf: Buffer): number {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** A small flyer graphic in the two brand scales: navy band, bone field, helmet-yellow-free. */
function flyerPng(width = 320, height = 180): Buffer {
  const navy = [0x1f, 0x2d, 0x4d];
  const rail = [0x55, 0x5e, 0x74];
  const bone = [0xfb, 0xf9, 0xf4];
  const sand = [0xdd, 0xd6, 0xc8];
  const rows: Buffer[] = [];
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 3);
    for (let x = 0; x < width; x++) {
      let px = bone;
      if (y < 44) px = navy;
      else if (y > height - 18) px = rail;
      else if ((x - 40) ** 2 + (y - 110) ** 2 < 26 ** 2) px = navy; // a coat button
      else if (x > 90 && x < 290 && (y === 90 || y === 110 || y === 130)) px = sand; // text lines
      else if (x > 90 && x < 230 && y > 70 && y < 78) px = navy;
      row.set(px, 1 + x * 3);
    }
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolour RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(Buffer.concat(rows))),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

/** A one-page PDF with a title and lines of text (Helvetica). */
function simplePdf(title: string, lines: string[]): Buffer {
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  const content = [
    "BT /F2 18 Tf 56 760 Td (" + esc(title) + ") Tj ET",
    ...lines.map((line, i) => `BT /F1 11 Tf 56 ${724 - i * 18} Td (${esc(line)}) Tj ET`),
  ].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

const HANDBOOK = `# Northside Youth Collective: Volunteer Handbook

Welcome, and thank you for giving your time to Northside.

## Before your first session
- Complete the police vulnerable-sector check and send the receipt to Jordan.
- Read the safeguarding policy and sign the acknowledgement form.
- Pick up your lanyard from the front desk at the community centre.

## On site
- Sign in at the front desk every time, and sign out when you leave.
- Never be alone with one young person behind a closed door. Keep doors open and stay in sight of another adult.
- Phones stay in pockets unless you are taking attendance or calling for help.

## If something goes wrong
1. Make sure everyone is safe.
2. Tell the session lead straight away.
3. Write down what happened on an incident form before you leave.

Questions? Email jordan@northside.example.org or ask any staff member on site.
`;

const ATTENDANCE = `date,participant,grade,present,notes
${day(-14)},Amara O.,7,yes,
${day(-14)},Leo P.,6,yes,
${day(-14)},Nadia K.,8,no,family trip
${day(-7)},Amara O.,7,yes,
${day(-7)},Leo P.,6,yes,asked for extra math help
${day(-7)},Nadia K.,8,yes,
${day(-7)},Samir H.,7,yes,first session
${day(0)},Amara O.,7,yes,
${day(0)},Leo P.,6,no,
${day(0)},Nadia K.,8,yes,
${day(0)},Samir H.,7,yes,
`;

const BUDGET = `item,category,quantity,unit_cost_cad,total_cad
Collection bins,supplies,6,24.50,147.00
Flyers (colour print),outreach,250,0.32,80.00
Garment bags,supplies,200,0.45,90.00
Van rental (2 days),transport,1,185.00,185.00
Volunteer snacks,volunteers,3,40.00,120.00
Dry cleaning partner discount,services,1,0.00,0.00
`;

const SCHEDULE = `NORTHSIDE YOUTH COLLECTIVE: FALL 2026 PROGRAM SCHEDULE

Homework Club
  Mondays and Wednesdays, 3:30 to 5:30 pm, Room 104, Northside Community Centre
  Grades 5 to 8. Drop-in, snack provided.

Mentorship Circle
  Thursdays, 6:00 to 7:30 pm, Library meeting room
  Grades 9 to 12. Registration required.

Winter Coat Drive
  Collection weeks start in November. Drop-off bins at the centre, the library and St. Mark's.

Closures
  Thanksgiving Monday, Remembrance Day, and the two weeks over the winter break.
`;

// ---------------------------------------------------------------- build ----

async function main() {
  console.log(`Seeding ${DEMO_ORG.name} (today is ${today} in ${TZ})…`);
  const users = await ensureUsers();
  await removeExistingOrg();

  const [jordan, priya, marcus, sofia] = DEMO_USERS.map((u) => users[u.email]!);
  const org = must(
    await db
      .from("organizations")
      .insert({ name: DEMO_ORG.name, slug: DEMO_ORG.slug, preset_key: DEMO_ORG.preset, theme: { navy: "#1F2D4D", mode: "light" } })
      .select("id")
      .single(),
    "create org",
  );

  const memberships = must(
    await db
      .from("memberships")
      .insert(DEMO_USERS.map((u) => ({ organization_id: org.id, user_id: users[u.email]!, role: u.role })))
      .select("id, user_id"),
    "memberships",
  );
  const m = (userId: string) => memberships.find((x) => x.user_id === userId)!.id;

  const projects = must(
    await db
      .from("projects")
      .insert([
        {
          organization_id: org.id,
          name: "Homework Club",
          description: "Twice-weekly after-school homework help for grades 5 to 8 at the community centre.",
          color: "#1F2D4D",
          owner_membership_id: m(priya!),
          start_date: day(-40),
          end_date: day(70),
          created_by: priya,
        },
        {
          organization_id: org.id,
          name: "Winter Coat Drive",
          description: "Collect, clean and hand out winter coats to families in the neighbourhood before December.",
          color: "#777F90",
          owner_membership_id: m(marcus!),
          start_date: day(-10),
          end_date: day(55),
          created_by: marcus,
        },
        {
          organization_id: org.id,
          name: "Teen Mentorship Circle",
          description: "Weekly evening circle pairing high-school students with volunteer mentors.",
          color: "#4B566E",
          owner_membership_id: m(sofia!),
          start_date: day(-25),
          end_date: day(120),
          created_by: sofia,
        },
      ])
      .select("id, name"),
    "projects",
  );
  const p = (name: string) => projects.find((x) => x.name === name)!.id;
  const HC = p("Homework Club");
  const CD = p("Winter Coat Drive");
  const MC = p("Teen Mentorship Circle");

  type Seed = [project: string, title: string, due: number | null, status: "todo" | "in_progress" | "done", assignee: string | null, by: string];
  const tasks: Seed[] = [
    [HC, "Confirm room booking for November", -3, "todo", jordan!, priya!],
    [HC, "Restock snack cupboard", -1, "in_progress", marcus!, priya!],
    [HC, "Print October attendance sheets", -9, "done", priya!, priya!],
    [HC, "Recruit two more math volunteers", 4, "in_progress", priya!, jordan!],
    [HC, "Send progress notes to families", 6, "todo", priya!, priya!],
    [HC, "Order new graph-paper notebooks", 12, "todo", null, priya!],
    [HC, "Set up a quiet reading corner", 18, "todo", sofia!, priya!],
    [HC, "Review volunteer police checks", -5, "todo", jordan!, jordan!],
    [CD, "Book the van for collection days", -2, "todo", marcus!, marcus!],
    [CD, "Design the coat drive flyer", -12, "done", sofia!, marcus!],
    [CD, "Place collection bins at the library", 1, "in_progress", marcus!, marcus!],
    [CD, "Ask St. Mark's to host a drop-off bin", 2, "todo", jordan!, marcus!],
    [CD, "Line up the dry-cleaning partner", 5, "todo", marcus!, jordan!],
    [CD, "Recruit sorting-day volunteers", 9, "todo", sofia!, marcus!],
    [CD, "Post the drive on community boards", 0, "todo", priya!, marcus!],
    [CD, "Build the size and inventory spreadsheet", 14, "todo", null, marcus!],
    [CD, "Plan the distribution day layout", 30, "todo", marcus!, marcus!],
    [MC, "Match new mentors with students", -4, "in_progress", sofia!, sofia!],
    [MC, "Collect signed consent forms", 3, "todo", sofia!, sofia!],
    [MC, "Plan the career-night speakers", 11, "todo", jordan!, sofia!],
    [MC, "Order pizza for the kickoff circle", -16, "done", marcus!, sofia!],
    [MC, "Write the mentor check-in survey", 7, "in_progress", priya!, sofia!],
    [MC, "Book the library meeting room for winter", 21, "todo", sofia!, jordan!],
    [MC, "Share the mentor guide", null, "todo", null, sofia!],
    [MC, "Thank-you notes to September speakers", -20, "done", jordan!, sofia!],
  ];
  const insertedTasks = must(
    await db
      .from("tasks")
      .insert(
        tasks.map(([project_id, title, due, , assignee, by], i) => ({
          organization_id: org.id,
          project_id,
          title,
          due_date: due === null ? null : day(due),
          status: "todo" as const,
          assignee_membership_id: assignee ? m(assignee) : null,
          position: i + 1,
          created_by: by,
        })),
      )
      .select("id, title"),
    "tasks",
  );
  // move tasks into their real status afterwards, so the activity log reads like real work
  for (const [, title, , status] of tasks) {
    if (status === "todo") continue;
    const id = insertedTasks.find((x) => x.title === title)!.id;
    must(await db.from("tasks").update({ status }).eq("id", id).select("id"), `status ${title}`);
  }

  const at = (offset: number, time: string) => zonedTimeToUtc(day(offset), time, TZ).toISOString();
  type EventSeed = Database["public"]["Tables"]["events"]["Insert"];
  // PostgREST fills keys missing from some rows of a bulk insert with null, so set every column
  const fullEvent = (e: EventSeed): EventSeed => ({ all_day: false, description: null, location: null, ...e });
  must(
    await db
      .from("events")
      .insert(([
        { organization_id: org.id, project_id: HC, title: "Homework Club", starts_at: at(0, "15:30"), ends_at: at(0, "17:30"), location: "Room 104, Northside Community Centre", created_by: priya },
        { organization_id: org.id, project_id: HC, title: "Homework Club", starts_at: at(2, "15:30"), ends_at: at(2, "17:30"), location: "Room 104, Northside Community Centre", created_by: priya },
        { organization_id: org.id, project_id: HC, title: "Volunteer orientation", starts_at: at(5, "18:00"), ends_at: at(5, "19:30"), location: "Community Centre lounge", description: "New volunteers: safeguarding, sign-in, and a walk around the building.", created_by: jordan },
        { organization_id: org.id, project_id: MC, title: "Mentorship Circle", starts_at: at(1, "18:00"), ends_at: at(1, "19:30"), location: "Library meeting room", created_by: sofia },
        { organization_id: org.id, project_id: MC, title: "Career night", starts_at: at(15, "18:30"), ends_at: at(15, "20:30"), location: "Library auditorium", description: "Three local speakers, then small-group questions.", created_by: sofia },
        { organization_id: org.id, project_id: CD, title: "Coat sorting day", starts_at: `${day(9)}T00:00:00.000Z`, ends_at: `${day(10)}T00:00:00.000Z`, all_day: true, location: "St. Mark's church hall", created_by: marcus },
        { organization_id: org.id, project_id: CD, title: "Coat drive planning check-in", starts_at: at(-3, "12:00"), ends_at: at(-3, "12:45"), location: "Video call", created_by: marcus },
        { organization_id: org.id, project_id: null, title: "Board meeting", starts_at: at(12, "19:00"), ends_at: at(12, "20:30"), location: "Community Centre boardroom", description: "Quarterly update and budget review.", created_by: jordan },
      ] as EventSeed[]).map(fullEvent))
      .select("id"),
    "events",
  );

  const docs: { name: string; mime: string; body: Buffer; project: string | null; tags: string[]; pinned: boolean; by: string }[] = [
    { name: "Volunteer Handbook.md", mime: "text/markdown", body: Buffer.from(HANDBOOK), project: null, tags: ["handbook", "volunteers", "safeguarding"], pinned: true, by: jordan! },
    { name: "Homework Club attendance - fall.csv", mime: "text/csv", body: Buffer.from(ATTENDANCE), project: HC, tags: ["attendance"], pinned: false, by: priya! },
    {
      name: "Field trip consent form.pdf",
      mime: "application/pdf",
      body: simplePdf("Field Trip Consent Form", [
        "Northside Youth Collective",
        "",
        "Participant name: ______________________________   Grade: ______",
        "Trip: Science Centre visit, Teen Mentorship Circle",
        `Date: ${day(24)}   Departure 9:00 am from the community centre`,
        "",
        "I give permission for my child to attend this trip, travel by school bus,",
        "and receive first aid from trained staff if needed.",
        "",
        "Medical notes or allergies: _____________________________________",
        "Emergency contact and phone: ____________________________________",
        "",
        "Parent or guardian signature: ________________________  Date: ________",
      ]),
      project: MC,
      tags: ["forms", "consent"],
      pinned: true,
      by: sofia!,
    },
    { name: "Coat drive budget.csv", mime: "text/csv", body: Buffer.from(BUDGET), project: CD, tags: ["budget", "finance"], pinned: false, by: marcus! },
    { name: "Fall 2026 program schedule.txt", mime: "text/plain", body: Buffer.from(SCHEDULE), project: null, tags: ["schedule"], pinned: true, by: jordan! },
    { name: "Coat drive flyer.png", mime: "image/png", body: flyerPng(), project: CD, tags: ["flyer", "outreach"], pinned: false, by: sofia! },
  ];
  for (const d of docs) {
    const path = `${org.id}/${randomUUID()}-${sanitizeFileName(d.name)}`;
    const up = await db.storage.from("documents").upload(path, d.body, { contentType: d.mime, upsert: false });
    if (up.error) throw new Error(`upload ${d.name}: ${up.error.message}`);
    must(
      await db
        .from("documents")
        .insert({
          organization_id: org.id,
          project_id: d.project,
          name: d.name,
          storage_path: path,
          mime_type: d.mime,
          size_bytes: d.body.length,
          tags: d.tags,
          pinned: d.pinned,
          uploaded_by: d.by,
        })
        .select("id"),
      `document ${d.name}`,
    );
  }

  must(
    await db
      .from("invitations")
      .insert({ organization_id: org.id, email: "new.volunteer@northside.example.org", role: "member", invited_by: jordan })
      .select("id"),
    "invitation",
  );

  console.log(
    `Done: 4 people, ${projects.length} projects, ${tasks.length} tasks, 8 events, ${docs.length} documents.\n` +
      `Sign in at /login with the development shortcut, or by magic link as ${DEMO_USERS[0].email} (admin).`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
