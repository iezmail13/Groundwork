// npm run seed:marketing
//
// Builds "Maple Youth Collective", the fictional organization the landing
// page's feature pictures are captured from (scripts/capture-marketing.ts,
// D117). It has its own people, so the demo organization that the tests use
// (npm run seed) is never touched. Rebuilt from scratch on every run, with
// every date relative to today.
//
// Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (read from
// .env.local when present).

import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../lib/supabase/database.types";
import { addDays, todayIn, zonedTimeToUtc } from "../lib/dates";
import { sanitizeFileName } from "../lib/validation";
import { simplePdf } from "./lib/demo-files";

for (const file of [".env.local", ".env"]) if (existsSync(file)) process.loadEnvFile(file);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (npm run env:local writes them for local Supabase).");
  process.exit(1);
}

const MAPLE_ORG = { name: "Maple Youth Collective", slug: "maple-youth-collective", preset: "nonprofit" };
const MAPLE_USERS = [
  { email: "dana@maple.example.org", fullName: "Dana Okafor", role: "owner" },
  { email: "leo@maple.example.org", fullName: "Leo Martin", role: "manager" },
  { email: "ines@maple.example.org", fullName: "Ines Park", role: "admin" },
  { email: "sam@maple.example.org", fullName: "Sam Rivera", role: "staff" },
] as const;

