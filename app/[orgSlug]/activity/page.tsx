import type { Metadata } from "next";
import Link from "next/link";
import {
  Building2,
  CalendarDays,
  Download,
  FileText,
  FolderKanban,
  ListChecks,
  PiggyBank,
  Users,
  type LucideIcon,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { buttonClass } from "@/components/ui/button";
import { inputClass } from "@/components/ui/field";
import { getMembers, getOrgContext } from "@/lib/org";
import { getProjectOptions } from "@/lib/queries";
import {
  ACTIVITY_ACTIONS,
  filterQuery,
  projectOf,
  queryActivity,
  readActivityFilters,
} from "@/lib/activity-log";
import { activityHref, describeActivity } from "@/lib/activity";
import { formatTimestamp } from "@/lib/dates";

export const metadata: Metadata = { title: "Activity" };

const PAGE = 100;

const ICONS: Record<string, LucideIcon> = {
  project: FolderKanban,
  task: ListChecks,
  event: CalendarDays,
  document: FileText,
  participant: Users,
  fund: PiggyBank,
  organization: Building2,
};

const ACTION_LABELS: Record<(typeof ACTIVITY_ACTIONS)[number], string> = {
  created: "Created",
  uploaded: "Uploaded",
  updated: "Changed",
  moved: "Moved",
  completed: "Finished",
  archived: "Archived",
  restored: "Restored",
  pinned: "Pinned",
  unpinned: "Unpinned",
  deleted: "Deleted",
};

/**
 * The full activity log (D103): who did what, where and when, filtered by
 * person, program, date and kind of change. Everyone sees only what they could
 * see in the app; owners can export what's shown.
 */
export default async function ActivityPage({
  params,
  searchParams,
}: PageProps<"/[orgSlug]/activity">) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const ctx = await getOrgContext(orgSlug);
  const { org, t, base, tz } = ctx;
  const filters = readActivityFilters(sp);
  const before = typeof sp.before === "string" ? sp.before : undefined;
  const [rows, members, projects] = await Promise.all([
    queryActivity(org.id, filters, tz, { limit: PAGE + 1, before }),
    getMembers(org.id),
    getProjectOptions(org.id, true),
  ]);
  const more = rows.length > PAGE;
  const shown = rows.slice(0, PAGE);
  const nameOf = new Map(members.map((m) => [m.id, m.name]));
  const projectName = new Map(projects.map((p) => [p.id, p.name]));
  const query = filterQuery(filters);
  const isOwner = ctx.role === "owner";
  const filtered = Boolean(query);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Activity"
        description="Every change your team makes, kept as a permanent record. You see the changes to things you can see."
        actions={
          isOwner ? (
            <a
              href={`${base}/activity/export${query ? `?${query}` : ""}`}
              className={buttonClass("secondary")}
              download
            >
              <Download aria-hidden className="size-4" />
              Export CSV
            </a>
          ) : undefined
        }
      />

      <form
        method="get"
        className="grid gap-3 border-b border-rule pb-4 sm:grid-cols-2 lg:grid-cols-[repeat(5,minmax(0,1fr))_auto]"
        aria-label="Filter activity"
      >
        <div className="flex flex-col gap-1">
          <label
            htmlFor="activity-person"
            className="font-heading text-sm font-semibold"
          >
            Person
          </label>{" "}
          <select
            id="activity-person"
            name="person"
            defaultValue={filters.person ?? ""}
            className={inputClass}
          >
            <option value="">Anyone</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label
            htmlFor="activity-project"
            className="font-heading text-sm font-semibold"
          >
            {t("project")}
          </label>{" "}
          <select
            id="activity-project"
            name="project"
            defaultValue={filters.project ?? ""}
            className={inputClass}
          >
            <option value="">All</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label
            htmlFor="activity-action"
            className="font-heading text-sm font-semibold"
          >
            Change
          </label>{" "}
          <select
            id="activity-action"
            name="action"
            defaultValue={filters.action ?? ""}
            className={inputClass}
          >
            <option value="">Any</option>
            {ACTIVITY_ACTIONS.map((a) => (
              <option key={a} value={a}>
                {ACTION_LABELS[a]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label
            htmlFor="activity-from"
            className="font-heading text-sm font-semibold"
          >
            From
          </label>{" "}
          <input
            id="activity-from"
            type="date"
            name="from"
            defaultValue={filters.from ?? ""}
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label
            htmlFor="activity-to"
            className="font-heading text-sm font-semibold"
          >
            To
          </label>{" "}
          <input
            id="activity-to"
            type="date"
            name="to"
            defaultValue={filters.to ?? ""}
            className={inputClass}
          />
        </div>
        <div className="flex items-end gap-2">
          <button type="submit" className={buttonClass("primary")}>
            Apply
          </button>
          {filtered ? (
            <Link href={`${base}/activity`} className={buttonClass("ghost")}>
              Clear
            </Link>
          ) : null}
        </div>
      </form>

      {shown.length === 0 ? (
        <p className="text-ink-muted">
          {filtered ? "Nothing matches these filters." : "No activity yet."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left">
            <caption className="sr-only">Activity, newest first</caption>
            <thead>
              <tr className="border-b border-ink font-heading text-sm">
                <th scope="col" className="py-2 pr-4 font-semibold">
                  When
                </th>
                <th scope="col" className="py-2 pr-4 font-semibold">
                  Who
                </th>
                <th scope="col" className="py-2 pr-4 font-semibold">
                  What
                </th>
                <th scope="col" className="py-2 font-semibold">
                  Where
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((a) => {
                const Icon = ICONS[a.entity_type] ?? ListChecks;
                const who =
                  (a.actor_membership_id &&
                    nameOf.get(a.actor_membership_id)) ||
                  a.metadata.actor_name ||
                  "Someone";
                const href = activityHref(a, base);
                const project = projectOf(a);
                const label = a.metadata.label;
                return (
                  <tr key={a.id} className="border-b border-rule align-top">
                    <td className="py-2.5 pr-4 text-sm whitespace-nowrap">
                      <time dateTime={a.created_at}>
                        {formatTimestamp(a.created_at, tz)}
                      </time>
                    </td>
                    <td className="py-2.5 pr-4 text-sm">{who}</td>
                    <td className="py-2.5 pr-4">
                      <span className="inline-flex items-start gap-2">
                        <Icon
                          aria-hidden
                          className="mt-0.5 size-4 shrink-0 text-accent"
                        />
                        <span>{describeActivity(a, t)}</span>
                      </span>
                    </td>
                    <td className="py-2.5 text-sm">
                      {label ? (
                        href ? (
                          <Link
                            href={href}
                            className="font-semibold hover:underline"
                          >
                            {label}
                          </Link>
                        ) : (
                          <span className="font-semibold">{label}</span>
                        )
                      ) : null}
                      {project && a.entity_type !== "project" ? (
                        <span className="block text-ink-muted">
                          in{" "}
                          {projectName.get(project) ??
                            `a ${t("project").toLowerCase()} you can't see`}
                        </span>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {more ? (
        <div>
          <Link
            href={`${base}/activity?${new URLSearchParams({ ...Object.fromEntries(new URLSearchParams(query)), before: shown[shown.length - 1]!.created_at }).toString()}`}
            className={buttonClass("secondary")}
          >
            Show older
          </Link>
        </div>
      ) : null}
    </div>
  );
}
