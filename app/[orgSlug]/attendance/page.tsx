import Link from "next/link";
import type { Metadata } from "next";
import { CalendarX, CircleCheck, Download, Lock, Search, UsersRound } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonClass } from "@/components/ui/button";
import { inputClass } from "@/components/ui/field";
import { AddParticipantButton } from "@/components/attendance/add-participant";
import { ParticipantList } from "@/components/attendance/participant-list";
import { TakeAttendance } from "@/components/attendance/take-attendance";
import { RateBars } from "@/components/attendance/rate-bars";
import { getOrgContext, type OrgContext } from "@/lib/org";
import {
  getAttendancePrograms,
  getMarksForSession,
  getMarksInRange,
  getParticipantNames,
  getSessions,
  listParticipants,
  type Program,
} from "@/lib/participants";
import { formatRate, groupMarks, type ReportRow } from "@/lib/attendance-report";
import { addDays, dateInZone, formatDate, formatRelativeDate, formatTime, isIsoDate, zonedTimeToUtc } from "@/lib/dates";
import { lower } from "@/lib/terminology/t";

const VIEWS = ["participants", "take", "reports"] as const;
type View = (typeof VIEWS)[number];
const UUID = /^[0-9a-f-]{36}$/i;

type Search = Record<string, string | string[] | undefined>;
const one = (sp: Search, key: string) => (typeof sp[key] === "string" ? (sp[key] as string) : "");

export async function generateMetadata({ params }: PageProps<"/[orgSlug]/attendance">): Promise<Metadata> {
  const { t } = await getOrgContext((await params).orgSlug);
  return { title: t("section.attendance") };
}

export default async function AttendancePage({ params, searchParams }: PageProps<"/[orgSlug]/attendance">) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const ctx = await getOrgContext(orgSlug);
  const { t, org, base } = ctx;
  const view: View = VIEWS.find((v) => v === sp.view) ?? "participants";
  const programs = await getAttendancePrograms(org.id);
  const tab = (v: View, label: string) => ({ label, href: `${base}/attendance${v === "participants" ? "" : `?view=${v}`}`, active: view === v });

  if (programs.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={t("section.attendance")} />
        <EmptyState icon={<Lock aria-hidden />} title={`No ${lower(t("project", "other"))} keep a roster you can see`}>
          A {lower(t("project"))} keeps a {lower(t("participant"))} roster when its settings have &ldquo;Keeps a{" "}
          {lower(t("participant"))} roster&rdquo; ticked. Its {lower(t("project_role.admin", "other"))},{" "}
          {lower(t("project_role.lead", "other"))} and {lower(t("role.owner", "other"))} can then see and check in its{" "}
          {lower(t("participant", "other"))} here.
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("section.attendance")}
        tabsLabel={`${t("section.attendance")} sections`}
        tabs={[tab("participants", t("participant", "other")), tab("take", `Take ${lower(t("section.attendance"))}`), tab("reports", "Reports")]}
        actions={
          view === "participants" && programs.some((p) => p.active) ? (
            <AddParticipantButton
              orgSlug={org.slug}
              programs={programs.filter((p) => p.active)}
              programId={UUID.test(one(sp, "program")) ? one(sp, "program") : undefined}
            />
          ) : null
        }
      />
      {sp.notice === "deleted" ? (
        <p role="status" className="flex items-center gap-2 border-l-4 border-ink pl-3 font-semibold">
          <CircleCheck aria-hidden className="size-4" />
          Deleted permanently. Their past {lower(t("section.attendance"))} still counts, without a name.
        </p>
      ) : null}
      {view === "participants" ? <ParticipantsView ctx={ctx} programs={programs} sp={sp} /> : null}
      {view === "take" ? <TakeView ctx={ctx} programs={programs} sp={sp} /> : null}
      {view === "reports" ? <ReportsView ctx={ctx} programs={programs} sp={sp} /> : null}
    </div>
  );
}

