import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Archive, ArrowLeft, CircleCheck, Download, Eye, X } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { ParticipantForm } from "@/components/attendance/participant-form";
import { ArchiveParticipantButton, EnrollForm } from "@/components/attendance/profile-actions";
import { DeleteParticipantButton } from "@/components/attendance/delete-participant";
import { DeleteParticipantFileButton, UploadParticipantFileButton } from "@/components/attendance/participant-files";
import { FILE_KIND_LABELS } from "@/lib/validation";
import { FileIcon, formatBytes } from "@/components/documents/file-icon";
import { MarkBadge } from "@/components/attendance/status";
import { getOrgContext } from "@/lib/org";
import {
  getAttendancePrograms,
  getMarksForParticipant,
  getParticipant,
  getParticipantFileEvents,
  getParticipantFiles,
  type ParticipantFileEvent,
} from "@/lib/participants";
import { attendanceRate, emptyTally, addMark, formatRate } from "@/lib/attendance-report";
import { dateInZone, formatRelativeDate, formatTimestamp } from "@/lib/dates";
import { rankOf } from "@/lib/roles";
import { lower, type Translate } from "@/lib/terminology/t";
import { unenrollParticipant } from "../../actions";

const UUID = /^[0-9a-f-]{36}$/i;

async function load(orgSlug: string, participantId: string) {
  const ctx = await getOrgContext(orgSlug);
  if (!UUID.test(participantId)) return { ctx, participant: null };
  return { ctx, participant: await getParticipant(ctx.org.id, participantId) };
}

export async function generateMetadata({ params }: PageProps<"/[orgSlug]/attendance/participants/[participantId]">): Promise<Metadata> {
  const { orgSlug, participantId } = await params;
  const { ctx, participant } = await load(orgSlug, participantId);
  return { title: participant?.name ?? ctx.t("participant") };
}

