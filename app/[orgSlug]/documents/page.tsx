import Link from "next/link";
import type { Metadata } from "next";
import { Download, FileText, Pin, PinOff, Search, SearchX, X } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { inputClass } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { UploadButton } from "@/components/documents/upload-form";
import { DeleteDocumentButton, EditDocumentButton } from "@/components/documents/document-actions";
import { FileIcon, fileKind, formatBytes } from "@/components/documents/file-icon";
import { getOrgContext } from "@/lib/org";
import { DOCUMENT_SELECT, getProjectOptions, toPrefixQuery, type DocumentRow } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";
import { formatRelativeDate, dateInZone } from "@/lib/dates";
import { lower } from "@/lib/terminology/t";
import { togglePin } from "./actions";

export async function generateMetadata({ params }: PageProps<"/[orgSlug]/documents">): Promise<Metadata> {
  const { t } = await getOrgContext((await params).orgSlug);
  return { title: t("document", "other") };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function DocumentsPage({ params, searchParams }: PageProps<"/[orgSlug]/documents">) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const ctx = await getOrgContext(orgSlug);
  const { t, org, base, today, tz } = ctx;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 100) : "";
  const project = typeof sp.project === "string" && UUID.test(sp.project) ? sp.project : "";
  const tag = typeof sp.tag === "string" ? sp.tag.toLowerCase().slice(0, 40) : "";

  const supabase = await createClient();
  let query = supabase
    .from("documents")
    .select(DOCUMENT_SELECT)
    .eq("organization_id", org.id)
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(500);
  const tsQuery = toPrefixQuery(q);
  if (tsQuery) query = query.textSearch("search", tsQuery, { config: "simple" });
  if (project) query = query.eq("project_id", project);
  if (tag) query = query.contains("tags", [tag]);

  const [{ data, error }, projects, { count: total }] = await Promise.all([
    query,
    getProjectOptions(org.id),
    supabase.from("documents").select("id", { count: "exact", head: true }).eq("organization_id", org.id),
  ]);
  if (error) throw error;
  const docs = (data ?? []) as DocumentRow[];
  const filtering = Boolean(q || project || tag);
  const plural = t("document", "other");
  const canDelete = (d: DocumentRow) => ctx.isAdmin || d.uploaded_by === ctx.userId;
  const withParams = (patch: Record<string, string>) => {
    const next = new URLSearchParams({ ...(q ? { q } : {}), ...(project ? { project } : {}), ...(tag ? { tag } : {}), ...patch });
    for (const [k, v] of [...next.entries()]) if (!v) next.delete(k);
    const s = next.toString();
    return `${base}/documents${s ? `?${s}` : ""}`;
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={plural} actions={<UploadButton organizationId={org.id} projects={projects} />} />

      <form role="search" aria-label={`Search ${lower(plural)}`} className="flex flex-wrap items-end gap-3 border-b border-rule pb-4">
        <div className="flex min-w-60 flex-[2] flex-col gap-1">
          <label htmlFor="doc-search" className="font-heading text-xs font-semibold text-ink-muted">
            Search by name or tag
          </label>
          <input id="doc-search" name="q" type="search" defaultValue={q} placeholder="e.g. consent, budget" className={`${inputClass} py-1.5`} />
        </div>
        <div className="flex min-w-48 flex-1 flex-col gap-1">
          <label htmlFor="doc-project-filter" className="font-heading text-xs font-semibold text-ink-muted">
            {t("project")}
          </label>
          <select id="doc-project-filter" name="project" defaultValue={project} className={`${inputClass} py-1.5`}>
            <option value="">All</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        {tag ? <input type="hidden" name="tag" value={tag} /> : null}
        <SubmitButton variant="secondary" size="md">
          <Search aria-hidden className="size-4" />
          Search
        </SubmitButton>
        {filtering ? (
          <Link href={`${base}/documents`} className={buttonClass("ghost", "md")}>
            <X aria-hidden className="size-4" />
            Clear
          </Link>
        ) : null}
      </form>

      {tag ? (
        <p className="flex items-center gap-2 text-sm">
          Tagged
          <Badge variant="filled">#{tag}</Badge>
          <Link href={withParams({ tag: "" })} className="underline underline-offset-4">
            Remove tag filter
          </Link>
        </p>
      ) : null}

      {docs.length === 0 ? (
        filtering ? (
          <EmptyState icon={<SearchX />} title={`No ${lower(plural)} match`}>
            Try a shorter search, or clear the filters.
          </EmptyState>
        ) : (
          <EmptyState
            icon={<FileText />}
            title={`No ${lower(plural)} yet`}
            action={<UploadButton organizationId={org.id} projects={projects} />}
          >
            Upload handbooks, forms, schedules and photos so everyone works from the same files.
          </EmptyState>
        )
      ) : (
        <>
          <p className="text-sm text-ink-muted" role="status">
            {filtering ? `${docs.length} of ${total ?? docs.length} ${lower(plural)}` : `${docs.length} ${lower(docs.length === 1 ? t("document") : plural)}`}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left">
              <caption className="sr-only">{plural}</caption>
              <thead>
                <tr className="border-b border-ink font-heading text-sm">
                  <th scope="col" className="py-2 pr-4 font-semibold">Name</th>
                  <th scope="col" className="py-2 pr-4 font-semibold">{t("project")}</th>
                  <th scope="col" className="py-2 pr-4 font-semibold">Tags</th>
                  <th scope="col" className="py-2 pr-4 font-semibold">Added</th>
                  <th scope="col" className="py-2 font-semibold">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {docs.map((d) => (
                  <tr key={d.id} className="border-b border-rule hover:bg-tint">
                    <th scope="row" className="py-2.5 pr-4 font-normal">
                      <div className="flex items-center gap-2.5">
                        <FileIcon mime={d.mime_type} />
                        <div className="min-w-0">
                          <a href={`${base}/documents/${d.id}/download`} className="font-semibold break-all hover:underline">
                            {d.name}
                          </a>
                          <p className="text-sm text-ink-muted">
                            {fileKind(d.mime_type)} · {formatBytes(d.size_bytes)}
                            {d.pinned ? (
                              <span className="ml-2 inline-flex items-center gap-0.5 font-semibold text-ink">
                                <Pin aria-hidden className="size-3" />
                                Pinned
                              </span>
                            ) : null}
                          </p>
                        </div>
                      </div>
                    </th>
                    <td className="py-2.5 pr-4 text-sm">
                      {d.project ? (
                        <Link href={`${base}/projects/${d.project.id}`} className="hover:underline">
                          {d.project.name}
                        </Link>
                      ) : (
                        <span className="text-ink-muted">—</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-4">
                      <ul className="flex flex-wrap gap-1" aria-label="Tags">
                        {d.tags.map((tg) => (
                          <li key={tg}>
                            <Link href={withParams({ tag: tg })} className="rounded-full border border-rule px-2 py-0.5 text-xs hover:border-ink">
                              #{tg}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td className="py-2.5 pr-4 text-sm whitespace-nowrap">
                      {formatRelativeDate(dateInZone(new Date(d.created_at), tz), today)}
                      <span className="block text-ink-muted">{d.uploader?.full_name || d.uploader?.email || "Unknown"}</span>
                    </td>
                    <td className="py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        <a href={`${base}/documents/${d.id}/download`} className={buttonClass("ghost", "sm", "px-2")} aria-label={`Download ${d.name}`} title="Download">
                          <Download aria-hidden className="size-4" />
                        </a>
                        <form action={togglePin}>
                          <input type="hidden" name="id" value={d.id} />
                          <input type="hidden" name="pinned" value={String(!d.pinned)} />
                          <SubmitButton
                            variant="ghost"
                            size="sm"
                            className="px-2"
                            aria-pressed={d.pinned}
                            aria-label={d.pinned ? `Unpin ${d.name}` : `Pin ${d.name}`}
                            title={d.pinned ? "Unpin" : "Pin to dashboard"}
                          >
                            {d.pinned ? <PinOff aria-hidden className="size-4" /> : <Pin aria-hidden className="size-4" />}
                          </SubmitButton>
                        </form>
                        <EditDocumentButton doc={d} projects={projects} />
                        {canDelete(d) ? <DeleteDocumentButton doc={d} /> : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