const db = createClient<Database>(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const TZ = "America/Toronto";
const today = todayIn(TZ);
const day = (offset: number) => addDays(today, offset);
const at = (offset: number, time: string) => zonedTimeToUtc(day(offset), time, TZ).toISOString();
// Monday of this week, so the calendar's current week fills up
const weekday = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7;
const thisWeek = (d: number) => d - weekday;

function must<T>(result: { data: T; error: { message: string } | null }, what: string): NonNullable<T> {
  if (result.error || result.data == null) throw new Error(`${what}: ${result.error?.message ?? "no data"}`);
  return result.data as NonNullable<T>;
}

async function ensureUsers() {
  const { data, error } = await db.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const ids: Record<string, string> = {};
  for (const u of MAPLE_USERS) {
    const existing = data.users.find((x) => x.email?.toLowerCase() === u.email);
    if (existing) ids[u.email] = existing.id;
    else {
      const created = await db.auth.admin.createUser({ email: u.email, email_confirm: true, user_metadata: { full_name: u.fullName } });
      if (created.error || !created.data.user) throw new Error(`create ${u.email}: ${created.error?.message}`);
      ids[u.email] = created.data.user.id;
    }
    must(await db.from("profiles").upsert({ id: ids[u.email]!, email: u.email, full_name: u.fullName }).select("id"), `profile ${u.email}`);
  }
  return ids;
}

async function removeExistingOrg() {
  const { data: org } = await db.from("organizations").select("id").eq("slug", MAPLE_ORG.slug).maybeSingle();
  if (!org) return;
  const { data: objects } = await db.storage.from("documents").list(org.id, { limit: 1000 });
  if (objects?.length) {
    const { error } = await db.storage.from("documents").remove(objects.map((o) => `${org.id}/${o.name}`));
    if (error) throw new Error(`remove old files: ${error.message}`);
  }
  must(await db.from("organizations").delete().eq("id", org.id).select("id"), "delete old org");
}

const HANDBOOK = `# Maple Youth Collective: Volunteer Handbook

Welcome, and thank you for giving your time.

## Before your first shift
- Complete the safeguarding module and your police check.
- Read the code of conduct and sign it in Groundwork.

## On the day
- Sign in at the front desk and wear your lanyard.
- Never be alone with a young person behind a closed door.
- Report any concern to the program lead the same day.
`;

const BUDGET = `item,program,quantity,unit_cost_cad,total_cad
Camp T-shirts,Summer Day Camp,60,9.50,570.00
Art supplies,Summer Day Camp,1,420.00,420.00
Bus rental (2 trips),Summer Day Camp,2,385.00,770.00
Tutor stipends,After-School Tutoring,8,150.00,1200.00
Workbooks,After-School Tutoring,40,12.25,490.00
Food bank bins,Community Food Drive,6,38.00,228.00
`;

async function main() {
  console.log(`Seeding ${MAPLE_ORG.name} (today is ${today} in ${TZ})…`);
  const users = await ensureUsers();
  await removeExistingOrg();
  const [dana, leo, ines, sam] = MAPLE_USERS.map((u) => users[u.email]!) as [string, string, string, string];

  const org = must(
    await db.from("organizations").insert({ name: MAPLE_ORG.name, slug: MAPLE_ORG.slug, preset_key: MAPLE_ORG.preset }).select("id").single(),
    "create org",
  );
  const memberships = must(
    await db
      .from("memberships")
      .insert(MAPLE_USERS.map((u) => ({ organization_id: org.id, user_id: users[u.email]!, role: u.role })))
      .select("id, user_id"),
    "memberships",
  );
  const m = (userId: string) => memberships.find((x) => x.user_id === userId)!.id;

  const projects = must(
    await db
      .from("projects")
      .insert([
        { organization_id: org.id, name: "Summer Day Camp", description: "Six weeks of day camp for ages 8 to 12: sports, art and field trips.", color: "#163260", start_date: day(-20), end_date: day(40), created_by: leo },
        { organization_id: org.id, name: "After-School Tutoring", description: "Homework help and reading support, Monday to Thursday after school.", color: "#445A7E", start_date: day(-45), end_date: day(90), created_by: dana },
        { organization_id: org.id, name: "Community Food Drive", description: "Collect and sort donations for the neighbourhood food bank.", color: "#72829B", start_date: day(-10), end_date: day(25), created_by: dana },
      ])
      .select("id, name"),
    "projects",
  );
  const p = (name: string) => projects.find((x) => x.name === name)!.id;
  const CAMP = p("Summer Day Camp");
  const TUTOR = p("After-School Tutoring");
  const FOOD = p("Community Food Drive");
  must(
    await db
      .from("project_members")
      .insert([
        { organization_id: org.id, project_id: CAMP, membership_id: m(sam), role: "staff" },
        { organization_id: org.id, project_id: CAMP, membership_id: m(ines), role: "admin" },
        { organization_id: org.id, project_id: TUTOR, membership_id: m(ines), role: "admin" },
        { organization_id: org.id, project_id: TUTOR, membership_id: m(sam), role: "staff" },
        { organization_id: org.id, project_id: TUTOR, membership_id: m(leo), role: "staff" },
        { organization_id: org.id, project_id: FOOD, membership_id: m(leo), role: "lead" },
        { organization_id: org.id, project_id: FOOD, membership_id: m(sam), role: "staff" },
      ])
      .select("id"),
    "project members",
  );

  // done, in progress, due soon and overdue work across the three programs
  type Seed = [project: string, title: string, due: number | null, status: "todo" | "in_progress" | "done", assignee: string | null, by: string, priority?: "critical" | "high" | "low"];
  const tasks: Seed[] = [
    [CAMP, "Collect signed permission forms", -2, "in_progress", sam, leo, "critical"],
    [CAMP, "Book buses for the science centre trip", 1, "todo", leo, leo, "high"],
    [CAMP, "Order camp T-shirts", -9, "done", ines, leo],
    [CAMP, "Plan week 3 art projects", 4, "in_progress", ines, leo],
    [CAMP, "Confirm lifeguards for swim day", 2, "todo", dana, leo, "high"],
    [CAMP, "Send the parent welcome email", -12, "done", leo, leo],
    [TUTOR, "Match new tutors with students", -1, "in_progress", ines, ines, "high"],
    [TUTOR, "Print reading logs for October", 3, "todo", sam, ines],
    [TUTOR, "Order grade 6 math workbooks", 9, "todo", null, ines, "low"],
    [TUTOR, "Review tutor police checks", -4, "todo", dana, ines, "critical"],
    [TUTOR, "Share term progress notes with families", -15, "done", ines, ines],
    [FOOD, "Place collection bins at the library", 0, "in_progress", sam, dana],
    [FOOD, "Recruit sorting-day volunteers", 5, "todo", leo, dana],
    [FOOD, "Design the food drive poster", -6, "done", sam, dana],
    [FOOD, "Arrange pick-up with the food bank", 6, "todo", dana, dana, "high"],
  ];
  const inserted = must(
    await db
      .from("tasks")
      .insert(
        tasks.map(([project_id, title, due, , assignee, by], i) => ({
          organization_id: org.id,
          project_id,
          title,
          due_date: due === null ? null : day(due),
          status: "todo" as const,
          kind: assignee && assignee !== by ? ("appointed" as const) : ("general" as const),
          position: i + 1,
          created_by: by,
        })),
      )
      .select("id, title"),
    "tasks",
  );
  const taskId = (title: string) => inserted.find((x) => x.title === title)!.id;
  must(
    await db
      .from("task_assignees")
      .insert(
        tasks
          .filter(([, , , , assignee]) => assignee)
          .map(([, title, , , assignee, by]) => ({
            organization_id: org.id,
            task_id: taskId(title),
            membership_id: m(assignee!),
            kind: assignee === by ? ("claimed" as const) : ("appointed" as const),
            added_by: by,
          })),
      )
      .select("id"),
    "assignees",
  );
  for (const [, title, , status, , , priority] of tasks) {
    if (status !== "todo") must(await db.from("tasks").update({ status }).eq("id", taskId(title)).select("id"), `status ${title}`);
    if (priority) must(await db.from("tasks").update({ priority }).eq("id", taskId(title)).select("id"), `priority ${title}`);
  }

  // a full week on the calendar, plus a few dates either side
  type EventSeed = Database["public"]["Tables"]["events"]["Insert"];
  const ev = (e: Omit<EventSeed, "organization_id">): EventSeed => ({ organization_id: org.id, all_day: false, description: null, location: null, ...e });
  must(
    await db
      .from("events")
      .insert([
        ...[0, 1, 2, 3, 4].map((d) =>
          ev({ project_id: CAMP, title: "Day camp", starts_at: at(thisWeek(d), "09:00"), ends_at: at(thisWeek(d), "16:00"), location: "Maple Park fieldhouse", created_by: leo }),
        ),
        ...[0, 2].map((d) =>
          ev({ project_id: TUTOR, title: "Tutoring: reading", starts_at: at(thisWeek(d), "16:30"), ends_at: at(thisWeek(d), "18:00"), location: "Library room B", created_by: ines }),
        ),
        ...[1, 3].map((d) =>
          ev({ project_id: TUTOR, title: "Tutoring: math", starts_at: at(thisWeek(d), "16:30"), ends_at: at(thisWeek(d), "18:00"), location: "Library room B", created_by: ines }),
        ),
        ev({ project_id: CAMP, title: "Science centre trip", starts_at: at(thisWeek(3), "10:00"), ends_at: at(thisWeek(3), "14:00"), location: "Ontario Science Centre", created_by: leo }),
        ev({ project_id: FOOD, title: "Sorting day", starts_at: `${day(thisWeek(5))}T00:00:00.000Z`, ends_at: `${day(thisWeek(6))}T00:00:00.000Z`, all_day: true, location: "St. Andrew's hall", created_by: dana }),
        ev({ project_id: null, title: "Staff meeting", starts_at: at(thisWeek(1), "12:00"), ends_at: at(thisWeek(1), "13:00"), location: "Office", created_by: dana }),
        ev({ project_id: null, title: "Board meeting", starts_at: at(thisWeek(10), "19:00"), ends_at: at(thisWeek(10), "20:30"), location: "Community centre boardroom", description: "Quarterly budget review.", created_by: dana }),
        ev({ project_id: FOOD, title: "Food bank pick-up", starts_at: at(thisWeek(8), "11:00"), ends_at: at(thisWeek(8), "12:00"), location: "Library", created_by: leo }),
      ])
      .select("id"),
    "events",
  );

  const docs: { name: string; mime: string; body: Buffer; project: string | null; tags: string[]; pinned: boolean; by: string }[] = [
    {
      name: "Summer camp permission form.pdf",
      mime: "application/pdf",
      body: simplePdf("Summer Day Camp Permission Form", [
        "Maple Youth Collective",
        "",
        "Camper name: ______________________________   Age: ______",
        "I give permission for my child to attend Summer Day Camp, including",
        "field trips by bus and swim day with certified lifeguards.",
        "",
        "Allergies or medical notes: ____________________________________",
        "Parent or guardian signature: ________________________  Date: ________",
      ]),
      project: CAMP,
      tags: ["forms", "consent"],
      pinned: true,
      by: leo,
    },
    {
      name: "Science centre trip permission form.pdf",
      mime: "application/pdf",
      body: simplePdf("Science Centre Trip Permission Form", [
        "Maple Youth Collective, Summer Day Camp",
        `Trip date: ${day(thisWeek(3))}, 10:00 am to 2:00 pm`,
        "",
        "Parent or guardian signature: ________________________",
      ]),
      project: CAMP,
      tags: ["forms", "field trip"],
      pinned: false,
      by: ines,
    },
    { name: "Program budget 2026.csv", mime: "text/csv", body: Buffer.from(BUDGET), project: null, tags: ["budget", "finance"], pinned: true, by: dana },
    { name: "Volunteer handbook.md", mime: "text/markdown", body: Buffer.from(HANDBOOK), project: null, tags: ["handbook", "volunteers"], pinned: true, by: dana },
    {
      name: "Tutoring reading list.pdf",
      mime: "application/pdf",
      body: simplePdf("After-School Tutoring: Reading List", ["Grades 4 to 6", "", "1. Wonder", "2. Holes", "3. The Wild Robot"]),
      project: TUTOR,
      tags: ["reading"],
      pinned: false,
      by: ines,
    },
  ];
  for (const d of docs) {
    const path = `${org.id}/${randomUUID()}-${sanitizeFileName(d.name)}`;
    const up = await db.storage.from("documents").upload(path, d.body, { contentType: d.mime, upsert: false });
    if (up.error) throw new Error(`upload ${d.name}: ${up.error.message}`);
    must(
      await db
        .from("documents")
        .insert({ organization_id: org.id, project_id: d.project, name: d.name, storage_path: path, mime_type: d.mime, size_bytes: d.body.length, tags: d.tags, pinned: d.pinned, uploaded_by: d.by })
        .select("id"),
      `document ${d.name}`,
    );
  }

  // the team has been here a while, so nothing reads as brand new
  const joined = new Date(Date.now() - 60 * 24 * 3600_000).toISOString();
  must(await db.from("memberships").update({ created_at: joined }).eq("organization_id", org.id).select("id"), "join dates");
  console.log(`Done: ${MAPLE_USERS.length} people, ${projects.length} programs, ${tasks.length} tasks, ${docs.length} documents.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