export default async function ParticipantPage({ params, searchParams }: PageProps<"/[orgSlug]/attendance/participants/[participantId]">) {
  const { orgSlug, participantId } = await params;
  const sp = await searchParams;
  const { ctx, participant: p } = await load(orgSlug, participantId);
  if (!p) notFound();
  const { t, org, base, tz, today } = ctx;
  const [programs, marks, files, fileEvents] = await Promise.all([
    getAttendancePrograms(org.id),
    getMarksForParticipant(org.id, p.id),
    getParticipantFiles(p.id),
    getParticipantFileEvents(p.id),
  ]);
  const manages = new Map(programs.map((g) => [g.id, g]));
  const enrolled = new Set(p.programs.map((g) => g.project_id));
  const canEnroll = programs.filter((g) => g.active && !enrolled.has(g.id));
  const tally = marks.reduce((acc, m) => addMark(acc, m.status), emptyTally());
  const archived = Boolean(p.archived_at);
  const isOwner = ctx.role === "owner";
  // files can be added in an active program the viewer manages and they're enrolled in
  const uploadPrograms = programs.filter((g) => g.active && enrolled.has(g.id));
  const canDeleteFile = (projectId: string) => isOwner || manages.has(projectId);
  const programName = (id: string | null) => p.programs.find((g) => g.project_id === id)?.project?.name ?? manages.get(id ?? "")?.name ?? t("project");

  return (
    <div className="flex flex-col gap-8">
      <Link href={`${base}/attendance`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline">
        <ArrowLeft aria-hidden className="size-4" />
        All {lower(t("participant", "other"))}
      </Link>
      <PageHeader
        title={p.name}
        description={
          <span className="flex flex-wrap items-center gap-2 text-sm">
            {archived ? (
              <Badge variant="filled" icon={<Archive aria-hidden className="size-3.5" />}>
                {t("status.archived")}
              </Badge>
            ) : null}
            <span>
              {t("section.attendance")} rate {formatRate(attendanceRate(tally))} over {tally.total} {lower(t("event", tally.total === 1 ? "one" : "other"))}
            </span>
          </span>
        }
      />
      {sp.notice === "added" ? (
        <p role="status" className="flex items-center gap-2 border-l-4 border-ink pl-3 font-semibold">
          <CircleCheck aria-hidden className="size-4" />
          Added. Fill in their details below.
        </p>
      ) : null}
      {archived ? (
        <p className="flex items-center gap-2 border-l-4 border-ink pl-3 text-sm">
          <Archive aria-hidden className="size-4" />
          Archived {formatTimestamp(p.archived_at!, tz)}: hidden from rosters and check-in. Their {lower(t("section.attendance"))} still counts in reports.
        </p>
      ) : null}

      <section aria-labelledby="details-heading" className="flex flex-col gap-3">
        <h2 id="details-heading" className="text-xl font-bold">
          Details
        </h2>
        <ParticipantForm
          readOnly={false}
          participant={{
            id: p.id,
            name: p.name,
            email: p.email,
            phone: p.phone,
            date_of_birth: p.date_of_birth,
            guardian_name: p.guardian_name,
            emergency_contact: p.emergency_contact,
            care_notes: p.care_notes,
            notes: p.notes,
          }}
        />
      </section>

      <section aria-labelledby="files-heading" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="files-heading" className="text-xl font-bold">
            Files
          </h2>
          {uploadPrograms.length && !archived ? (
            <UploadParticipantFileButton organizationId={org.id} participantId={p.id} participantName={p.name} programs={uploadPrograms} />
          ) : null}
        </div>
        <p className="max-w-2xl text-sm text-ink-muted">
          Waivers, medical and consent forms, ID and other files. Every view, download and deletion is recorded for{" "}
          {lower(t("role.owner", "other"))} and {lower(t("project"))} {lower(t("project_role.lead", "other"))}.
        </p>
        {files.length === 0 ? (
          <p className="text-ink-muted">No files yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left">
              <caption className="sr-only">Files for {p.name}</caption>
              <thead>
                <tr className="border-b border-ink font-heading text-sm">
                  <th scope="col" className="py-2 pr-4 font-semibold">Name</th>
                  <th scope="col" className="py-2 pr-4 font-semibold">Kind</th>
                  <th scope="col" className="py-2 pr-4 font-semibold">{t("project")}</th>
                  <th scope="col" className="py-2 pr-4 font-semibold">Added</th>
                  <th scope="col" className="py-2 font-semibold">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {files.map((f) => (
                  <tr key={f.id} className="border-b border-rule">
                    <td className="py-2 pr-4">
                      <span className="inline-flex items-center gap-2 font-semibold">
                        <FileIcon mime={f.mime_type} />
                        {f.name}
                      </span>
                      <span className="block text-xs text-ink-muted">{formatBytes(f.size_bytes)}</span>
                    </td>
                    <td className="py-2 pr-4 text-sm">{FILE_KIND_LABELS[f.kind]}</td>
                    <td className="py-2 pr-4 text-sm">{programName(f.project_id)}</td>
                    <td className="py-2 pr-4 text-sm whitespace-nowrap">
                      {formatRelativeDate(dateInZone(new Date(f.created_at), tz), today)}
                      <span className="block text-xs text-ink-muted">{f.uploader?.full_name || f.uploader?.email || "Someone"}</span>
                    </td>
                    <td className="py-2">
                      <span className="flex flex-wrap justify-end gap-1">
                        <a
                          href={`${base}/attendance/files/${f.id}`}
                          target="_blank"
                          rel="noreferrer noopener"
                          className={buttonClass("ghost", "sm")}
                          aria-label={`Open ${f.name}`}
                        >
                          <Eye aria-hidden className="size-4" />
                          Open
                        </a>
                        <a href={`${base}/attendance/files/${f.id}?download=1`} className={buttonClass("ghost", "sm")} aria-label={`Download ${f.name}`}>
                          <Download aria-hidden className="size-4" />
                          Download
                        </a>
                        {canDeleteFile(f.project_id) ? <DeleteParticipantFileButton id={f.id} name={f.name} /> : null}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {fileEvents.length || isOwner ? <FileAccessLog events={fileEvents} tz={tz} t={t} programName={programName} /> : null}

      <section aria-labelledby="programs-heading" className="flex flex-col gap-3">
        <h2 id="programs-heading" className="text-xl font-bold">
          {t("project", "other")}
        </h2>
        <ul className="divide-y divide-rule border-y border-rule">
          {p.programs.map((g) => {
            const mine = manages.get(g.project_id);
            return (
              <li key={g.project_id} className="flex items-center justify-between gap-3 py-2">
                <Link href={`${base}/projects/${g.project_id}`} className="font-semibold hover:underline">
                  {g.project?.name ?? t("project")}
                </Link>
                {mine?.active ? (
                  <form action={unenrollParticipant}>
                    <input type="hidden" name="participantId" value={p.id} />
                    <input type="hidden" name="projectId" value={g.project_id} />
                    <button type="submit" className={buttonClass("ghost", "sm")} aria-label={`Remove ${p.name} from ${g.project?.name ?? ""}`}>
                      <X aria-hidden className="size-4" />
                      Remove
                    </button>
                  </form>
                ) : null}
              </li>
            );
          })}
        </ul>
        {canEnroll.length ? <EnrollForm organizationId={org.id} participantId={p.id} programs={canEnroll} /> : null}
      </section>

      <section aria-labelledby="history-heading" className="flex flex-col gap-3">
        <h2 id="history-heading" className="text-xl font-bold">
          {t("section.attendance")} history
        </h2>
        {marks.length === 0 ? (
          <p className="text-ink-muted">No {lower(t("section.attendance"))} taken for them yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-left">
              <caption className="sr-only">
                {t("section.attendance")} history for {p.name}
              </caption>
              <thead>
                <tr className="border-b border-ink font-heading text-sm">
                  <th scope="col" className="py-2 pr-4 font-semibold">Date</th>
                  <th scope="col" className="py-2 pr-4 font-semibold">{t("event")}</th>
                  <th scope="col" className="py-2 pr-4 font-semibold">{t("project")}</th>
                  <th scope="col" className="py-2 pr-4 font-semibold">Mark</th>
                  <th scope="col" className="py-2 font-semibold">Note</th>
                </tr>
              </thead>
              <tbody>
                {marks.map((m) => (
                  <tr key={m.id} className="border-b border-rule">
                    <td className="py-2 pr-4 text-sm whitespace-nowrap">
                      {m.event ? formatRelativeDate(dateInZone(new Date(m.event.starts_at), m.event.all_day ? "UTC" : tz), today) : "—"}
                    </td>
                    <td className="py-2 pr-4">{m.event?.title ?? "—"}</td>
                    <td className="py-2 pr-4 text-sm">{programName(m.event?.project_id ?? null)}</td>
                    <td className="py-2 pr-4">
                      <MarkBadge status={m.status} label={t(`attendance.${m.status}`)} />
                    </td>
                    <td className="py-2 text-sm">{m.note ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="remove-heading" className="flex flex-col gap-3 border-t border-rule pt-6">
        <h2 id="remove-heading" className="text-xl font-bold">
          {archived ? "Restore" : "Remove"}
        </h2>
        <p className="max-w-2xl text-ink-muted">
          {archived
            ? "Restoring puts them back on their rosters and check-in."
            : `Archiving takes them off rosters and check-in but keeps their details and ${lower(t("section.attendance"))}. You can restore them at any time.`}
        </p>
        <ArchiveParticipantButton id={p.id} archived={archived} />
        {rankOf(ctx.role) >= rankOf("manager") ? (
          <div className="flex flex-col gap-2 pt-2">
            <p className="max-w-2xl text-ink-muted">
              For a privacy request, delete them permanently: their details and files are erased and their past marks stay without a name.
            </p>
            <div>
              <DeleteParticipantButton id={p.id} name={p.name} orgSlug={org.slug} />
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

const ACTION_LABELS: Record<ParticipantFileEvent["action"], string> = {
  uploaded: "Added",
  viewed: "Opened",
  downloaded: "Downloaded",
  deleted: "Deleted",
};

/** Who touched which file and when: owners and the file's program leads only (D102). */
function FileAccessLog({
  events,
  tz,
  t,
  programName,
}: {
  events: ParticipantFileEvent[];
  tz: string;
  t: Translate;
  programName: (id: string | null) => string;
}) {
  return (
    <section aria-labelledby="file-access-heading" className="flex flex-col gap-3">
      <h2 id="file-access-heading" className="text-xl font-bold">
        File access
      </h2>
      {events.length === 0 ? (
        <p className="text-ink-muted">Nobody has added or opened a file for them yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-left">
            <caption className="sr-only">Who added, opened, downloaded or deleted their files</caption>
            <thead>
              <tr className="border-b border-ink font-heading text-sm">
                <th scope="col" className="py-2 pr-4 font-semibold">When</th>
                <th scope="col" className="py-2 pr-4 font-semibold">Who</th>
                <th scope="col" className="py-2 pr-4 font-semibold">What</th>
                <th scope="col" className="py-2 font-semibold">File</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id} className="border-b border-rule text-sm">
                  <td className="py-2 pr-4 whitespace-nowrap">
                    {formatTimestamp(e.created_at, tz)}
                  </td>
                  <td className="py-2 pr-4">{e.actor_name ?? `A former ${lower(t("member"))}`}</td>
                  <td className="py-2 pr-4 font-semibold">{ACTION_LABELS[e.action]}</td>
                  <td className="py-2">
                    {e.file_name ?? "A removed file"}
                    <span className="block text-xs text-ink-muted">
                      {FILE_KIND_LABELS[e.file_kind]} · {programName(e.project_id)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