function ProgramSelect({ programs, value, id, allLabel }: { programs: Program[]; value: string; id: string; allLabel?: string }) {
  return (
    <select id={id} name="program" defaultValue={value} className={`${inputClass} py-1.5`}>
      {allLabel ? <option value="">{allLabel}</option> : null}
      {programs.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );
}

async function ParticipantsView({ ctx, programs, sp }: { ctx: OrgContext; programs: Program[]; sp: Search }) {
  const { t, org, base, tz, today } = ctx;
  const q = one(sp, "q").slice(0, 100);
  const program = UUID.test(one(sp, "program")) ? one(sp, "program") : "";
  const archived = sp.show === "archived";
  const rows = await listParticipants(org.id, { q, programId: program || undefined, archived });
  const plural = lower(t("participant", "other"));
  const filtering = Boolean(q || program);
  const showHref = (show: "active" | "archived") => {
    const next = new URLSearchParams({ ...(q ? { q } : {}), ...(program ? { program } : {}), ...(show === "archived" ? { show } : {}) });
    const s = next.toString();
    return `${base}/attendance${s ? `?${s}` : ""}`;
  };

  return (
    <div className="flex flex-col gap-4">
      <form role="search" aria-label={`Search ${plural}`} className="flex flex-wrap items-end gap-3 border-b border-rule pb-4">
        {archived ? <input type="hidden" name="show" value="archived" /> : null}
        <div className="flex min-w-56 flex-[2] flex-col gap-1">
          <label htmlFor="participant-search" className="font-heading text-xs font-semibold text-ink-muted">
            Search by name
          </label>
          <input id="participant-search" name="q" type="search" defaultValue={q} className={`${inputClass} py-1.5`} />
        </div>
        <div className="flex min-w-48 flex-1 flex-col gap-1">
          <label htmlFor="participant-program-filter" className="font-heading text-xs font-semibold text-ink-muted">
            {t("project")}
          </label>
          <ProgramSelect id="participant-program-filter" programs={programs} value={program} allLabel={`All ${lower(t("project", "other"))}`} />
        </div>
        <button type="submit" className={buttonClass("secondary", "md")}>
          <Search aria-hidden className="size-4" />
          Search
        </button>
      </form>

      <nav aria-label="Which list" className="flex gap-4 text-sm font-semibold">
        <Link href={showHref("active")} aria-current={!archived ? "page" : undefined} className={!archived ? "underline underline-offset-4" : "hover:underline"}>
          {t("status.active")}
        </Link>
        <Link href={showHref("archived")} aria-current={archived ? "page" : undefined} className={archived ? "underline underline-offset-4" : "hover:underline"}>
          {t("status.archived")}
        </Link>
      </nav>

      {rows.length === 0 ? (
        <EmptyState icon={<UsersRound aria-hidden />} title={filtering ? "No one matches" : archived ? `No ${lower(t("status.archived"))} ${plural}` : `No ${plural} yet`}>
          {filtering
            ? "Try another name or clear the filters."
            : archived
              ? `Archived ${plural} show up here, ready to restore.`
              : `Add the people your ${lower(t("project", "other"))} serve, then take ${lower(t("section.attendance"))} at each ${lower(t("event"))}.`}
        </EmptyState>
      ) : (
        <ParticipantList
          base={base}
          archived={archived}
          canChange
          caption={`${t("participant", "other")}: ${rows.length}`}
          rows={rows.map((p) => ({
            id: p.id,
            name: p.name,
            programs: p.programs.flatMap((g) => (g.project ? [g.project.name] : [])).join(", "),
            contact: [p.phone, p.email].filter(Boolean).join(" · "),
            added: formatRelativeDate(dateInZone(new Date(p.created_at), tz), today),
          }))}
        />
      )}
    </div>
  );
}

async function TakeView({ ctx, programs, sp }: { ctx: OrgContext; programs: Program[]; sp: Search }) {
  const { t, org, base, tz, today } = ctx;
  const programId = programs.find((p) => p.id === one(sp, "program"))?.id ?? programs[0]!.id;
  const program = programs.find((p) => p.id === programId)!;
  const from = zonedTimeToUtc(addDays(today, -60), "00:00", tz).toISOString();
  const to = zonedTimeToUtc(addDays(today, 31), "00:00", tz).toISOString();
  const sessions = await getSessions(org.id, programId, from, to);
  const endOfToday = zonedTimeToUtc(addDays(today, 1), "00:00", tz).toISOString();
  // the latest session that has started by the end of today, else the next one
  const fallback = [...sessions].reverse().find((s) => s.starts_at < endOfToday) ?? sessions[0];
  const session = sessions.find((s) => s.id === one(sp, "session")) ?? fallback;
  const sessionLabel = (s: { title: string; starts_at: string; all_day: boolean }) =>
    `${formatRelativeDate(dateInZone(new Date(s.starts_at), s.all_day ? "UTC" : tz), today)}${s.all_day ? "" : `, ${formatTime(s.starts_at, tz)}`} · ${s.title}`;

  const [roster, marks] = session
    ? await Promise.all([listParticipants(org.id, { programId }), getMarksForSession(org.id, session.id)])
    : [[], []];
  const initial = Object.fromEntries(marks.flatMap((m) => (m.participant_id ? [[m.participant_id, { status: m.status, note: m.note }]] : [])));
  const removed = marks.filter((m) => !m.participant_id).length;

  return (
    <div className="flex flex-col gap-4">
      <form className="flex flex-wrap items-end gap-3 border-b border-rule pb-4">
        <input type="hidden" name="view" value="take" />
        <div className="flex min-w-48 flex-1 flex-col gap-1">
          <label htmlFor="take-program" className="font-heading text-xs font-semibold text-ink-muted">
            {t("project")}
          </label>
          <ProgramSelect id="take-program" programs={programs} value={programId} />
        </div>
        {sessions.length ? (
          <div className="flex min-w-64 flex-[2] flex-col gap-1">
            <label htmlFor="take-session" className="font-heading text-xs font-semibold text-ink-muted">
              {t("event")}
            </label>
            <select id="take-session" name="session" defaultValue={session?.id} className={`${inputClass} py-1.5`}>
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {sessionLabel(s)}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <button type="submit" className={buttonClass("secondary", "md")}>
          Show
        </button>
      </form>

      {!session ? (
        <EmptyState icon={<CalendarX aria-hidden />} title={`No ${lower(t("event", "other"))} to check in`}>
          {program.name} has no {lower(t("event", "other"))} in the last two months or the next one. Add one to the{" "}
          <Link href={`${base}/calendar`} className="font-semibold underline">
            {lower(t("section.calendar"))}
          </Link>{" "}
          for this {lower(t("project"))}.
        </EmptyState>
      ) : roster.length === 0 ? (
        <EmptyState icon={<UsersRound aria-hidden />} title={`No ${lower(t("participant", "other"))} on ${program.name} yet`}>
          Add them from the {t("participant", "other")} tab.
        </EmptyState>
      ) : (
        <>
          <h2 className="text-xl font-bold">{sessionLabel(session)}</h2>
          {!program.active ? (
            <p className="flex items-center gap-2 border-l-4 border-ink pl-3 text-sm">
              <Lock aria-hidden className="size-4" />
              {program.name} is {lower(t("status.archived"))}, so its {lower(t("section.attendance"))} is read-only.
            </p>
          ) : null}
          <TakeAttendance
            key={session.id}
            organizationId={org.id}
            eventId={session.id}
            roster={roster.map((p) => ({ id: p.id, name: p.name }))}
            initial={initial}
            readOnly={!program.active}
          />
          {removed ? (
            <p className="text-sm text-ink-muted">
              Plus {removed} mark{removed === 1 ? "" : "s"} for {removed === 1 ? "someone" : "people"} deleted for privacy.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

async function ReportsView({ ctx, programs, sp }: { ctx: OrgContext; programs: Program[]; sp: Search }) {
  const { t, org, tz, today, base } = ctx;
  const fromDate = isIsoDate(one(sp, "from")) ? one(sp, "from") : addDays(today, -29);
  const toDate = isIsoDate(one(sp, "to")) && one(sp, "to") >= fromDate ? one(sp, "to") : today;
  const programId = programs.find((p) => p.id === one(sp, "program"))?.id ?? "";
  const [marks, names] = await Promise.all([
    getMarksInRange(
      org.id,
      zonedTimeToUtc(fromDate, "00:00", tz).toISOString(),
      zonedTimeToUtc(addDays(toDate, 1), "00:00", tz).toISOString(),
      programId || undefined,
    ),
    getParticipantNames(org.id),
  ]);
  const programName = new Map(programs.map((p) => [p.id, p.name]));
  const removedLabel = `Removed ${lower(t("participant", "other"))}`;
  const byParticipant = groupMarks(marks, (m) => m.participant_id, (k) => names.get(k) ?? removedLabel, removedLabel);
  const byProgram = groupMarks(marks, (m) => m.event?.project_id ?? null, (k) => programName.get(k) ?? t("project"), t("project"));
  const sessions = new Set(marks.map((m) => m.event_id)).size;
  const query = new URLSearchParams({ from: fromDate, to: toDate, ...(programId ? { program: programId } : {}) }).toString();
  const chartRows = [...byParticipant]
    .filter((r) => r.key)
    .sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1) || a.name.localeCompare(b.name))
    .map((r) => ({ key: r.key, label: r.name, rate: r.rate, detail: tallyText(r, t) }));

  return (
    <div className="flex flex-col gap-6">
      <form className="flex flex-wrap items-end gap-3 border-b border-rule pb-4">
        <input type="hidden" name="view" value="reports" />
        <div className="flex flex-col gap-1">
          <label htmlFor="report-from" className="font-heading text-xs font-semibold text-ink-muted">
            From
          </label>
          <input id="report-from" name="from" type="date" defaultValue={fromDate} className={`${inputClass} py-1.5`} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="report-to" className="font-heading text-xs font-semibold text-ink-muted">
            To
          </label>
          <input id="report-to" name="to" type="date" defaultValue={toDate} className={`${inputClass} py-1.5`} />
        </div>
        <div className="flex min-w-48 flex-1 flex-col gap-1">
          <label htmlFor="report-program" className="font-heading text-xs font-semibold text-ink-muted">
            {t("project")}
          </label>
          <ProgramSelect id="report-program" programs={programs} value={programId} allLabel={`All ${lower(t("project", "other"))}`} />
        </div>
        <button type="submit" className={buttonClass("secondary", "md")}>
          Show
        </button>
        <a href={`${base}/attendance/export?${query}`} className={buttonClass("ghost", "md")} download>
          <Download aria-hidden className="size-4" />
          Download CSV
        </a>
      </form>

      <p className="text-ink-muted">
        {formatDate(fromDate, { month: "short", day: "numeric", year: "numeric" })} to{" "}
        {formatDate(toDate, { month: "short", day: "numeric", year: "numeric" })}: {sessions} {lower(t("event", sessions === 1 ? "one" : "other"))} with{" "}
        {lower(t("section.attendance"))} taken. Rate = ({t("attendance.present")} + {t("attendance.late")}) ÷ ({t("attendance.present")} +{" "}
        {t("attendance.late")} + {t("attendance.absent")}); {lower(t("attendance.excused"))} doesn&apos;t count either way.
      </p>

      {marks.length === 0 ? (
        <EmptyState icon={<CalendarX aria-hidden />} title={`No ${lower(t("section.attendance"))} in these dates`}>
          Try a wider date range, or take {lower(t("section.attendance"))} first.
        </EmptyState>
      ) : (
        <>
          <RateBars caption={`${t("section.attendance")} rate by ${lower(t("participant"))}`} rows={chartRows} />
          <ReportTable caption={`${t("section.attendance")} by ${lower(t("project"))}`} heading={t("project")} rows={byProgram} t={t} />
          <ReportTable caption={`${t("section.attendance")} by ${lower(t("participant"))}`} heading={t("participant")} rows={byParticipant} t={t} />
        </>
      )}
    </div>
  );
}

function tallyText(r: ReportRow, t: OrgContext["t"]): string {
  return `${r.tally.present} ${lower(t("attendance.present"))}, ${r.tally.late} ${lower(t("attendance.late"))}, ${r.tally.absent} ${lower(
    t("attendance.absent"),
  )}, ${r.tally.excused} ${lower(t("attendance.excused"))}`;
}

function ReportTable({ caption, heading, rows, t }: { caption: string; heading: string; rows: ReportRow[]; t: OrgContext["t"] }) {
  const cols = ["present", "late", "absent", "excused"] as const;
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-xl font-bold">{caption}</h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-left">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-ink font-heading text-sm">
              <th scope="col" className="py-2 pr-4 font-semibold">
                {heading}
              </th>
              {cols.map((c) => (
                <th key={c} scope="col" className="py-2 pr-4 text-right font-semibold">
                  {t(`attendance.${c}`)}
                </th>
              ))}
              <th scope="col" className="py-2 text-right font-semibold">
                Rate
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key || "removed"} className="border-b border-rule">
                <th scope="row" className={`py-2 pr-4 ${r.key ? "font-semibold" : "font-normal italic"}`}>
                  {r.name}
                </th>
                {cols.map((c) => (
                  <td key={c} className="py-2 pr-4 text-right tabular-nums">
                    {r.tally[c]}
                  </td>
                ))}
                <td className="py-2 text-right font-heading font-bold tabular-nums">{formatRate(r.rate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
