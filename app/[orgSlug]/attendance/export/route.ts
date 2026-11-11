import { NextResponse, type NextRequest } from "next/server";
import { getOrgContext } from "@/lib/org";
import { getAttendancePrograms, getMarksInRange, getParticipantNames } from "@/lib/participants";
import { formatRate, groupMarks, toCsv } from "@/lib/attendance-report";
import { addDays, dateInZone, isIsoDate } from "@/lib/dates";
import { lower } from "@/lib/terminology/t";

/**
 * Attendance for a date range as CSV: one row per mark, then totals per
 * participant. RLS limits it to what the viewer may see.
 */
export async function GET(request: NextRequest, route: RouteContext<"/[orgSlug]/attendance/export">) {
  const { orgSlug } = await route.params;
  const ctx = await getOrgContext(orgSlug);
  const { t, org, tz, today } = ctx;
  const sp = request.nextUrl.searchParams;
  const from = isIsoDate(sp.get("from") ?? "") ? sp.get("from")! : addDays(today, -29);
  const to = isIsoDate(sp.get("to") ?? "") && sp.get("to")! >= from ? sp.get("to")! : today;
  const programs = await getAttendancePrograms(org.id);
  if (programs.length === 0) return new NextResponse("Not found", { status: 404 });
  const programId = programs.find((p) => p.id === sp.get("program"))?.id;

  const [marks, names] = await Promise.all([
    getMarksInRange(org.id, from, to, tz, programId),
    getParticipantNames(org.id),
  ]);
  const programName = new Map(programs.map((p) => [p.id, p.name]));
  const removed = `Removed ${lower(t("participant"))}`;
  const nameOf = (id: string | null) => (id ? (names.get(id) ?? removed) : removed);

  const sorted = [...marks].sort((a, b) => (a.event?.starts_at ?? "").localeCompare(b.event?.starts_at ?? "") || nameOf(a.participant_id).localeCompare(nameOf(b.participant_id)));
  const rows: (string | number | null)[][] = [
    ["Date", t("event"), t("project"), t("participant"), "Mark", "Note"],
    ...sorted.map((m) => [
      m.event ? dateInZone(new Date(m.event.starts_at), m.event.all_day ? "UTC" : tz) : "",
      m.event?.title ?? "",
      programName.get(m.event?.project_id ?? "") ?? "",
      nameOf(m.participant_id),
      t(`attendance.${m.status}`),
      m.note,
    ]),
    [],
    [t("participant"), t("attendance.present"), t("attendance.late"), t("attendance.absent"), t("attendance.excused"), "Rate"],
    ...groupMarks(marks, (m) => m.participant_id, (k) => names.get(k) ?? removed, removed).map((r) => [
      r.name,
      r.tally.present,
      r.tally.late,
      r.tally.absent,
      r.tally.excused,
      formatRate(r.rate),
    ]),
  ];
  const file = `${lower(t("section.attendance")).replace(/[^a-z0-9]+/g, "-")}-${from}-to-${to}.csv`;
  return new NextResponse(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${file}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
